import os
import requests

def send_internal_notification(payload):

    wh_url = os.getenv('WH_URL')

    if wh_url:
        # A notice that can't go out must not fail the package it's about. The
        # exception's message quotes the webhook's URL, its secret.
        try:
            requests.post(wh_url, json=payload, timeout=5)
        except requests.RequestException as e:
            print(f'internal notification failed: {type(e).__name__}')
