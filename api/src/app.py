import re
import socket
import time
from datetime import datetime, timedelta

import orjson
from flask import Flask, g, jsonify, request, make_response
from flask_cors import CORS

from flask_limiter import Limiter

# Import tasks before db so dotenv loads before SQLAlchemy reads POSTGRES_URL.
import tasks
from enqueue import enqueue_package
from db import PackageProcessStatus, SavedPackageData, Session, claim_reprocess, current_run, fetch_package_runs, fetch_package_status, fetch_package_rank, get_cached_discord_user, cache_discord_user, is_abandoned, reprocess_block

from sqlite import generate_demo_database

from util import check_discord_link, check_whitelisted_link, current_processor_version, extract_package_id_from_discord_link, extract_package_id_from_upn, fetch_diswho_user, fetch_discord_guild, discord_icon_url

from wh import send_internal_notification

app = Flask(__name__)
CORS(app)

@app.before_request
def start_timer():
    g.started = time.monotonic()

# This instance's first call also waited for its cold start.
instance_is_cold = True

PACKAGE_ID = re.compile(r'[0-9a-f]{32}|demo')

def log_fields(**fields):
    """Adds to this call's `request:` line."""
    g.setdefault('log_fields', {}).update(fields)

# One line per call, with the route's pattern rather than its path, so that no
# user id lands in the logs. `id` finds the call in the gateway's access log,
# which has its IP and device.
@app.after_request
def log_request(response):
    global instance_is_cold
    rule = request.url_rule.rule if request.url_rule else '(no route)'
    ms = (time.monotonic() - g.get('started', time.monotonic())) * 1000
    # Anyone can put anything in a path, for eg. a line break to forge a log line.
    package_id = (request.view_args or {}).get('package_id')
    fields = {
        'id': request.environ.get('apig_wsgi.request_context', {}).get('requestId'),
        'package': package_id if package_id and PACKAGE_ID.fullmatch(package_id) else None,
        'cold': True if instance_is_cold else None,
        **g.get('log_fields', {}),
    }
    instance_is_cold = False
    details = ''.join(f' {name}={value}' for name, value in fields.items() if value is not None)
    print(f'request: {request.method} {rule} {response.status_code} {ms:.0f} ms{details}')
    return response

def get_request_package_id():
    return request.view_args.get('package_id')

limiter = Limiter(
    get_request_package_id,
    app=app,
    storage_uri="memory://",
)

# Discord's links last 30 days from its email, so no link is still good later
# than this after it was submitted.
REPROCESS_WINDOW = timedelta(days=30)

# Each hop of the link's redirect gets this, within API Gateway's 30 s.
LINK_CHECK_TIMEOUT_SECONDS = 5

def get_base_status_response():
    return {
        "isDataAvailable": False,

        "packageVersion": None,
        "currentVersion": None,
        "canReprocess": False,

        "isUpgraded": False,

        "isErrored": False,
        "errorMessageCode": None,

        "isProcessing": False,
        "processingStep": None,
        "processingQueuePosition": {
            "user": 0,
            "total": 0,
            "userWhenStarted": 0,
            "totalWhenStarted": 0
        }
    }


def get_base_process_response():
    return {
        "isAccepted": False,
        "packageId": None,

        "errorMessageCode": None
    }


def get_base_delete_response():
    return {
        "isDeleted": False,
        "errorMessageCode": None
    }


def check_authorization_bearer(req, package_id):
    auth_header = req.headers.get('Authorization')

    if not auth_header:
        log_fields(auth='missing')
        return (False, None)

    auth_token = auth_header.split(' ')[1]
    expected_package_id = extract_package_id_from_upn(auth_token)

    if not expected_package_id or package_id != expected_package_id:
        log_fields(auth='mismatch')
        return (False, None)

    return (True, auth_token)

@app.route('/health', methods=['GET'])
def health():
    
    hostname = socket.gethostname()

    return jsonify({
        'status': 'alive',
        'hostname': hostname
    }), 200

def queue_package(package_process_status, package_id, link, session):
    (total_upgraded_row_count, total_row_count, _cp, _cs) = fetch_package_rank(
        package_id, package_process_status, session)

    package_process_status.queue_premium_total_when_started = total_upgraded_row_count
    package_process_status.queue_standard_total_when_started = total_row_count
    session.commit()

    id = package_process_status.id

    session.close()

    enqueue_package(id, package_id, link)


