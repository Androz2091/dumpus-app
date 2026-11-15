"""Store notifications: one that verifies posts to the internal webhook with
its platform, one signed by anyone else posts nothing.

Apple's and Google's keys sign nothing here: Apple's root is swapped for a
test chain built the way Apple's is, with its marker extensions, and Google's
published keys for a test key."""
import base64
import datetime
import json
import time

import jwt
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from cryptography.x509.oid import NameOID

SERVICE_ACCOUNT = 'play-push@dumpus-test.iam.gserviceaccount.com'


def certificate(name, key, issuer, issuer_key, ca, marker=None):
    now = datetime.datetime.now(datetime.timezone.utc)
    usage = dict.fromkeys(['content_commitment', 'key_encipherment', 'data_encipherment', 'key_agreement',
                           'encipher_only', 'decipher_only'], False)
    builder = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, name)]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer)]))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
        .add_extension(x509.KeyUsage(digital_signature=not ca, key_cert_sign=ca, crl_sign=ca, **usage), critical=True)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(issuer_key.public_key()), critical=False)
    )
    if marker:
        builder = builder.add_extension(x509.UnrecognizedExtension(x509.ObjectIdentifier(marker), b'\x05\x00'),
                                        critical=False)
    return builder.sign(issuer_key, hashes.SHA256())


class AppleChain:
    """Root, intermediate and leaf, as Apple signs its notifications with."""

    def __init__(self):
        root_key, middle_key = ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.root = certificate('Root', root_key, 'Root', root_key, ca=True)
        middle = certificate('Intermediate', middle_key, 'Root', root_key, ca=True, marker='1.2.840.113635.100.6.2.1')
        leaf = certificate('Leaf', self.key, 'Intermediate', middle_key, ca=False, marker='1.2.840.113635.100.6.11.1')
        self.x5c = [base64.b64encode(c.public_bytes(serialization.Encoding.DER)).decode() for c in (leaf, middle, self.root)]

    def sign(self, payload):
        return jwt.encode(payload, self.key, algorithm='ES256', headers={'x5c': self.x5c})

    def purchase(self, environment):
        now = int(time.time() * 1000)
        transaction = self.sign({
            'transactionId': '2000000123456789', 'productId': 'supporter', 'bundleId': 'app.dumpus.app',
            'environment': environment, 'price': 1590, 'currency': 'EUR', 'storefront': 'FRA',
            'type': 'Non-Consumable', 'signedDate': now,
        })
        return self.sign({
            'notificationType': 'ONE_TIME_CHARGE', 'notificationUUID': 'b2d5c3c6-0000-4000-8000-000000000000',
            'version': '2.0', 'signedDate': now,
            'data': {'bundleId': 'app.dumpus.app', 'appAppleId': 6450952260, 'environment': environment,
                     'signedTransactionInfo': transaction},
        })


@pytest.fixture
def posts(api, monkeypatch):
    sent = []
    monkeypatch.setattr(api.app, 'send_internal_notification', sent.append)
    return sent


@pytest.fixture
def apple(api, monkeypatch):
    import store

    chain = AppleChain()
    monkeypatch.setattr(store, 'apple_roots', lambda: [base64.b64decode(chain.x5c[2])])
    return chain


@pytest.fixture
def google(api, monkeypatch):
    import store

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(store, 'google_signing_key', lambda token: key.public_key())
    monkeypatch.setenv('GOOGLE_PUSH_SERVICE_ACCOUNT', SERVICE_ACCOUNT)
    return key


def push(key, email=SERVICE_ACCOUNT):
    """A Pub/Sub push of a new purchase, as its service account signs it."""
    now = int(time.time())
    token = jwt.encode({'iss': 'https://accounts.google.com', 'aud': 'https://api.dumpus.app/store/google',
                        'email': email, 'email_verified': True, 'iat': now, 'exp': now + 3600}, key, algorithm='RS256')
    notification = {'version': '1.0', 'packageName': 'app.dumpus.app', 'eventTimeMillis': str(now * 1000),
                    'oneTimeProductNotification': {'version': '1.0', 'notificationType': 1,
                                                   'purchaseToken': 'token', 'sku': 'supporter'}}
    data = base64.b64encode(json.dumps(notification).encode()).decode()
    return {'headers': {'Authorization': f'Bearer {token}'},
            'json': {'message': {'data': data, 'messageId': '1'}, 'subscription': 'projects/p/subscriptions/s'}}


@pytest.mark.parametrize('environment, platform', [('Production', 'iOS'), ('Sandbox', 'iOS, sandbox')])
def test_an_apple_purchase_posts_with_its_platform(client, apple, posts, environment, platform):
    response = client.post('/store/apple', json={'signedPayload': apple.purchase(environment)})

    assert response.status_code == 200
    [embed] = [post['embeds'][0] for post in posts]
    assert embed['title'] == f'New supporter ({platform})'
    assert embed['description'] == 'Product: supporter\nPrice: 1.59 EUR\nCountry: FRA\nTransaction: …456789'


def test_an_apple_notification_from_another_chain_posts_nothing(client, apple, posts):
    response = client.post('/store/apple', json={'signedPayload': AppleChain().purchase('Production')})

    assert response.status_code == 400
    assert posts == []


def test_a_google_purchase_posts_with_its_platform(client, google, posts):
    response = client.post('/store/google', **push(google))

    assert response.status_code == 204
    assert [post['embeds'][0]['title'] for post in posts] == ['New supporter (Android)']


def test_a_google_push_from_another_service_account_posts_nothing(client, google, posts):
    response = client.post('/store/google', **push(google, email='someone@elsewhere.iam.gserviceaccount.com'))

    assert response.status_code == 401
    assert posts == []
