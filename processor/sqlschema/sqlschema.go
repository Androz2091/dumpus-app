// Package sqlschema is the database the Dumpus app opens: the statements that
// create it, and the rows of a processor.Model as plain values. The server
// writes them with modernc.org/sqlite (package sqlitedb), the app with sql.js
// (cmd/dumpus-wasm), so a package gives the same database either way. It
// imports no SQLite, so it builds for WebAssembly too.
package sqlschema

import (
	"database/sql/driver"
	"fmt"

	"github.com/dumpus-app/dumpus-app/processor"
)

// Tables are the statements that create the tables. The DDL is the worker's
// text as is, so `sqlite_master` reads the same,
// except for the columns the worker never wrote, `package_data.activity_stream`
// and `guilds.member_count`, each added after the worker's own, and the tables
// it never wrote, `group_dm_channels_data` and `group_dm_members`, added after
// its tables.
var Tables = []string{`
        CREATE TABLE activity (
            event_name TEXT NOT NULL,
            day TEXT NOT NULL,
            hour INTEGER,
            occurence_count INTEGER NOT NULL,
            associated_user_id TEXT,
            associated_channel_id TEXT,
            associated_guild_id TEXT,
            extra_field_1 TEXT,
            extra_field_2 TEXT,
            PRIMARY KEY (event_name, day, hour, associated_channel_id, associated_guild_id, associated_user_id, extra_field_1)
        )
    `, `
        CREATE TABLE dm_channels_data (
            channel_id TEXT NOT NULL,
            dm_user_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            display_name TEXT,
            user_avatar_url TEXT,
            total_message_count INTEGER NOT NULL,
            total_voice_channel_duration INTEGER NOT NULL,
            sentiment_score REAL NOT NULL,
            PRIMARY KEY (channel_id)
        )
    `, `
        CREATE TABLE guild_channels_data (
            channel_id TEXT NOT NULL,
            channel_name TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            total_message_count INTEGER NOT NULL,
            total_voice_channel_duration INTEGER NOT NULL,
            PRIMARY KEY (channel_id)
        )
    `, `
        CREATE TABLE guilds (
            guild_id TEXT NOT NULL,
            guild_name TEXT NOT NULL,
            total_message_count INTEGER NOT NULL,
            member_count INTEGER,
            PRIMARY KEY (guild_id)
        )
    `, `
        CREATE TABLE payments (
            payment_id TEXT NOT NULL,
            payment_date TEXT NOT NULL,
            payment_amount INTEGER NOT NULL,
            payment_currency TEXT NOT NULL,
            payment_description TEXT NOT NULL,
            PRIMARY KEY (payment_id)
        )
    `, `
        CREATE TABLE voice_sessions (
            channel_id TEXT NOT NULL,
            guild_id TEXT,
            duration_mins INTEGER NOT NULL,
            started_date TEXT NOT NULL,
            ended_date TEXT NOT NULL,
            PRIMARY KEY (channel_id, started_date)
        )
    `, `
        CREATE TABLE sessions (
            started_date TEXT NOT NULL,
            ended_date TEXT NOT NULL,
            duration_mins INTEGER NOT NULL,
            device_os TEXT NOT NULL
        )
    `, `
        CREATE TABLE package_data (
            package_id TEXT NOT NULL,
            package_version TEXT NOT NULL,
            package_owner_id TEXT NOT NULL,
            package_owner_name TEXT NOT NULL,
            package_owner_display_name TEXT,
            package_owner_avatar_url TEXT,
            package_is_partial BOOLEAN NOT NULL DEFAULT 0,
            activity_stream TEXT
        )
    `, `
        CREATE TABLE group_dm_channels_data (
            channel_id TEXT NOT NULL,
            channel_name TEXT,
            member_count INTEGER NOT NULL,
            total_message_count INTEGER NOT NULL,
            PRIMARY KEY (channel_id)
        )
    `, `
        CREATE TABLE group_dm_members (
            channel_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            user_name TEXT,
            display_name TEXT,
            user_avatar_url TEXT,
            PRIMARY KEY (channel_id, user_id)
        )
    `}

// Indexes are the statements that create the indexes, once the rows are in.
var Indexes = []string{
	`CREATE INDEX idx_activity_event_guild_day ON activity (event_name, associated_guild_id, day)`,
	`CREATE INDEX idx_activity_event_channel_day ON activity (event_name, associated_channel_id, day)`,
	`CREATE INDEX idx_sessions_started_date ON sessions (started_date)`,
	`CREATE INDEX idx_voice_sessions_started_date ON voice_sessions (started_date)`,
	`CREATE INDEX idx_dm_channels_dm_user_id ON dm_channels_data (dm_user_id)`,
	`CREATE INDEX idx_guild_channels_guild_id ON guild_channels_data (guild_id)`,
}

// Insert is one table's rows. Row gives the values of the i-th one, plain Go
// values (string, int64, float64 or nil), so that a large table is never held
// twice.
type Insert struct {
	Table, Query string
	N            int
	Row          func(i int) ([]driver.Value, error)
}