def reprocess_package(package_id, link, res, session):
    """Start a new run of a package that works, if `reprocess_block` allows it.
    A run already in the way isn't an error: the app follows it, or downloads
    what the server already has."""
    current_version = current_processor_version()
    block = reprocess_block(fetch_package_runs(package_id, session), current_version)
    # No transaction stays open while the link is checked.
    session.close()

    log_fields(outcome='reprocess_refused', reason=block)
    if block == 'ALREADY_RAN':
        res['isAccepted'] = False
        res['errorMessageCode'] = 'ALREADY_REPROCESSED'
        return jsonify(res), 200
    if block:
        return jsonify(res), 200

    problem = None if check_whitelisted_link(link) else tasks.link_problem(link, timeout=LINK_CHECK_TIMEOUT_SECONDS)
    if problem:
        log_fields(reason=problem)
        res['isAccepted'] = False
        res['errorMessageCode'] = problem
        return jsonify(res), 200

    run = claim_reprocess(package_id, current_version, session)
    if not run:
        log_fields(reason='CLAIMED')
        session.close()
        return jsonify(res), 200

    log_fields(outcome='reprocess', reason=None)
    send_internal_notification({
        'embeds': [
            {
                'title': 'Package added to the queue to reprocess',
                'description': f'Package ID: {package_id}',
                'color': 0x1F8BFF
            }
        ]
    })

    id = run.id
    try:
        queue_package(run, package_id, link, session)
    except Exception:
        # No worker started, so the version's one run is still to come.
        session.rollback()
        session.query(PackageProcessStatus).filter_by(id=id).delete()
        session.commit()
        session.close()
        raise

    return jsonify(res), 200


@app.route('/process', methods=['POST'])
def process_link():

    link = request.json['package_link']

    if not link or (not check_discord_link(link) and not check_whitelisted_link(link)):
        log_fields(outcome='invalid_link')
        res = get_base_process_response()
        res['errorMessageCode'] = 'INVALID_LINK'
        return jsonify(res), 200

    package_id = extract_package_id_from_discord_link(link)
    log_fields(package=package_id)

    res = get_base_process_response()
    res['isAccepted'] = True
    res['packageId'] = package_id

    session = Session()

    existing_package_process_status = fetch_package_status(package_id, session)
    if existing_package_process_status and not existing_package_process_status.is_errored and not existing_package_process_status.is_cancelled and not is_abandoned(existing_package_process_status):
        if request.json.get('reprocess') is True and existing_package_process_status.step == 'PROCESSED':
            return reprocess_package(package_id, link, res, session)

        log_fields(outcome='existing')
        session.close()
        send_internal_notification({
            'embeds': [
                {
                    'title': 'Loading existing package',
                    'description': f'Package ID: {package_id}',
                    'color': 0xbbfcbb
                }
            ]
        })
        return jsonify(res), 200

    log_fields(outcome='queued')
    # No connection stays open over the webhook.
    session.rollback()
    send_internal_notification({
        'embeds': [
            {
                'title': 'New package added to the queue',
                'description': f'Package ID: {package_id}',
                'color': 0x1F8BFF
            }
        ]
    })

    package_process_status = PackageProcessStatus(
        package_id=package_id, step='LOCKED')
    session.add(package_process_status)
    session.commit()

    queue_package(package_process_status, package_id, link, session)

    return jsonify(res), 200


@app.route('/process/<package_id>/status', methods=['GET'])
def get_package_status(package_id):

    res = get_base_status_response()

    (is_auth, _) = check_authorization_bearer(request, package_id)
    if not is_auth:
        res['errorMessageCode'] = 'UNAUTHORIZED'
        return jsonify(res), 401

    session = Session()
    runs = fetch_package_runs(package_id, session)
    working = current_run(runs)
    # `?reprocess=true` follows the newest run, failed or not, for the app's
    # loading page. Any other caller sees the package as it stands.
    package_status = runs[0] if working and request.args.get('reprocess') == 'true' else working
    # The ranks count every waiting row, which a processed package doesn't show.
    package_rank = None
    if package_status and package_status.step != 'PROCESSED':
        package_rank = fetch_package_rank(package_id, package_status, session)
    session.close()

    if not package_status:
        log_fields(code='UNKNOWN_PACKAGE_ID')
        res['errorMessageCode'] = 'UNKNOWN_PACKAGE_ID'
        return jsonify(res), 200

    current_version = current_processor_version()
    res['packageVersion'] = working.package_version
    res['currentVersion'] = current_version
    # The app compares its own copy with `currentVersion`: a copy older than the
    # server's only needs a download, so only a used-up run rules a tap out.
    res['canReprocess'] = (bool(current_version) and working.step == 'PROCESSED' and not working.is_errored
                           and datetime.now() - runs[-1].created_at < REPROCESS_WINDOW
                           and reprocess_block(runs, current_version) != 'ALREADY_RAN')

    res['isUpgraded'] = package_status.is_upgraded
    res['isErrored'] = package_status.is_errored

    if package_status.is_errored:
        res['errorMessageCode'] = package_status.error_message_code
    elif is_abandoned(package_status):
        res['isErrored'] = True
        res['errorMessageCode'] = 'UNKNOWN_ERROR'

    if package_status.step == 'PROCESSED':
        res['isDataAvailable'] = True
        res['processingStep'] = package_status.step

    else:
        res['isProcessing'] = True
        res['processingStep'] = package_status.step
        res['processingQueuePosition']['premiumQueueTotal'] = package_rank[0]
        res['processingQueuePosition']['standardQueueTotal'] = package_rank[1]
        res['processingQueuePosition']['premiumQueueUser'] = package_rank[2]
        res['processingQueuePosition']['standardQueueUser'] = package_rank[3]
        res['processingQueuePosition']['standardWhenJoined'] = package_status.queue_standard_total_when_started
        res['processingQueuePosition']['premiumWhenJoined'] = package_status.queue_premium_total_when_started

    log_fields(step=package_status.step, code=res['errorMessageCode'], version=working.package_version)
    return jsonify(res), 200


