import os

from datetime import datetime, timedelta
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func, text

import orjson

engine = create_engine(os.getenv('POSTGRES_URL'), pool_recycle=3600, pool_pre_ping=True)

Base = declarative_base()

class SavedPackageData(Base):
    __tablename__ = 'saved_package_data'

    id = Column(Integer, primary_key=True)
    package_id = Column(String(255), nullable=False)
    iv = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, onupdate=func.now(), default=func.now())

class CachedDiscordUser(Base):
    """Cache of upstream /user payloads (diswho or Discord bot API).

    Discord usernames + avatars don't move often; the upstream is rate-
    limited (429s on bursts) so a small Postgres-backed cache absorbs
    the per-package fan-out and stops us hammering Discord every time
    a user opens a heavy package.
    """
    __tablename__ = 'cached_discord_user'

    user_id = Column(String(255), primary_key=True)
    payload = Column(String, nullable=False)  # JSON-serialized upstream response
    cached_at = Column(DateTime, nullable=False, default=func.now())


CACHED_DISCORD_USER_TTL_HOURS = 24


class PackageProcessStatus(Base):
    __tablename__ = 'package_process_status'

    id = Column(Integer, primary_key=True)
    package_id = Column(String(255), nullable=False)
    step = Column(String(255), nullable=False)
    progress = Column(Integer, nullable=True)
    queue_standard_total_when_started = Column(Integer, nullable=True)
    queue_premium_total_when_started = Column(Integer, nullable=True)
    queue_standard_total_when_upgraded = Column(Integer, nullable=True)
    queue_premium_total_when_upgraded = Column(Integer, nullable=True)
    is_upgraded = Column(Boolean, nullable=False, default=False)
    is_errored = Column(Boolean, nullable=False, default=False)
    error_message_code = Column(String(255), nullable=True)
    error_message_traceback = Column(String, nullable=True)
    is_cancelled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=func.now())
    updated_at = Column(DateTime, nullable=False, onupdate=func.now(), default=func.now())
    # The dumpus-processor version that made the package, set when the row
    # reaches PROCESSED. A reprocess run has it from the start, as the version it
    # runs for: see `is_pending_reprocess`. `create_all` doesn't add a column to
    # an existing table: `scripts/add-package-version-column.sh` did.
    package_version = Column(String(255), nullable=True)

Base.metadata.create_all(engine)

Session = sessionmaker(bind=engine)

def update_step (package_status_id, package_id, step, session):
    package = session.query(PackageProcessStatus).filter_by(id=package_status_id).first()
    if package:
        package.step = step
        package.updated_at = datetime.now()
        session.commit()

# A live worker writes a step at least every 11 minutes: dumpus-processor is
# stopped at 10 (`PROCESSOR_TIMEOUT_SECONDS` in `tasks.py`), and starting the
# task and the slowest download in a month of production each took less.
ABANDONED_AFTER = timedelta(hours=1)

def is_abandoned(package_status):
    return (package_status.step != 'PROCESSED'
            and not package_status.is_errored and not package_status.is_cancelled
            and datetime.now() - package_status.updated_at > ABANDONED_AFTER)

def fetch_package_rank (package_id, package_status, session):
    if not package_status:
        return None
    
    upgraded_row_count = None
    row_count = None
    alive_since = datetime.now() - ABANDONED_AFTER

    query = 'select count(*) from package_process_status where step <> \'PROCESSED\' and is_upgraded = :is_upgraded and is_errored = false and is_cancelled = false and updated_at > :alive_since;'

    total_upgraded_row_count = session.execute(text(query).bindparams(is_upgraded=True, alive_since=alive_since)).fetchone()[0]
    total_row_count = session.execute(text(query).bindparams(is_upgraded=False, alive_since=alive_since)).fetchone()[0]

    if package_status.is_upgraded:
        upgraded_row_count = session.execute(text("""
            select count(*) from package_process_status 
            where id < (select id from package_process_status where package_id = :package_id order by created_at desc limit 1)
            and step <> 'PROCESSED'
            and is_upgraded = true and is_errored = false and is_cancelled = false
            and updated_at > :alive_since;
        """).bindparams(package_id=package_id, alive_since=alive_since)).fetchone()[0]
    else:    
        row_count = session.execute(text("""
            select count(*) from package_process_status
            where id < (select id from package_process_status where package_id = :package_id order by created_at desc limit 1)
            and step <> 'PROCESSED' and is_errored = false and is_cancelled = false
            and updated_at > :alive_since;
        """).bindparams(package_id=package_id, alive_since=alive_since)).fetchone()[0]

    return (total_upgraded_row_count, total_row_count, upgraded_row_count, row_count)