// Inserts lists the tables in the order they are filled. Floats bound into
// TEXT columns are cast to REAL in the query: sql.js binds a JavaScript number
// with no fraction as an INTEGER, which SQLite would render as `'1617712440'`
// rather than the `'1617712440.0'` of a bound float.
func Inserts(m *processor.Model) []Insert {
	pk := m.Package
	partial := int64(0)
	if pk.IsPartial {
		partial = 1
	}
	return []Insert{{"dm_channels_data", `INSERT INTO dm_channels_data
        (channel_id, dm_user_id, user_name, display_name, user_avatar_url, total_message_count, total_voice_channel_duration, sentiment_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, len(m.DMChannels), func(i int) ([]driver.Value, error) {
		r := m.DMChannels[i]
		return []driver.Value{
			r.ChannelID, str(r.DMUserID), r.UserName, str(r.DisplayName), str(r.UserAvatarURL),
			r.TotalMessageCount, r.TotalVoiceChannelDuration, r.SentimentScore,
		}, nil
	}}, {"guild_channels_data", `INSERT INTO guild_channels_data
        (channel_id, guild_id, channel_name, total_message_count, total_voice_channel_duration)
        VALUES (?, ?, ?, ?, ?)`, len(m.GuildChannels), func(i int) ([]driver.Value, error) {
		r := m.GuildChannels[i]
		return []driver.Value{r.ChannelID, str(r.GuildID), r.ChannelName, r.TotalMessageCount, r.TotalVoiceChannelDuration}, nil
	}}, {"activity", `INSERT INTO activity
        (event_name, day, hour, occurence_count, associated_channel_id, associated_guild_id, associated_user_id, extra_field_1, extra_field_2)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, len(m.Activity), func(i int) ([]driver.Value, error) {
		r := m.Activity[i]
		return []driver.Value{
			r.EventName, r.Day, r.Hour, r.OccurrenceCount, str(r.ChannelID), str(r.GuildID),
			str(r.UserID), str(r.ExtraField1), str(r.ExtraField2),
		}, nil
	}}, {"guilds", `INSERT INTO guilds
        (guild_id, guild_name, total_message_count, member_count)
        VALUES (?, ?, ?, ?)`, len(m.Guilds), func(i int) ([]driver.Value, error) {
		r := m.Guilds[i]
		return []driver.Value{r.GuildID, str(r.GuildName), r.TotalMessageCount, integer(r.MemberCount)}, nil
	}}, {"payments", `INSERT INTO payments
        (payment_id, payment_date, payment_amount, payment_currency, payment_description)
        VALUES (?, ?, ?, ?, ?)`, len(m.Payments), func(i int) ([]driver.Value, error) {
		r := m.Payments[i]
		amount, err := amountValue(r.Amount)
		if err != nil {
			return nil, err
		}
		return []driver.Value{str(r.PaymentID), r.PaymentDate, amount, str(r.Currency), str(r.Description)}, nil
	}}, {"voice_sessions", `INSERT INTO voice_sessions
        (channel_id, guild_id, duration_mins, started_date, ended_date)
        VALUES (?, ?, ?, CAST(? AS REAL), CAST(? AS REAL))`, len(m.VoiceSessions), func(i int) ([]driver.Value, error) {
		r := m.VoiceSessions[i]
		return []driver.Value{r.ChannelID, str(r.GuildID), r.DurationMins, r.StartedDate, r.EndedDate}, nil
	}}, {"sessions", `INSERT INTO sessions
        (duration_mins, started_date, ended_date, device_os)
        VALUES (?, CAST(? AS REAL), CAST(? AS REAL), ?)`, len(m.Sessions), func(i int) ([]driver.Value, error) {
		r := m.Sessions[i]
		return []driver.Value{r.DurationMins, r.StartedDate, r.EndedDate, str(r.DeviceOS)}, nil
	}}, {"package_data", `INSERT INTO package_data
        (package_id, package_version, package_owner_id, package_owner_name, package_owner_display_name, package_owner_avatar_url, package_is_partial, activity_stream)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 1, func(int) ([]driver.Value, error) {
		var stream driver.Value
		if pk.ActivityStream != nil {
			stream = string(*pk.ActivityStream)
		}
		return []driver.Value{
			pk.PackageID, pk.PackageVersion, pk.OwnerID, pk.OwnerName, str(pk.OwnerDisplayName),
			str(pk.OwnerAvatarURL), partial, stream,
		}, nil
	}}, {"group_dm_channels_data", `INSERT INTO group_dm_channels_data
        (channel_id, channel_name, member_count, total_message_count)
        VALUES (?, ?, ?, ?)`, len(m.GroupDMChannels), func(i int) ([]driver.Value, error) {
		r := m.GroupDMChannels[i]
		return []driver.Value{r.ChannelID, str(r.ChannelName), r.MemberCount, r.TotalMessageCount}, nil
	}}, {"group_dm_members", `INSERT INTO group_dm_members
        (channel_id, user_id, user_name, display_name, user_avatar_url)
        VALUES (?, ?, ?, ?, ?)`, len(m.GroupDMMembers), func(i int) ([]driver.Value, error) {
		r := m.GroupDMMembers[i]
		return []driver.Value{r.ChannelID, r.UserID, str(r.UserName), str(r.DisplayName), str(r.UserAvatarURL)}, nil
	}}}
}

// A nil pointer is NULL.
func str(p *string) driver.Value {
	if p == nil {
		return nil
	}
	return *p
}

func integer(p *int64) driver.Value {
	if p == nil {
		return nil
	}
	return *p
}

// amountValue gives a payment amount as the Go type of its JSON type, the one
// the worker bound, so that SQLite stores it the same way.
func amountValue(a processor.Amount) (driver.Value, error) {
	switch a.Kind {
	case processor.AmountInt:
		return a.Int, nil
	case processor.AmountFloat:
		return a.Float, nil
	case processor.AmountText:
		return a.Text, nil
	case processor.AmountNull:
		return nil, nil
	}
	return nil, fmt.Errorf("payment amount of unknown kind %d", a.Kind)
}
