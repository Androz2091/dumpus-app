"""Fargate worker entrypoint.

Reads PACKAGE_STATUS_ID and PACKAGE_ID from the environment, takes the
package's link from S3, processes the package, exits 0 on success and 1 on
unhandled failure. The forwarder Lambda passes the two ids as container env
overrides on the ecs.run_task() call.

Why a plain script instead of the Lambda handler:
- No 15-min wall clock cap (heavy packages can run for ~30 min).
- No 3008 MB memory cap on starter AWS accounts (Fargate goes up to 120 GB).
- Process exit code drives ECS task state, so failures show up in
  CloudWatch + the ECS console without any glue code.
"""
import os
import sys
import traceback

from botocore.exceptions import ClientError

import secrets_loader  # noqa: F401  -- side effect: hydrate env from SM
import blob_storage
from tasks import process_package


def main() -> int:
    package_status_id = int(os.environ['PACKAGE_STATUS_ID'])
    package_id = os.environ['PACKAGE_ID']

    try:
        link = blob_storage.take_link(package_status_id)
    except ClientError as e:
        # A second task for the same message finds the link taken: the row is
        # left to the task that has it.
        print(f'package {package_id}: no link to take ({e.response["Error"]["Code"]})', file=sys.stderr)
        return 1

    try:
        process_package(
            package_status_id,
            package_id,
            link,
            worker_name='regular_process',
        )
        return 0
    except Exception as e:
        print(f'package {package_id} failed: {e}', file=sys.stderr)
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    sys.exit(main())
