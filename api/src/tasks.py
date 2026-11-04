from dotenv import load_dotenv
load_dotenv()

import traceback

import time

import contextlib
import sqlite3

# Read JSON
import orjson

from crypto import encrypt_sqlite_data

# Export database
import gzip
import tempfile

import os
import subprocess
import requests

from db import update_step, SavedPackageData, Session, PackageProcessStatus
from util import (
    # discord utilities
    extract_key_from_discord_link,
    check_whitelisted_link,
    # file path
    get_package_zip_path
)

from wh import send_internal_notification

def link_problem(link, timeout=None):
    """Why `link` can't be downloaded, as an error code, or None when it can.
    A failed request's message quotes the link, whose UPN is the key of the
    blob, so that message goes no further than here."""
    print('checking content type')
    try:
        r = requests.head(link, allow_redirects=True, timeout=timeout)
    except requests.RequestException as e:
        print(f'Could not check the link: {type(e).__name__}')
        return 'UNKNOWN_ERROR'
    print(r.status_code, r.headers.get('content-type'))
    # A busy upstream says nothing about the link.
    if r.status_code == 429:
        return 'UNKNOWN_ERROR'
    # Discord download URLs are signed and short-lived: click.discord.com
    # 302s to a Google Cloud Storage signed URL, which returns 4xx (most
    # commonly 400) once the signature TTL is up. Surface that as
    # EXPIRED_LINK so the user sees a useful message instead of the
    # generic UNKNOWN_ERROR fallback.
    if 400 <= r.status_code < 500:
        print(f'Link is expired (upstream returned {r.status_code}).')
        return 'EXPIRED_LINK'
    if r.status_code != 200 or 'content-type' not in r.headers or 'application/octet-stream' not in r.headers['content-type']:
        print('The link does not point to a valid file.')
        return 'INVALID_LINK'
    return None

def download_file(package_status_id, package_id, link, session):
    # check if file exists in tmp
    path = get_package_zip_path(package_id)
    try:
        with open(path, 'rb') as f:
            return path
    except FileNotFoundError:
        pass

    if not check_whitelisted_link(link):
        problem = link_problem(link)
        if problem:
            raise Exception(problem)

    print('downloading')
    update_step(package_status_id, package_id, 'DOWNLOADING', session)
    try:
        r = requests.get(link, allow_redirects=True, stream=True)
        with open(path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=10*1024):
                f.write(chunk)
    except requests.RequestException as e:
        # Its message quotes the link, see `link_problem`.
        raise Exception(f'download failed: {type(e).__name__}') from None

    return path

def remove_file(package_id):
    path = get_package_zip_path(package_id)
    if os.path.exists(path):
        os.remove(path)
        print(f'Removed file {path}')
    else:
        print(f'File {path} does not exist')

def save_package_data(package_status_id, package_id, link, zipped_buffer, package_version, start, session):
    """Encrypt the gzipped database with the link's key, upload it, and make it
    the package's in one commit: until then the API serves the blob and iv it
    had, so a run that fails anywhere before it breaks nothing."""
    package_status = session.query(PackageProcessStatus).filter(PackageProcessStatus.id == package_status_id).first()
    if not package_status:
        print('package was deleted while it ran, not saving it')
        return
    created_at = package_status.created_at
    # No transaction stays open over the upload.
    session.commit()

    key = extract_key_from_discord_link(link)
    (data, iv) = encrypt_sqlite_data(zipped_buffer, key)

    # Encrypted blob → S3 (clients fetch via presigned URL); only the iv
    # stays in Postgres so the API can hand it to the client for decryption.
    # Store iv as hex — the column is a String, so writing raw bytes lets
    # PostgreSQL serialize it as the BYTEA literal "\x..." which leaks
    # straight to the client.
    import blob_storage
    blob_storage.upload(package_id, data, iv=iv.hex())

    print(f'SQLite serialization: {time.time() - start}')

    package_status.step = 'PROCESSED'
    package_status.package_version = package_version
    session.add(SavedPackageData(package_id=package_id, iv=iv.hex()))
    session.commit()

    time_diff = time.time() - created_at.timestamp()
    formatted_time = time.strftime('%H:%M:%S', time.gmtime(time_diff))

    send_internal_notification({
        'embeds': [
            {
                'title': f'Package processed successfully',
                'description': f'Package ID: {package_id} (took {formatted_time})',
                'color': 0x4b9e4b
            }
        ]
    })

def read_package_version(sqlite_path):
    """The version stamped on the database: what made the package, even if a
    worker older than the API's current version ran it."""
    with contextlib.closing(sqlite3.connect(sqlite_path)) as conn:
        return conn.execute('SELECT package_version FROM package_data').fetchone()[0]

