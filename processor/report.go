package processor

import (
	"cmp"
	"regexp"
	"slices"
	"sync"
)

// Report lists what a package lacked compared to what the parser expects, as
// entry paths and counts. It never holds a value read from the package: paths
// have their digit runs masked, and event types and fields come from the
// parser's own vocabulary.
type Report struct {
	// Error is the code when the package could not be processed, one of
	// [CodeMissingUserData] and [CodeUnknownError].
	Error ErrorCode `json:"error,omitempty"`
	// Inputs has the entry found for each role, also when a limit skipped
	// it.
	Inputs Inputs `json:"inputs"`
	// MissingFiles lists the roles of expected entries that were not found.
	MissingFiles []MissingFile `json:"missing_files"`
	// Issues counts missing or unusable fields per entry.
	Issues    []Issue `json:"issues"`
	Counts    Counts  `json:"counts"`
	TimingsMS Timings `json:"timings_ms"`
}

func newReport() *Report {
	return &Report{MissingFiles: []MissingFile{}, Issues: []Issue{}}
}

// Inputs are the masked paths of the entries found, per role; a role without
// one is left out.
type Inputs struct {
	Activity      string `json:"activity,omitempty"`
	MessagesIndex string `json:"messages_index,omitempty"`
	Payments      string `json:"payments,omitempty"`
	ServersIndex  string `json:"servers_index,omitempty"`
	User          string `json:"user,omitempty"`
}

// MissingFile is an expected entry that the package does not have.
type MissingFile struct {
	Role Role   `json:"role"`
	Path string `json:"path"`
}

// Role is what the processor reads an entry for.
type Role string

// The roles a MissingFile can have.
const (
	RoleUser          Role = "user"
	RoleActivity      Role = "activity"
	RoleServersIndex  Role = "servers_index"
	RoleMessagesIndex Role = "messages_index"
)

// Issue counts the occurrences of one problem with one field.
type Issue struct {
	Path      string  `json:"path"`
	EventType string  `json:"event_type,omitempty"`
	Field     string  `json:"field,omitempty"`
	Problem   Problem `json:"problem"`
	Count     int     `json:"count"`
}

// Counts are sizes of what was read and produced.
type Counts struct {
	ActivityLines  int64 `json:"activity_lines"`
	ActivityEvents int64 `json:"activity_events"`
	ChannelFiles   int   `json:"channel_files"`
	DMChannels     int   `json:"dm_channels"`
	GuildChannels  int   `json:"guild_channels"`
	Messages       int64 `json:"messages"`
	Guilds         int   `json:"guilds"`
	Payments       int   `json:"payments"`
	Sessions       int   `json:"sessions"`
	VoiceSessions  int   `json:"voice_sessions"`
	ActivityRows   int   `json:"activity_rows"`
	Relationships  int   `json:"relationships"`
	// InsecurePaths counts the names `archive/zip` calls insecure: not a local
	// path, for eg. absolute or climbing out with `..`, or holding a
	// backslash. Names are never used as paths on disk.
	InsecurePaths int `json:"insecure_paths"`
}

// Timings are the milliseconds each step took; a step that didn't run is
// left out.
type Timings struct {
	Activity *int64 `json:"activity,omitempty"`
	Build    *int64 `json:"build,omitempty"`
	Files    *int64 `json:"files,omitempty"`
	Total    int64  `json:"total"`
}

// Problem is what an Issue reports.
type Problem string

// Problems an Issue can report.
const (
	ProblemMissing      Problem = "missing"       // the key is absent
	ProblemNull         Problem = "null"          // the key holds null where a value is required
	ProblemWrongType    Problem = "wrong_type"    // the value has an unexpected JSON type
	ProblemUnparseable  Problem = "unparseable"   // a timestamp the reference can't read
	ProblemMalformed    Problem = "malformed"     // the entry or line is not valid JSON
	ProblemMixedFormats Problem = "mixed_formats" // a channel mixes timestamp formats or offsets
	ProblemSelfDM       Problem = "self_dm"       // a DM whose recipients are all the owner
	ProblemDuplicate    Problem = "duplicate"     // a channel folder that reads an entry already read, skipped
	ProblemNoEventRead  Problem = "no_event_read" // a stream where events failed and none was read
	// Limits on what a crafted package can cost; see limits.
	ProblemTooLarge      Problem = "too_large"       // an entry over the size read whole, skipped
	ProblemOverBudget    Problem = "over_budget"     // an entry past the total inflate budget, skipped
	ProblemTooLong       Problem = "too_long"        // activity lines over the length decoded, skipped
	ProblemTooManyEvents Problem = "too_many_events" // an activity stream over the event limit, set aside
)

var digitRuns = regexp.MustCompile(`[0-9]{3,}`)

// maskPath hides the ids and dates in an entry path.
func maskPath(p string) string { return digitRuns.ReplaceAllString(p, "*") }

type issueKey struct {
	path, eventType, field string
	problem                Problem
}

// issues is a concurrency-safe Issue counter.
type issues struct {
	mu sync.Mutex
	m  map[issueKey]int
}

// add counts an issue of an entry; the activity stream's issues, which carry
// an event type, are counted per chunk and merged.
func (s *issues) add(path, field string, problem Problem, n int) {
	if n == 0 {
		return
	}
	s.mu.Lock()
	if s.m == nil {
		s.m = map[issueKey]int{}
	}
	s.m[issueKey{path: maskPath(path), field: field, problem: problem}] += n
	s.mu.Unlock()
}

func (s *issues) merge(local map[issueKey]int) {
	s.mu.Lock()
	if s.m == nil {
		s.m = map[issueKey]int{}
	}
	for k, n := range local {
		s.m[k] += n
	}
	s.mu.Unlock()
}

func (s *issues) list() []Issue {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]Issue, 0, len(s.m))
	for k, n := range s.m {
		out = append(out, Issue{Path: k.path, EventType: k.eventType, Field: k.field, Problem: k.problem, Count: n})
	}
	slices.SortFunc(out, func(a, b Issue) int {
		return cmp.Or(cmp.Compare(a.Path, b.Path), cmp.Compare(a.EventType, b.EventType),
			cmp.Compare(a.Field, b.Field), cmp.Compare(a.Problem, b.Problem))
	})
	return out
}
