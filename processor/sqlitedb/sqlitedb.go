// Package sqlitedb writes a `processor.Model` to the SQLite file the Dumpus app
// opens, with the Python worker's schema (the same DDL text, index names and
// column storage classes) plus `package_data.activity_stream`,
// `guilds.member_count` and the group DM tables.
package sqlitedb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"github.com/dumpus-app/dumpus-app/processor"
	"github.com/dumpus-app/dumpus-app/processor/sqlschema"
)

// Result is what Write did.
type Result struct {
	// DroppedRows counts, per table, the rows the schema refused, for eg. a
	// NULL in a NOT NULL column.
	DroppedRows DroppedRows
}

// DroppedRows has a count per table, under the table's name; a table with
// none is left out.
type DroppedRows struct {
	Activity        int `json:"activity,omitempty"`
	DMChannels      int `json:"dm_channels_data,omitempty"`
	GroupDMChannels int `json:"group_dm_channels_data,omitempty"`
	GroupDMMembers  int `json:"group_dm_members,omitempty"`
	GuildChannels   int `json:"guild_channels_data,omitempty"`
	Guilds          int `json:"guilds,omitempty"`
	PackageData     int `json:"package_data,omitempty"`
	Payments        int `json:"payments,omitempty"`
	Sessions        int `json:"sessions,omitempty"`
	VoiceSessions   int `json:"voice_sessions,omitempty"`
}

// of is the count of a table, by its name in sqlschema.
func (d *DroppedRows) of(table string) *int {
	switch table {
	case "activity":
		return &d.Activity
	case "dm_channels_data":
		return &d.DMChannels
	case "group_dm_channels_data":
		return &d.GroupDMChannels
	case "group_dm_members":
		return &d.GroupDMMembers
	case "guild_channels_data":
		return &d.GuildChannels
	case "guilds":
		return &d.Guilds
	case "package_data":
		return &d.PackageData
	case "payments":
		return &d.Payments
	case "sessions":
		return &d.Sessions
	case "voice_sessions":
		return &d.VoiceSessions
	}
	panic("sqlitedb: no DroppedRows count for table " + table)
}

// Write creates the database at path, replacing any file there, and syncs it
// to disk. A row the schema refuses is skipped and counted in the Result.
func Write(ctx context.Context, path string, m *processor.Model) (*Result, error) {
	for _, p := range []string{path, path + "-journal"} {
		if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	}
	// The file holds a user's data: it is created private, and SQLite gives
	// its journal the same mode.
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	if err := f.Close(); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", dsn(path))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	dropped, err := writeModel(ctx, db, m)
	// The database is closed on every path, and an error closing it counts
	// once the rows are in.
	if cerr := db.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		return nil, err
	}
	return &Result{DroppedRows: dropped}, syncFile(path)
}

// dsn opens every connection with a rollback journal, never WAL, and with
// `VACUUM`'s scratch copy in memory rather than in the system temp directory.
// Durability comes from syncing the finished file once.
func dsn(path string) string {
	p := filepath.ToSlash(path)
	if filepath.IsAbs(path) && !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	u := url.URL{
		Scheme: "file", OmitHost: true, Path: p,
		RawQuery: "_pragma=journal_mode(DELETE)&_pragma=synchronous(OFF)&_pragma=temp_store(MEMORY)",
	}
	return u.String()
}

func syncFile(path string) error {
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return err
	}
	err = f.Sync()
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return err
}

func writeModel(ctx context.Context, db *sql.DB, m *processor.Model) (DroppedRows, error) {
	for _, ddl := range sqlschema.Tables {
		if _, err := db.ExecContext(ctx, ddl); err != nil {
			return DroppedRows{}, err
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return DroppedRows{}, err
	}
	// Once committed, rolling back does nothing; before, the error returned is
	// the one that stopped the inserts.
	defer func() { _ = tx.Rollback() }()
	var dropped DroppedRows
	for _, ins := range sqlschema.Inserts(m) {
		if err := insertRows(ctx, tx, ins, dropped.of(ins.Table)); err != nil {
			return DroppedRows{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return DroppedRows{}, err
	}
	for _, ddl := range sqlschema.Indexes {
		if _, err := db.ExecContext(ctx, ddl); err != nil {
			return DroppedRows{}, err
		}
	}
	if _, err := db.ExecContext(ctx, "VACUUM"); err != nil {
		return DroppedRows{}, err
	}
	return dropped, nil
}

// insertRows inserts a table's rows, counting those the schema refuses in
// dropped. An error closing the statement counts once the rows are in.
func insertRows(ctx context.Context, tx *sql.Tx, ins sqlschema.Insert, dropped *int) (err error) {
	stmt, err := tx.PrepareContext(ctx, ins.Query)
	if err != nil {
		return err
	}
	defer func() {
		if cerr := stmt.Close(); err == nil {
			err = cerr
		}
	}()
	for i := range ins.N {
		row, err := ins.Row(i)
		if err != nil {
			return fmt.Errorf("insert into %s: %w", ins.Table, err)
		}
		args := make([]any, len(row)) //nolint:forbidigo // database/sql takes its arguments as `...any`
		for j, v := range row {
			args[j] = v
		}
		if _, err := stmt.ExecContext(ctx, args...); err != nil {
			if !isConstraint(err) {
				return fmt.Errorf("insert into %s: %w", ins.Table, err)
			}
			*dropped++
		}
	}
	return nil
}

func isConstraint(err error) bool {
	var se *sqlite.Error
	return errors.As(err, &se) && se.Code()&0xff == sqlite3.SQLITE_CONSTRAINT
}
