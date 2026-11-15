//go:build js && wasm

// Command dumpus-wasm is the processor for the app: built for the browser, it
// reads a package the device holds and hands its rows to JavaScript, which
// writes the database with sql.js. It sets `globalThis.dumpusProcessor`:
//
//   - version: the PackageVersion it writes.
//   - schema(): JSON `{tables, indexes}`, the statements creating the database.
//   - process(size, readAt, secret, onRows, onProgress): reads the package,
//     calling readAt(offset, length) for its bytes (a Uint8Array, shorter at
//     its end), onProgress(percent) as the reading goes, a whole percent at a
//     time, and onRows(table, query, rows) for every batch of a table's rows,
//     rows being a JSON array of arrays. Returns JSON `{packageId}`, or
//     `{error, message}` with the code the API answers for a failed package.
//     The package's id is the MD5 of secret, the key the app encrypts the
//     database with, as the API derives it from the key of a link.
package main

import (
	"context"
	"crypto/md5" //nolint:gosec // G501: the API names a package by the MD5 of its key
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"sync/atomic"
	"syscall/js"

	"github.com/dumpus-app/dumpus-app/processor"
	"github.com/dumpus-app/dumpus-app/processor/sqlschema"
)

// Rows per call of onRows: a call has a cost of its own, a large batch holds
// a table's rows twice, as Go values and as JSON.
const batch = 2000

// jsReaderAt reads the package through the page's readAt.
type jsReaderAt struct{ readAt js.Value }

func (r jsReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	n := js.CopyBytesToGo(p, r.readAt.Invoke(float64(off), len(p)))
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func main() {
	schema, _ := json.Marshal(map[string][]string{
		"tables":  sqlschema.Tables,
		"indexes": sqlschema.Indexes,
	})
	// syscall/js takes and returns its values as `any`.
	dumpus := js.Global().Get("Object").New()
	dumpus.Set("version", processor.PackageVersion)
	dumpus.Set("schema", js.FuncOf(func(js.Value, []js.Value) any { //nolint:forbidigo // syscall/js's signature
		return string(schema)
	}))
	dumpus.Set("process", js.FuncOf(func(_ js.Value, args []js.Value) any { //nolint:forbidigo // syscall/js's signature
		return string(process(int64(args[0].Float()), jsReaderAt{args[1]}, args[2].String(), args[3], args[4]))
	}))
	js.Global().Set("dumpusProcessor", dumpus)
	// The functions answer for as long as the page keeps the module.
	select {}
}

func process(size int64, r io.ReaderAt, secret string, onRows, onProgress js.Value) (out []byte) {
	sum := md5.Sum([]byte(secret)) //nolint:gosec // G401: an id, not a protection
	packageID := hex.EncodeToString(sum[:])
	fail := func(code processor.ErrorCode, message string) []byte {
		b, _ := json.Marshal(map[string]string{"error": string(code), "message": message})
		return b
	}
	// A panic would end the module, and with it every later call.
	defer func() {
		if p := recover(); p != nil {
			out = fail(processor.CodeUnknownError, fmt.Sprint(p))
		}
	}()

	// A whole percent at a time: each call into JavaScript has a cost.
	var shown atomic.Int64
	shown.Store(-1)
	progress := func(done, total int64) {
		percent := done * 100 / max(total, 1)
		for old := shown.Load(); percent > old; old = shown.Load() {
			if shown.CompareAndSwap(old, percent) {
				onProgress.Invoke(percent)
				return
			}
		}
	}

	// One goroutine decodes: WebAssembly runs Go on a single thread.
	res, err := processor.Process(context.Background(), r, size,
		processor.Options{PackageID: packageID, Workers: 1, Progress: progress})
	if err != nil {
		return fail(res.Report.Error, err.Error())
	}
	for _, ins := range sqlschema.Inserts(res.Model) {
		rows := make([][]driver.Value, 0, min(batch, ins.N))
		for i := range ins.N {
			row, err := ins.Row(i)
			if err != nil {
				return fail(processor.CodeUnknownError, err.Error())
			}
			rows = append(rows, row)
			if len(rows) == batch || i == ins.N-1 {
				b, err := json.Marshal(rows)
				if err != nil {
					return fail(processor.CodeUnknownError, err.Error())
				}
				onRows.Invoke(ins.Table, ins.Query, string(b))
				rows = rows[:0]
			}
		}
	}
	b, _ := json.Marshal(map[string]string{"packageId": packageID})
	return b
}