@app.route('/process/<package_id>/blob', methods=['GET'])
def get_package_blob(package_id):
    """Return a presigned S3 URL the client can fetch the package blob from.

    Replaces /data. The client downloads bytes directly from S3 (fast, no
    API Gateway middleman) and — for real packages — decrypts them locally
    using its UPN.

    Response: {"url": <presigned GET>, "iv": <hex|null>, "ttl": <seconds>}
              iv is null for the demo (the demo blob is unencrypted).

    Errors: 401 (bad bearer), 404 (no row / no S3 blob), 501 (S3 not wired).
    """
    import os
    import blob_storage
    from db import SavedPackageData

    ttl = int(os.getenv('PACKAGE_DATA_PRESIGNED_URL_TTL_SECONDS', '300'))

    # Demo: unauthenticated, lazy-seed S3 from generate_demo_database() on the
    # very first call after deploy, then serve from S3 forever after.
    if package_id == 'demo':
        if not blob_storage.exists('demo'):
            blob_storage.upload('demo', generate_demo_database())
        return jsonify({
            'url': blob_storage.presigned_url('demo', ttl_seconds=ttl),
            'iv': None,
            'ttl': ttl,
        }), 200

    (is_auth, _) = check_authorization_bearer(request, package_id)
    if not is_auth:
        return make_response('', 401)

    session = Session()
    row = session.query(SavedPackageData).filter_by(package_id=package_id).order_by(
        SavedPackageData.created_at.desc()
    ).first()
    session.close()

    if not row:
        log_fields(outcome='no_row')
        return make_response('', 404)

    # A blob from before keys held the iv has none in its key.
    key_iv = row.iv if blob_storage.exists(package_id, row.iv) else None
    if not key_iv and not blob_storage.exists(package_id):
        log_fields(outcome='no_blob')
        return make_response('', 404)

    log_fields(iv_in_key=bool(key_iv))
    return jsonify({
        'url': blob_storage.presigned_url(package_id, ttl_seconds=ttl, iv=key_iv),
        'iv': row.iv,
        'ttl': ttl,
    }), 200


@app.route('/process/<package_id>', methods=['DELETE'])
def cancel_package(package_id):

    (is_auth, _) = check_authorization_bearer(request, package_id)
    if not is_auth:
        return make_response('', 401)

    res = get_base_delete_response()

    session = Session()
    package_status = fetch_package_status(package_id, session)

    if not package_status:
        log_fields(code='UNKNOWN_PACKAGE_ID')
        res['errorMessageCode'] = 'UNKNOWN_PACKAGE_ID'
        session.close()
        return jsonify(res), 200

    # The blob goes before the rows: if S3 refuses, the request fails with
    # the rows still there, so deleting again can finish the job.
    import blob_storage
    try:
        blob_storage.delete(package_id)
        session.query(PackageProcessStatus).filter(PackageProcessStatus.package_id == package_id).delete()
        session.query(SavedPackageData).filter(SavedPackageData.package_id == package_id).delete()
        session.commit()
    finally:
        session.close()

    res['isDeleted'] = True

    send_internal_notification({
        'embeds': [
            {
                'title': 'Deleting existing package data',
                'description': f'Package ID: {package_id}',
                'color': 0xf79494
            }
        ]
    })

    return jsonify(res), 200

