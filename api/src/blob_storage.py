"""S3-backed storage for encrypted package blobs.

The worker uploads the encrypted SQLite directly to S3 (one object per
package). The API generates short presigned GET URLs so clients can
download directly from S3 — bypassing API Gateway, which is slow and
6MB-capped for binary responses.

PACKAGE_DATA_BUCKET must be set; the /blob endpoint requires S3.
"""
import os


def _bucket():
    return os.getenv("PACKAGE_DATA_BUCKET")



def _key(package_id: str, iv: str | None = None) -> str:
    # Flat layout. Package IDs are MD5 hex digests, so no path-traversal risk.
    # The iv in the key means a new blob never overwrites the one being served,
    # and a blob is only ever read with its own iv. Blobs from before that, and
    # the demo, have none.
    return f"packages/{package_id}.{iv}.bin" if iv else f"packages/{package_id}.bin"


def _link_key(package_status_id: int) -> str:
    return f"links/{package_status_id}"


def _client():
    """boto3 S3 client pinned to a regional endpoint with sigv4 + virtual
    addressing — so presigned URLs come out as
    `bucket.s3.<region>.amazonaws.com/...` directly. Without all three,
    boto3 emits the legacy global `bucket.s3.amazonaws.com` URL, which
    S3 308-redirects to the regional endpoint, and browsers CORS-block
    the redirect."""
    import boto3
    from botocore.config import Config

    region = os.environ.get("AWS_REGION", "eu-west-1")
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=f"https://s3.{region}.amazonaws.com",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )


def upload(package_id: str, body: bytes, iv: str | None = None) -> None:
    """Push a blob to S3 under a deterministic key. Same operation for the
    worker's encrypted SQLite and the demo's unencrypted one."""
    _client().put_object(
        Bucket=_bucket(),
        Key=_key(package_id, iv),
        Body=body,
        ContentType="application/octet-stream",
    )


def delete(package_id: str) -> None:
    """Every blob of the package: a reprocess leaves the one it replaced for
    the bucket's lifecycle rule to expire."""
    client = _client()
    listed = client.list_objects_v2(Bucket=_bucket(), Prefix=f"packages/{package_id}.")
    for blob in listed.get("Contents", []):
        client.delete_object(Bucket=_bucket(), Key=blob["Key"])


def presigned_url(package_id: str, ttl_seconds: int = 300, iv: str | None = None) -> str:
    """Return a short-lived URL the client can GET directly from S3."""
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket(), "Key": _key(package_id, iv)},
        ExpiresIn=ttl_seconds,
    )


def exists(package_id: str, iv: str | None = None) -> bool:
    """True if a blob has been uploaded for this package."""
    from botocore.exceptions import ClientError

    try:
        _client().head_object(Bucket=_bucket(), Key=_key(package_id, iv))
        return True
    except ClientError as e:
        # boto3 reports object-not-found in several flavors depending on the
        # SDK version; check the HTTP status, which is always 404.
        if e.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return False
        raise


def put_link(package_status_id: int, link: str) -> None:
    _client().put_object(Bucket=_bucket(), Key=_link_key(package_status_id), Body=link.encode())


def take_link(package_status_id: int) -> str:
    client = _client()
    key = _link_key(package_status_id)
    link = client.get_object(Bucket=_bucket(), Key=key)["Body"].read().decode()
    client.delete_object(Bucket=_bucket(), Key=key)
    return link
