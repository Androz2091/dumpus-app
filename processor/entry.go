package processor

import (
	"archive/zip"
	"bufio"
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"hash"
	"hash/crc32"
	"io"
	"math"
	"slices"
	"sync"
	"sync/atomic"

	"github.com/klauspost/compress/flate"
	"golang.org/x/sync/errgroup"
)

const maxReadBuf = 1 << 20

var errSharedData = errors.New("zip: entries share compressed data")

type pkg struct {
	*entries
	r       io.ReaderAt
	lim     limits
	iss     *issues
	allowed map[*zip.File]bool       // the entries within the inflate budget
	reads   []*zip.File              // the same, in the order the budget allowed them
	data    map[*zip.File]dataRange  // where the compressed data of each allowed entry lies, see locate
	shared  map[*zip.File]*wholeRead // the entries several roles name, see share
	skipped atomic.Bool              // an entry, folder or line was left out: the package is partial
}

type dataRange struct{ start, end int64 }

// wholeRead is an entry read whole once for every role that names it.
type wholeRead struct {
	once sync.Once
	data []byte
	ok   bool
	err  error
}

func newPkg(zr *zip.Reader, r io.ReaderAt, lim limits, iss *issues) *pkg {
	return &pkg{entries: indexEntries(zr), r: r, lim: lim, iss: iss, allowed: map[*zip.File]bool{}, shared: map[*zip.File]*wholeRead{}}
}

// share marks the entries that more than one of the roles names, which only a
// crafted package does, for eg. an `index.json` in an `analytics` folder taken
// for the activity stream and both indexes: such an entry is read whole once,
// for all of them, the stream included.
func (p *pkg) share(roles ...string) {
	seen := map[*zip.File]bool{}
	for _, name := range roles {
		f := p.get(name)
		if name == "" || f == nil {
			continue
		}
		if seen[f] {
			p.shared[f] = &wholeRead{}
		}
		seen[f] = true
	}
}

// budget allows each entry, in a fixed order, whose declared size still fits in
// what is left of total, so that what gets skipped doesn't depend on timing.
// The declared size holds since an entry fails as soon as it inflates past it.
func (p *pkg) budget(order []*zip.File, total uint64) {
	var used uint64
	for _, f := range order {
		if p.allowed[f] {
			continue
		}
		if f.UncompressedSize64 > total-used {
			p.skip(f, ProblemOverBudget)
			continue
		}
		used += f.UncompressedSize64
		p.allowed[f] = true
		p.reads = append(p.reads, f)
	}
}

