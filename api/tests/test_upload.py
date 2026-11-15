"""A package the app read from its file: the app posts its encrypted copy to S3
with a presigned form, then registers it, and the API serves it as it serves a
processed package."""
import os
import secrets

import requests

from support.upstream import package_id


def test_a_registered_copy_is_served_as_a_processed_package(client):
    key = secrets.token_urlsafe(32)
    package = package_id(key)
    auth = {'Authorization': f'Bearer {key}'}
    iv = os.urandom(16).hex()
    copy = os.urandom(4096)
    register = {'iv': iv, 'packageVersion': '2.3.0'}

    # With no blob yet, the package would have nothing to serve.
    assert client.post(f'/process/{package}/upload', json=register, headers=auth).status_code == 409

    form = client.post(f'/process/{package}/upload-url', json={'iv': iv}, headers=auth).get_json()
    assert requests.post(form['url'], data=form['fields'], files={'file': copy}).ok
    # Again, as after an answer the app didn't get.
    for _ in range(2):
        assert client.post(f'/process/{package}/upload', json=register, headers=auth).get_json() == {'isAccepted': True}

    status = client.get(f'/process/{package}/status', headers=auth).get_json()
    assert (status['isDataAvailable'], status['packageVersion']) == (True, '2.3.0')
    blob = client.get(f'/process/{package}/blob', headers=auth).get_json()
    assert blob['iv'] == iv
    assert requests.get(blob['url']).content == copy
