"""Reading a package again, with the real worker, processor and PostgreSQL."""
import threading
import time

import requests

from support import blobs, env, packages
from support.upstream import package_id


def link_of(package):
    return f'https://click.discord.com/ls/click?upn={package.upn}'


def reprocess(client, package):
    return client.post('/process', json={'package_link': link_of(package), 'reprocess': True}).get_json()


def status(client, package, query=''):
    return client.get(f'/process/{package.package_id}/status{query}', headers=package.auth).get_json()


def download(client, package):
    """What the app would open now, with what it needs to open it later."""
    body = client.get(f'/process/{package.package_id}/blob', headers=package.auth).get_json()
    return body['url'], body['iv'], requests.get(body['url']).content


def processed_by_an_older_version(postgres, submit):
    package = submit('full')
    postgres.execute("UPDATE package_process_status SET package_version = '0.2.0'")
    return package


def test_one_run_starts_however_many_requests_come_at_once(api, submit, postgres, queue, monkeypatch):
    sqs, queue_url = queue
    # Processed inline, on the backend `submit` expects.
    monkeypatch.setenv('QUEUE_BACKEND', 'sync')
    package = processed_by_an_older_version(postgres, submit)
    monkeypatch.setenv('QUEUE_BACKEND', 'sqs')

    # Long enough, between finding the way clear and taking it, for every
    # request to find the same, unless they take turns.
    check = api.db.reprocess_block

    def slow_check(*args):
        block = check(*args)
        time.sleep(0.1)
        return block

    monkeypatch.setattr(api.db, 'reprocess_block', slow_check)

    barrier = threading.Barrier(8)
    answers = []

    def tap():
        client = api.app.app.test_client()
        barrier.wait()
        answers.append(reprocess(client, package))

    threads = [threading.Thread(target=tap) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert [answer['errorMessageCode'] for answer in answers] == [None] * 8
    assert len(sqs.receive_message(QueueUrl=queue_url, MaxNumberOfMessages=10)['Messages']) == 1
    assert len(postgres.rows("SELECT id FROM package_process_status WHERE step = 'LOCKED'")) == 1

    # And it's still the only one while it runs.
    assert reprocess(api.app.app.test_client(), package)['isAccepted'] is True
    assert len(postgres.rows("SELECT id FROM package_process_status WHERE step = 'LOCKED'")) == 1


def test_a_failed_run_leaves_the_package_as_it_was(client, submit, upstream, postgres):
    package = processed_by_an_older_version(postgres, submit)
    url, iv, blob = download(client, package)
    # The run downloads something that isn't a package.
    upstream.files['/storage/full.zip'] = b'not a zip'

    assert reprocess(client, package)['isAccepted'] is True

    run = status(client, package, '?reprocess=true')
    assert (run['isErrored'], run['errorMessageCode']) == (True, 'UNKNOWN_ERROR')
    now = status(client, package)
    assert (now['isErrored'], now['errorMessageCode'], now['isDataAvailable']) == (False, None, True)
    assert (now['packageVersion'], now['canReprocess']) == ('0.2.0', False)
    assert download(client, package)[1:] == (iv, blob)
    assert blobs.open_blob(blob, iv, package.upn)

    # The version's one run is used up.
    again = reprocess(client, package)
    assert (again['isAccepted'], again['errorMessageCode']) == (False, 'ALREADY_REPROCESSED')
    assert len(postgres.rows('SELECT id FROM package_process_status')) == 2


def test_a_run_replaces_the_package_and_its_blob_goes_with_the_package(client, submit, postgres, s3):
    package = processed_by_an_older_version(postgres, submit)
    url, iv, blob = download(client, package)
    before = status(client, package)
    assert (before['packageVersion'], before['canReprocess']) == ('0.2.0', True)

    assert reprocess(client, package)['isAccepted'] is True

    # `PackageVersion`, as the API reads it, is what the real processor stamps.
    after = status(client, package)
    assert after['packageVersion'] == after['currentVersion'] == before['currentVersion']
    _, new_iv, new_blob = download(client, package)
    assert new_iv != iv
    tables = blobs.read_tables(blobs.open_blob(new_blob, new_iv, package.upn))
    assert blobs.as_dicts(tables['package_data'])[0]['package_version'] == after['currentVersion']
    # A device that asked just before the run ended can still open what it was told to.
    assert blobs.open_blob(requests.get(url).content, iv, package.upn)

    # Nothing is left to run, so nothing runs.
    assert reprocess(client, package)['isAccepted'] is True
    assert len(postgres.rows('SELECT id FROM package_process_status')) == 2

    # A run doesn't move the date the link's 30 days count from.
    postgres.execute("UPDATE package_process_status SET created_at = created_at - interval '31 days' WHERE id = 1")
    assert status(client, package)['canReprocess'] is False

    assert client.delete(f'/process/{package.package_id}', headers=package.auth).get_json()['isDeleted'] is True
    assert s3.list_objects_v2(Bucket=env.BUCKET, Prefix='packages/')['KeyCount'] == 0


def test_an_expired_link_starts_nothing_and_uses_nothing_up(client, submit, upstream, postgres):
    package = processed_by_an_older_version(postgres, submit)
    click_targets, upstream.click_targets = upstream.click_targets, {}

    answer = reprocess(client, package)

    assert (answer['isAccepted'], answer['errorMessageCode']) == (False, 'EXPIRED_LINK')
    assert len(postgres.rows('SELECT id FROM package_process_status')) == 1
    assert status(client, package)['canReprocess'] is True

    upstream.click_targets = click_targets
    assert reprocess(client, package)['isAccepted'] is True
    assert status(client, package)['packageVersion'] != '0.2.0'


def test_a_link_nothing_answers_for_stays_out_of_the_logs(api, client, submit, upstream, postgres, capfd, monkeypatch):
    package = processed_by_an_older_version(postgres, submit)
    new_link, new_upn = upstream.discord_link('new', packages.build('full'))
    # A failed request's message quotes the link: "Max retries exceeded with url: /ls/click?upn=...".
    monkeypatch.setattr(api.tasks.requests, '_routes', (('https://click.discord.com/', 'http://127.0.0.1:1/'),))

    answer = reprocess(client, package)
    assert (answer['isAccepted'], answer['errorMessageCode']) == (False, 'UNKNOWN_ERROR')

    # The worker, on a package seen for the first time.
    client.post('/process', json={'package_link': new_link})

    out, err = capfd.readouterr()
    assert package.upn not in out + err and new_upn not in out + err
    (row,) = postgres.rows('SELECT error_message_code, error_message_traceback FROM package_process_status WHERE package_id = %s', (package_id(new_upn),))
    assert row['error_message_code'] == 'UNKNOWN_ERROR'
    assert new_upn not in row['error_message_traceback']