// locate reads the local header of each allowed entry, on up to workers
// goroutines, to find where its data lies, and fails a package two of whose
// allowed entries share compressed data, as Python's `zipfile` refuses
// overlapped entries. It runs before any data is read: entries pointing at one
// stream would each read it again, as much as they declare.
func (p *pkg) locate(ctx context.Context, workers int) error {
	found := make([]dataRange, len(p.reads))
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(workers)
	for i, f := range p.reads {
		g.Go(func() error {
			if err := ctx.Err(); err != nil {
				return err
			}
			d, err := dataOf(f)
			if err != nil {
				return fmt.Errorf("%s: %w", maskPath(f.Name), err)
			}
			found[i] = d
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return err
	}
	p.data = make(map[*zip.File]dataRange, len(p.reads))
	ranges := make([]dataRange, 0, len(p.reads))
	for i, f := range p.reads {
		p.data[f] = found[i]
		if found[i].end > found[i].start {
			ranges = append(ranges, found[i])
		}
	}
	return checkRanges(ranges)
}

// dataOf is where the compressed data of an entry lies. A size that would end
// the data past the largest offset, which only a crafted package declares,
// fails the package rather than escape checkRanges.
func dataOf(f *zip.File) (dataRange, error) {
	start, err := f.DataOffset()
	if err != nil {
		return dataRange{}, err
	}
	if f.CompressedSize64 > math.MaxInt64 {
		return dataRange{}, zip.ErrFormat
	}
	size := int64(f.CompressedSize64)
	if size > math.MaxInt64-start {
		return dataRange{}, zip.ErrFormat
	}
	return dataRange{start: start, end: start + size}, nil
}

func checkRanges(ranges []dataRange) error {
	slices.SortFunc(ranges, func(a, b dataRange) int { return cmp.Compare(a.start, b.start) })
	for i := 1; i < len(ranges); i++ {
		if ranges[i].start < ranges[i-1].end {
			return errSharedData
		}
	}
	return nil
}

// skip reports an entry the processor leaves out, a duplicate or past a limit,
// which makes the package partial.
func (p *pkg) skip(f *zip.File, problem Problem) {
	p.iss.add(f.Name, "", problem, 1)
	p.skipped.Store(true)
}

// readWhole reads and checks a whole entry, once for all the roles that share
// it. ok is false when a limit skipped it, which is reported; errors name the
// entry by its masked path. The data must not be changed.
func (p *pkg) readWhole(f *zip.File) (data []byte, ok bool, err error) {
	if w := p.shared[f]; w != nil {
		w.once.Do(func() { w.data, w.ok, w.err = p.inflateWhole(f) })
		return w.data, w.ok, w.err
	}
	return p.inflateWhole(f)
}

func (p *pkg) inflateWhole(f *zip.File) (data []byte, ok bool, err error) {
	switch {
	case !p.allowed[f]:
		return nil, false, nil
	case f.UncompressedSize64 > p.lim.entryBytes:
		p.skip(f, ProblemTooLarge)
		return nil, false, nil
	}
	e, err := p.open(f, true)
	if err != nil {
		return nil, false, fmt.Errorf("%s: %w", maskPath(f.Name), err)
	}
	defer e.Close()
	buf := bytes.NewBuffer(make([]byte, 0, f.UncompressedSize64+bytes.MinRead))
	if _, err := buf.ReadFrom(e); err != nil {
		return nil, false, fmt.Errorf("%s: %w", maskPath(f.Name), err)
	}
	return buf.Bytes(), true, nil
}

// open inflates an allowed entry from where locate found its data.
func (p *pkg) open(f *zip.File, checksum bool) (*entryReader, error) {
	d, ok := p.data[f]
	if !ok {
		return nil, fmt.Errorf("%s: read before it was located", maskPath(f.Name))
	}
	return newEntryReader(f, io.NewSectionReader(p.r, d.start, d.end-d.start), checksum)
}

// entryReader inflates a zip entry, reading its compressed data through a
// buffer sized to it: a small entry costs one `ReadAt` for its header and one
// for its data, a large one a `ReadAt` per MiB. `zip.File.Open` makes one per
// 4 KiB, a request each when the package is read over HTTP. It fails as soon as
// the entry yields more than its declared size.
type entryReader struct {
	r     io.Reader
	close func() error
	f     *zip.File
	n     uint64
	crc   hash.Hash32 // nil when the caller checksums the data itself
}

func newEntryReader(f *zip.File, raw io.Reader, checksum bool) (*entryReader, error) {
	br := bufio.NewReaderSize(raw, int(min(max(f.CompressedSize64, 16), maxReadBuf)))
	e := &entryReader{f: f, close: func() error { return nil }}
	switch f.Method {
	case zip.Store:
		e.r = br
	case zip.Deflate:
		fr := flate.NewReader(br)
		e.r, e.close = fr, fr.Close
	default:
		return nil, fmt.Errorf("%w: compression method %d", zip.ErrAlgorithm, f.Method)
	}
	if checksum {
		e.crc = crc32.NewIEEE()
	}
	return e, nil
}

func (e *entryReader) Read(p []byte) (int, error) {
	n, err := e.r.Read(p)
	e.n += uint64(n)
	if e.n > e.f.UncompressedSize64 {
		return 0, fmt.Errorf("%w: more data than the declared size", zip.ErrFormat)
	}
	if e.crc != nil {
		e.crc.Write(p[:n])
	}
	if err == io.EOF {
		if e.n != e.f.UncompressedSize64 {
			return n, io.ErrUnexpectedEOF
		}
		if e.crc != nil && e.f.CRC32 != 0 && e.crc.Sum32() != e.f.CRC32 {
			return n, zip.ErrChecksum
		}
	}
	return n, err
}

func (e *entryReader) Close() error { return e.close() }