# dumpus-processor is stopped past this, many times what the largest exports take.
PROCESSOR_TIMEOUT_SECONDS = 600

def process_with_go(package_status_id, package_id, link, session):
    """Turn the downloaded package into the app's database with
    dumpus-processor (`processor/` in this repo), then save it.

    Exit code 3 raises MISSING_USER_DATA. Exit code 4, a database written
    without its report, carries on. Any other exit code, a missing binary or
    a timeout raises, so the package ends as UNKNOWN_ERROR.
    """
    update_step(package_status_id, package_id, 'ANALYZING', session)
    start = time.time()

    binary = os.getenv('DUMPUS_PROCESSOR', '/usr/local/bin/dumpus-processor')
    with tempfile.TemporaryDirectory() as tmp:
        output = os.path.join(tmp, 'package.sqlite')
        report_path = os.path.join(tmp, 'report.json')
        # stderr's message can quote the package, so neither stream reaches
        # the logs: the exit code says which failure it was.
        result = subprocess.run(
            [binary, '--input', get_package_zip_path(package_id), '--output', output,
             '--package-id', package_id, '--report', report_path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=PROCESSOR_TIMEOUT_SECONDS)
        if result.returncode == 3:
            raise Exception('MISSING_USER_DATA')
        if result.returncode not in (0, 4):
            raise Exception(f'dumpus-processor exited {result.returncode}')

        package_version = read_package_version(output)
        with open(output, 'rb') as f:
            sqlite_buffer = f.read()
        if result.returncode == 4:
            summary = 'not written'
        else:
            # The report holds masked paths and counts; `problem` is a fixed
            # vocabulary, so it is the only field logged.
            with open(report_path, 'rb') as f:
                issues = orjson.loads(f.read())['issues']
            problems = sorted({issue['problem'] for issue in issues})
            summary = f'{len(issues)} issues, problems {problems}'

    print(f'dumpus-processor: {time.time() - start:.1f} s, report: {summary}')
    save_package_data(package_status_id, package_id, link, gzip.compress(sqlite_buffer), package_version, start, session)

def process_package(package_status_id, package_id, link, worker_name='regular_process'):
    """Process a package end-to-end.

    Invoked by enqueue_package(QUEUE_BACKEND=sync) for local dev and by the SQS
    worker Lambda in production. worker_name lets premium-only work skip the
    regular-process path; we only run regular_process today.
    """
    # Don't log the link itself: it ends with ?upn=<UPN>, which is the
    # AES key for that user's encrypted blob. Logging it would put the
    # decryption key in CloudWatch.
    print(f'handling package {package_id}')
    session = Session()
    package_status = session.query(PackageProcessStatus).filter(PackageProcessStatus.id == package_status_id).first()
    if not package_status:
        print('package not found')
        return

    if package_status.is_cancelled:
        print('package is cancelled, skipping')
        return

    if package_status.is_upgraded and worker_name.startswith('regular_process'):
        print('package is upgraded and worker is regular, skipping')
        return

    try:
        download_file(package_status_id, package_id, link, session)
        process_with_go(package_status_id, package_id, link, session)
    except Exception as e:
        session.rollback()
        # Always log the full trace to CloudWatch — print(e) alone gives just
        # the exception message and no line numbers, which makes the failure
        # impossible to debug from logs.
        tb = ''.join(traceback.format_exception(type(e), e, e.__traceback__))
        print(f'process_package failed for {package_id}:\n{tb}')

        # Worker raises these as known error codes. Anything else gets
        # relabeled UNKNOWN_ERROR with the full traceback preserved for
        # CloudWatch debugging.
        # NOTE: this used to be `expected = ('EXPIRED_LINK')` which is
        # just the string 'EXPIRED_LINK' (Python tuples need a comma);
        # the `in` check then accidentally did substring match on a
        # single code, hiding INVALID_LINK behind UNKNOWN_ERROR.
        EXPECTED_ERROR_CODES = ('EXPIRED_LINK', 'INVALID_LINK', 'MISSING_USER_DATA')
        current = str(e)
        e_traceback = None
        if current not in EXPECTED_ERROR_CODES:
            current = 'UNKNOWN_ERROR'
            e_traceback = tb
        session.query(PackageProcessStatus).filter(PackageProcessStatus.id == package_status_id).update({
            'is_errored': True,
            'error_message_code': current,
            'error_message_traceback': e_traceback
        })

        send_internal_notification({
            'embeds': [
                {
                    'title': f'Package errored',
                    'description': f'Package ID: {package_id} (error {current if current else "UNKNOWN_ERROR"})',
                    'color': 0x9e4b4b
                }
            ]
        })
        session.commit()
    finally:
        remove_file(package_id)
        session.close()


