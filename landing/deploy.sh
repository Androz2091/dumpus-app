#!/usr/bin/env bash
# Deploy dumpus-landing to AWS (S3 + CloudFront).
# Requires: pnpm, awscli v2, AWS creds with access to the dumpus-app prod account.
#
# A push to `main` that touches `landing/` does the same through
# `.github/workflows/deploy-landing.yml`; this is for a deploy by hand.

set -euo pipefail

# From the repo root, `dist/` and `pnpm install` would be the app's.
cd "$(dirname "${BASH_SOURCE[0]}")"

BUCKET="dumpus-app-landing"
DISTRIBUTION_ID="E3QLCNIH63M129"

pnpm install --frozen-lockfile
pnpm run build

aws s3 sync dist/ "s3://${BUCKET}/" \
    --delete \
    --cache-control "public, max-age=3600"

aws cloudfront create-invalidation \
    --distribution-id "${DISTRIBUTION_ID}" \
    --paths '/*' \
    --query 'Invalidation.{Id:Id,Status:Status}'

echo "Deployed. Live at https://dumpus.app"
