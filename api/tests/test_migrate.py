"""The migrations, as `deploy-api` runs them, on the real PostgreSQL."""
import pytest

INDEXES = ['ix_package_process_status_package_id', 'ix_saved_package_data_package_id']
FILES = ['001_package_process_status_package_id_index.sql', '002_saved_package_data_package_id_index.sql']


def indexes_found(postgres):
    return [row['indexname'] for row in postgres.rows(
        'SELECT indexname FROM pg_indexes WHERE indexname = ANY(%s) ORDER BY indexname', (INDEXES,))]


def test_migrations_apply_outside_a_transaction_and_only_once(api, postgres, capsys):
    for index in INDEXES:
        postgres.execute(f'DROP INDEX {index}')
    postgres.execute('DROP TABLE IF EXISTS schema_migrations')

    api.migrate.main()
    assert '2 applied, 2 in all' in capsys.readouterr().out
    assert indexes_found(postgres) == sorted(INDEXES)
    assert [row['name'] for row in postgres.rows('SELECT name FROM schema_migrations ORDER BY name')] == FILES

    api.migrate.main()
    assert '0 applied, 2 in all' in capsys.readouterr().out


def test_an_index_left_invalid_stops_the_deploy(api, postgres):
    api.migrate.main()
    postgres.execute('DELETE FROM schema_migrations WHERE name = %s', (FILES[0],))
    postgres.execute("UPDATE pg_index SET indisvalid = false WHERE indexrelid = %s::regclass", (INDEXES[0],))
    try:
        with pytest.raises(RuntimeError, match=INDEXES[0]):
            api.migrate.main()
    finally:
        postgres.execute("UPDATE pg_index SET indisvalid = true WHERE indexrelid = %s::regclass", (INDEXES[0],))
    api.migrate.main()