def fetch_package_runs(package_id, session):
    return session.query(PackageProcessStatus).filter_by(package_id=package_id).order_by(PackageProcessStatus.created_at.desc()).all()

def is_pending_reprocess(package_status):
    """A reprocess run that hasn't replaced the package: running, or failed."""
    return package_status.package_version is not None and package_status.step != 'PROCESSED'

def current_run(runs):
    """The row that says how a package stands. A reprocess run counts once it
    has replaced the package, so while one runs or if it fails, a working package
    still reads as working."""
    return next((run for run in runs if not is_pending_reprocess(run)), None)

def fetch_package_status(package_id, session):
    return current_run(fetch_package_runs(package_id, session))

def version_key(version):
    """`0.10.0` sorts after `0.9.0`, and no recorded version before any."""
    return tuple(int(part) for part in version.split('.')) if version else ()

def reprocess_block(runs, current_version):
    """Why a reprocess can't start, or None when it can: `UP_TO_DATE`, which a
    server that doesn't know its version always is, `RUNNING` or `ALREADY_RAN`."""
    package_status = current_run(runs)
    if (not package_status or package_status.step != 'PROCESSED' or not current_version
            or version_key(package_status.package_version) >= version_key(current_version)):
        return 'UP_TO_DATE'
    pending = [run for run in runs if is_pending_reprocess(run)]
    if any(not run.is_errored and not run.is_cancelled and not is_abandoned(run) for run in pending):
        return 'RUNNING'
    # One run per package per version: a failed one isn't tried again.
    if any(run.package_version == current_version for run in pending):
        return 'ALREADY_RAN'
    return None

def claim_reprocess(package_id, current_version, session):
    """Add the status row of a reprocess run and return it, or return None when
    `reprocess_block` says no. Concurrent requests take turns on a lock on the
    package's oldest row, so only the first of them finds nothing in the way."""
    session.query(PackageProcessStatus.id).filter_by(package_id=package_id).order_by(PackageProcessStatus.id).with_for_update().first()
    if reprocess_block(fetch_package_runs(package_id, session), current_version):
        session.rollback()
        return None
    run = PackageProcessStatus(package_id=package_id, step='LOCKED', package_version=current_version)
    session.add(run)
    session.commit()
    return run

def get_cached_discord_user(user_id, session):
    """Return the cached upstream user dict, or None if absent or stale."""
    row = session.query(CachedDiscordUser).filter_by(user_id=user_id).first()
    if not row:
        return None
    if datetime.now() - row.cached_at > timedelta(hours=CACHED_DISCORD_USER_TTL_HOURS):
        return None
    return orjson.loads(row.payload)


def cache_discord_user(user_id, payload, session):
    """Upsert a user payload into the cache.

    Caller must only pass valid upstream responses — never None, never
    error envelopes — so the cache doesn't pin failures and starve
    legitimate retries.
    """
    serialized = orjson.dumps(payload).decode()
    existing = session.query(CachedDiscordUser).filter_by(user_id=user_id).first()
    if existing:
        existing.payload = serialized
        existing.cached_at = datetime.now()
    else:
        session.add(CachedDiscordUser(user_id=user_id, payload=serialized))
    session.commit()


def fetch_pending_packages():
    session = Session()
    # select * from package_process_status pps where step <> 'PROCESSED' and error_message_code is null
    result = session.query(PackageProcessStatus).filter(PackageProcessStatus.step != 'PROCESSED', PackageProcessStatus.error_message_code == None).all()
    session.close()
    return result
