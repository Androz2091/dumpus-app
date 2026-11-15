"""What the stores report about purchases and refunds, as posts for the
internal webhook (#dumpus-logs), with the platform.

Dumpus sells one product, `supporter`, a one-time purchase on both stores, so
nothing renews. An event without a title here still posts, by its store's
name, so that none goes unseen.

Each store signs what it sends, and what doesn't verify posts nothing: the App
Store with a certificate chain up to Apple's root, Google Play through
Pub/Sub, whose push carries an OIDC token Google signs for the subscription's
service account.
"""
import base64
import json
import os
from pathlib import Path

import jwt
from appstoreserverlibrary.models.Environment import Environment
from appstoreserverlibrary.signed_data_verifier import SignedDataVerifier, VerificationException, VerificationStatus

# The iOS bundle id, and the Android package name.
APP_ID = 'app.dumpus.app'
APP_APPLE_ID = 6450952260
# Apple Root CA - G3, from https://www.apple.com/certificateauthority/, SHA-256
# 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79.
APPLE_ROOT = Path(__file__).with_name('AppleRootCA-G3.cer')

GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
GOOGLE_ISSUERS = ('https://accounts.google.com', 'accounts.google.com')
# Pub/Sub's default audience: the push endpoint. `GOOGLE_PUSH_AUDIENCE`, for a
# server elsewhere.
GOOGLE_AUDIENCE = 'https://api.dumpus.app/store/google'

GREEN, YELLOW, RED, GREY = 0x57F287, 0xFEE75C, 0xED4245, 0x99AAB5

APPLE_EVENTS = {
    'ONE_TIME_CHARGE': ('New supporter', GREEN),
    'CONSUMPTION_REQUEST': ('Refund requested', YELLOW),
    'REFUND': ('Refunded', RED),
    'REFUND_DECLINED': ('Refund declined', GREY),
    'REFUND_REVERSED': ('Refund reversed', GREEN),
    'TEST': ('Test notification', GREY),
}
GOOGLE_ONE_TIME_EVENTS = {
    1: ('New supporter', GREEN),
    2: ('Pending purchase canceled', GREY),
}


class Unverified(Exception):
    """A notification whose signature doesn't check out."""


class NotSetUp(Exception):
    """`GOOGLE_PUSH_SERVICE_ACCOUNT` isn't set."""


def apple_roots():
    return [APPLE_ROOT.read_bytes()]


def _post(title, color, lines):
    post = {'title': title, 'color': color}
    if lines:
        post['description'] = '\n'.join(lines)
    return post


def apple_post(signed_payload):
    """`(event, post)` for an App Store Server Notification V2's signedPayload.

    Raises Unverified. Without online checks, the chain is checked as of when
    Apple signed, so that a retry days later still verifies."""
    for environment in (Environment.PRODUCTION, Environment.SANDBOX):
        app_apple_id = APP_APPLE_ID if environment == Environment.PRODUCTION else None
        verifier = SignedDataVerifier(apple_roots(), False, environment, APP_ID, app_apple_id)
        try:
            notification = verifier.verify_and_decode_notification(signed_payload)
            break
        except VerificationException as e:
            if e.status != VerificationStatus.INVALID_ENVIRONMENT:
                raise Unverified(e.status.name) from e
    else:
        raise Unverified(VerificationStatus.INVALID_ENVIRONMENT.name)

    event = notification.rawNotificationType
    title, color = APPLE_EVENTS.get(event, (f'App Store: {event} {notification.rawSubtype or ""}'.strip(), GREY))
    lines = []
    data = notification.data
    if data and data.signedTransactionInfo:
        try:
            transaction = verifier.verify_and_decode_signed_transaction(data.signedTransactionInfo)
        except VerificationException as e:
            raise Unverified(e.status.name) from e
        lines.append(f'Product: {transaction.productId}')
        if transaction.price is not None and transaction.currency:
            # In thousandths.
            lines.append(f'Price: {transaction.price / 1000:.2f} {transaction.currency}')
        if transaction.storefront:
            lines.append(f'Country: {transaction.storefront}')
        if transaction.transactionId:
            lines.append(f'Transaction: …{transaction.transactionId[-6:]}')
    if data and data.rawConsumptionRequestReason:
        lines.append(f'Reason: {data.rawConsumptionRequestReason}')
    platform = 'iOS, sandbox' if environment == Environment.SANDBOX else 'iOS'
    return event, _post(f'{title} ({platform})', color, lines)


def google_signing_key(token):
    """The key Google signed the token with, from its published keys, which
    `PyJWKClient` keeps."""
    global _google_keys
    if _google_keys is None:
        _google_keys = jwt.PyJWKClient(GOOGLE_KEYS_URL)
    return _google_keys.get_signing_key_from_jwt(token).key


_google_keys = None


def google_post(authorization, body):
    """`(event, post)` for a Pub/Sub push of a Play real-time developer
    notification, or None for another app's.

    Raises NotSetUp, Unverified, or ValueError for a body that isn't a push."""
    service_account = os.getenv('GOOGLE_PUSH_SERVICE_ACCOUNT')
    if not service_account:
        raise NotSetUp()
    token = (authorization or '').removeprefix('Bearer ')
    try:
        claims = jwt.decode(token, google_signing_key(token), algorithms=['RS256'],
                            audience=os.getenv('GOOGLE_PUSH_AUDIENCE', GOOGLE_AUDIENCE), issuer=GOOGLE_ISSUERS)
    except jwt.PyJWTError as e:
        raise Unverified(type(e).__name__) from e
    # Anyone's service account can sign for this audience: only the
    # subscription's is Google Play's.
    if claims.get('email') != service_account or claims.get('email_verified') is not True:
        raise Unverified('service_account')

    try:
        notification = json.loads(base64.b64decode(body['message']['data']))
    except (KeyError, TypeError, ValueError) as e:
        raise ValueError('not a Pub/Sub push') from e
    if not isinstance(notification, dict) or notification.get('packageName') != APP_ID:
        return None

    if 'testNotification' in notification:
        return 'test', _post('Test notification (Android)', GREY, [])
    if one_time := notification.get('oneTimeProductNotification'):
        kind = one_time.get('notificationType')
        title, color = GOOGLE_ONE_TIME_EVENTS.get(kind, (f'Google Play: one-time product event {kind}', GREY))
        return f'one_time_{kind}', _post(f'{title} (Android)', color, [f'Product: {one_time.get("sku")}'])
    if voided := notification.get('voidedPurchaseNotification'):
        lines = ['A refund, a chargeback or a revocation.']
        if order := voided.get('orderId'):
            lines.append(f'Order: …{order[-6:]}')
        if voided.get('refundType') == 2:
            lines.append('A part of the order.')
        return 'voided', _post('Refunded (Android)', RED, lines)
    if subscription := notification.get('subscriptionNotification'):
        kind = subscription.get('notificationType')
        return f'subscription_{kind}', _post(f'Google Play: subscription event {kind} (Android)', GREY, [])
    return 'unknown', _post('Google Play: unknown event (Android)', GREY, [])
