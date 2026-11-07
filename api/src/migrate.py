"""Applies `migrations/*.sql` to the database, in name order, each once.

`create_all` only makes missing tables, so this is how an existing one changes.
`deploy-api` runs it before the new code goes live, while the old code still
runs, so a migration must keep that code working.

A file holds one statement, run outside a transaction, as `CREATE INDEX
CONCURRENTLY` requires. It must be safe to run twice: a task that dies between
the statement and its record runs it again.
"""
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text

from db import Session, engine

MIGRATIONS = Path(__file__).parent / 'migrations'

# Any number, as long as every run takes the same one: one runs at a time.
ADVISORY_LOCK = 20261107


def invalid_indexes(conn):
    """A failed `CREATE INDEX CONCURRENTLY` leaves an invalid index behind, which
    `IF NOT EXISTS` would then take for a finished one."""
    return [row.relname for row in conn.execute(text("""
        SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE NOT i.indisvalid
    """))]


def main():
    # Makes the tables on a new database, before any migration reads them.
    Session().close()

    with engine.connect().execution_options(isolation_level='AUTOCOMMIT') as conn:
        conn.execute(text('SELECT pg_advisory_lock(:lock)'), {'lock': ADVISORY_LOCK})
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name text PRIMARY KEY,
                applied_at timestamptz NOT NULL DEFAULT now()
            )
        """))
        applied = {row.name for row in conn.execute(text('SELECT name FROM schema_migrations'))}
        pending = [path for path in sorted(MIGRATIONS.glob('*.sql')) if path.name not in applied]

        for path in pending:
            sql = path.read_text()
            # A statement waiting for a lock holds up every call behind it, so it
            # gives up and the deploy stops. `CONCURRENTLY` blocks no one, and a
            # build cut short leaves an invalid index.
            lock_timeout = '0' if 'CONCURRENTLY' in sql else '5s'
            conn.execute(text(f"SET lock_timeout = '{lock_timeout}'"))
            start = time.monotonic()
            conn.exec_driver_sql(sql)
            invalid = invalid_indexes(conn)
            if invalid:
                raise RuntimeError(f'invalid indexes, to drop before trying again: {invalid}')
            conn.execute(text('INSERT INTO schema_migrations (name) VALUES (:name)'), {'name': path.name})
            print(f'migration {path.name}: applied in {time.monotonic() - start:.2f} s')

        print(f'migrations: {len(pending)} applied, {len(applied) + len(pending)} in all')


if __name__ == '__main__':
    main()
