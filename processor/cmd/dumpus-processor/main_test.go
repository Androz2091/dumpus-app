package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/dumpus-app/dumpus-app/processor"
)

type entry struct{ name, body string }

// writeZip writes a made-up package to dir, its entries in the given order.
func writeZip(t *testing.T, dir string, entries []entry) string {
	t.Helper()
	path := filepath.Join(dir, "package.zip")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for _, e := range entries {
		w, err := zw.Create(e.name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(e.body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func readReport(t *testing.T, path string) report {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var r report
	if err := json.Unmarshal(data, &r); err != nil {
		t.Fatal(err)
	}
	return r
}

var minimalPackage = []entry{
	{"Compte/user.json", `{"id": "100000000000000001", "username": "owner_user", "email": "x", "avatar_hash": null, "relationships": []}`},
	{"Serveurs/index.json", `{"300000000000000001": "Guild One"}`},
	{"Messages/index.json", `{}`},
	{"Activité/analytics/e", ""},
}

func TestRun(t *testing.T) {
	dir := t.TempDir()
	input := writeZip(t, dir, minimalPackage)
	output := filepath.Join(dir, "out.sqlite")
	reportPath := filepath.Join(dir, "report.json")
	var stderr bytes.Buffer
	code := run(t.Context(), []string{"--input", input, "--output", output, "--package-id", "pkg-test", "--report", reportPath}, &stderr)
	// The worker (`api/src/tasks.py`) matches 0, 3 and 4 as numbers, so the
	// tests do too: renumbering one breaks the worker, not these constants.
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr.String())
	}
	if _, err := os.Stat(output); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(output + ".tmp"); !os.IsNotExist(err) {
		t.Errorf("temporary file left: %v", err)
	}
	r := readReport(t, reportPath)
	if r.Error != "" {
		t.Errorf("report has an error: %s", r.Error)
	}
	if !slices.ContainsFunc(r.MissingFiles, func(f processor.MissingFile) bool { return f.Role == "activity" }) {
		t.Errorf("missing files = %+v", r.MissingFiles)
	}
}

func TestRunMissingUserData(t *testing.T) {
	dir := t.TempDir()
	input := writeZip(t, dir, []entry{
		{"Mensajes/index.json", `{}`},
		{"Mensajes/c400000000000000001/channel.json", `{"id": "400000000000000001"}`},
		{"Mensajes/c400000000000000001/messages.json", `[]`},
	})
	output := filepath.Join(dir, "out.sqlite")
	reportPath := filepath.Join(dir, "report.json")
	var stderr bytes.Buffer
	code := run(t.Context(), []string{"--input", input, "--output", output, "--package-id", "pkg-test", "--report", reportPath}, &stderr)
	if code != 3 {
		t.Fatalf("exit %d, want 3", code)
	}
	if got := strings.TrimSpace(stderr.String()); got != `{"error":"MISSING_USER_DATA"}` {
		t.Errorf("stderr = %q", got)
	}
	if _, err := os.Stat(output); !os.IsNotExist(err) {
		t.Errorf("output written: %v", err)
	}
	if r := readReport(t, reportPath); r.Error != "MISSING_USER_DATA" {
		t.Errorf("report error = %s", r.Error)
	}
}

func TestRunReportFailure(t *testing.T) {
	dir := t.TempDir()
	input := writeZip(t, dir, minimalPackage)
	output := filepath.Join(dir, "out.sqlite")
	var stderr bytes.Buffer
	code := run(t.Context(), []string{
		"--input", input, "--output", output, "--package-id", "pkg-test",
		"--report", filepath.Join(dir, "missing", "report.json"),
	}, &stderr)
	if code != 4 {
		t.Fatalf("exit %d, want 4: %s", code, stderr.String())
	}
	if _, err := os.Stat(output); err != nil {
		t.Errorf("database not in place: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(stderr.String()), "\n")
	var fail failure
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &fail); err != nil || fail.Error != "REPORT_FAILED" {
		t.Errorf("stderr = %q", stderr.String())
	}
}

func TestRunErrors(t *testing.T) {
	dir := t.TempDir()
	var stderr bytes.Buffer
	// Go exits 2 on a panic, so a usage error has its own code.
	if code := run(t.Context(), []string{"--input", "x.zip"}, &stderr); code != 64 {
		t.Errorf("missing flags: exit %d", code)
	}
	if code := run(t.Context(), []string{"-h"}, &stderr); code != 0 {
		t.Errorf("-h: exit %d", code)
	}
	notZip := filepath.Join(dir, "not.zip")
	if err := os.WriteFile(notZip, []byte("not a zip"), 0o600); err != nil {
		t.Fatal(err)
	}
	stderr.Reset()
	code := run(t.Context(), []string{"--input", notZip, "--output", filepath.Join(dir, "o.sqlite"), "--package-id", "p"}, &stderr)
	if code != exitFailed {
		t.Errorf("not a zip: exit %d", code)
	}
	lines := strings.Split(strings.TrimSpace(stderr.String()), "\n")
	var fail failure
	if err := json.Unmarshal([]byte(lines[len(lines)-1]), &fail); err != nil || fail.Error != "UNKNOWN_ERROR" {
		t.Errorf("stderr = %q", stderr.String())
	}
}