@app.route('/process/<package_id>/user/<user_id>', methods=['GET'])
def get_avatar(package_id, user_id):
    
        (is_auth, auth_upn) = check_authorization_bearer(request, package_id)
        if not is_auth:
            return make_response('', 401)

        # Discord's export puts "Deleted User" in a DM's recipients where a
        # deleted account's id should be: there is no one to look up.
        if not user_id.isdigit():
            return make_response('', 404)
    
        session = Session()
        try:
            data = fetch_package_status(package_id, session)

            if not data:
                log_fields(outcome='no_package')
                return make_response('', 401)

            # Hit the upstream only on a cache miss / stale entry. Then
            # only persist responses that look real — username present
            # is the cheapest signal that we got past auth/404/5xx and
            # have something worth handing back to a future caller.
            user = get_cached_discord_user(user_id, session)
            log_fields(cached=bool(user))
            if not user:
                # No connection stays open over the call to Discord.
                session.rollback()
                user = fetch_diswho_user(user_id)
                if user and user.get('username'):
                    cache_discord_user(user_id, user, session)
        finally:
            session.close()

        if not user:
            return make_response('', 500)
        
        avatar_hash = user.get('avatar')
        if avatar_hash:
            avatar_extension = 'gif' if avatar_hash.startswith('a_') else 'webp'
            avatar_url = f'https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.{avatar_extension}'
        else:
            # Discord's built-in default avatars. Legacy users have a
            # discriminator (e.g. "1234") and pick from 5 defaults; new
            # users have discriminator "0" and the index is derived from
            # the snowflake.
            discriminator = user.get('discriminator')
            if discriminator and discriminator != '0':
                index = int(discriminator) % 5
            else:
                index = (int(user_id) >> 22) % 6
            avatar_url = f'https://cdn.discordapp.com/embed/avatars/{index}.png'

        return jsonify({
            'user_id': user_id,
            'display_name': user['global_name'] if 'global_name' in user and user['global_name'] else None,
            'avatar_url': avatar_url,
            'username': user['username'] if 'username' in user and user['username'] else None,
        }), 200


@app.route('/widget/<guild_id>', methods=['GET'])
def get_widget(guild_id):
    """Replacement for the legacy widget.dumpus.app proxy.

    Returns name + icon_url + member_count for a guild the bot can see.
    """
    if not guild_id.isdigit():
        return jsonify({'error': 'invalid guild id'}), 400

    guild = fetch_discord_guild(guild_id)
    if not guild:
        return jsonify({'error': 'guild not found or bot lacks access'}), 404

    return jsonify({
        'name': guild['name'],
        'icon_url': discord_icon_url(guild_id, guild.get('icon')),
        'member_count': guild.get('approximate_member_count', 0),
    }), 200


def scrub(text, limit):
    """Free text from a device could quote a link, whose UPN is the key of its
    blob. The app scrubs it the same way, but this decides what gets logged."""
    words = ('<url>' if '://' in word else word for word in str(text or '').split())
    return re.sub(r'[\w+/=.%-]{24,}', '<token>', ' '.join(words))[:limit]


# Far more than a report needs.
CLIENT_ERROR_MAX_BYTES = 8192

@app.route('/client-error', methods=['POST'])
@limiter.limit('10 per minute', key_func=lambda: request.remote_addr)
def report_client_error():
    """A failure only a device can see, like its download from S3. Anyone can
    send one, so nothing in it is taken as is."""
    if (request.content_length or 0) > CLIENT_ERROR_MAX_BYTES:
        return make_response('', 413)
    try:
        report = orjson.loads(request.get_data())
    except orjson.JSONDecodeError:
        return make_response('', 400)
    if not isinstance(report, dict):
        return make_response('', 400)

    status = report.get('status')
    package_id = str(report.get('package'))
    fields = {
        'step': scrub(report.get('step'), 20),
        'status': status if isinstance(status, int) and 100 <= status < 600 else None,
        'name': scrub(report.get('name'), 40),
        'message': scrub(report.get('message'), 200),
        'details': scrub(report.get('details'), 400),
        'version': scrub(report.get('version'), 40),
        'platform': scrub(report.get('platform'), 20),
        'path': scrub(report.get('path'), 80),
        'package': package_id if PACKAGE_ID.fullmatch(package_id) else None,
        'user_agent': scrub(request.headers.get('User-Agent'), 200),
    }
    print(f'client-error: {orjson.dumps(fields).decode()}')

    send_internal_notification({
        'embeds': [
            {
                'title': 'App error',
                'description': '\n'.join([
                    f"Step: {fields['step']}" + (f" (HTTP {fields['status']})" if fields['status'] else ''),
                    f"Error: {fields['name']}: {fields['message']}",
                    f"Checks: {fields['details']}",
                    f"App: {fields['platform']} {fields['version']}, {fields['path']}",
                    f"Device: {fields['user_agent']}",
                    f"Package ID: {fields['package']}",
                ]),
                'color': 0x9e4b4b
            }
        ]
    })

    return make_response('', 204)


@app.errorhandler(404)
def page_not_found(e):
    return jsonify({'error': 'Route not found.'}), 404


@app.errorhandler(500)
def internal_server_error(e):
    log_fields(error=type(getattr(e, 'original_exception', None) or e).__name__)
    return jsonify({'error': 'Internal server error.'}), 500
