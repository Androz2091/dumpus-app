#!/usr/bin/env bash
#
# Adds `package_process_status.package_version` to the production database,
# once, before the code that reads the column is deployed: that code selects it
# on every read of the table, so the other order fails every package call. The
# code that's live today ignores the column, and adding a nullable column with
# no default doesn't rewrite the table.
#
# PostgreSQL is in private subnets, so the statement runs from a one-off Fargate
# task, on the worker's current image, network and secrets, under a task
# definition family of its own: the forwarder keeps starting the worker's.
#
# Usage: AWS_PROFILE=androz api/scripts/add-package-version-column.sh

set -euo pipefail

export AWS_REGION="${AWS_REGION:-eu-west-1}"

# Waits a second at most per try, so live calls are never held up for longer.
# A Lambda frozen with a transaction open holds a read lock on the table until
# it thaws or goes, which no try gets past, so those are ended: nothing is
# waiting on them.
read -r -d '' code <<'PY' || true
import os
import time

import secrets_loader
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

engine = create_engine(os.environ['POSTGRES_URL'])
for attempt in range(60):
    try:
        with engine.begin() as conn:
            conn.execute(text("SET LOCAL lock_timeout = '1s'"))
            conn.execute(text('ALTER TABLE package_process_status ADD COLUMN IF NOT EXISTS package_version varchar(255)'))
        break
    except OperationalError as e:
        if e.orig.pgcode != '55P03':
            raise
    with engine.begin() as conn:
        ended = conn.execute(text("""
            SELECT pg_terminate_backend(pid) FROM pg_stat_activity
            WHERE datname = current_database() AND usename = current_user
            AND state = 'idle in transaction' AND state_change < now() - interval '5 minutes'
        """)).fetchall()
    print(f'try {attempt + 1}: the table is busy, ended {len(ended)} idle transactions')
    time.sleep(5)
with engine.connect() as conn:
    print(conn.execute(text("""
        SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_name = 'package_process_status' AND column_name = 'package_version'
    """)).one())
PY

family=dumpus-prod-add-package-version-column

network=$(aws lambda get-function-configuration --function-name dumpus-prod-forwarder --query Environment.Variables)
cluster=$(jq -r .ECS_CLUSTER <<<"$network")
subnets=$(jq -r .ECS_SUBNETS <<<"$network")
security_groups=$(jq -r .ECS_SECURITY_GROUPS <<<"$network")

definition=$(aws ecs describe-task-definition --task-definition dumpus-prod-worker --query taskDefinition)
container=$(jq -r '.containerDefinitions[0].name' <<<"$definition")
log_group=$(jq -r '.containerDefinitions[0].logConfiguration.options["awslogs-group"]' <<<"$definition")

aws ecs register-task-definition --cli-input-json "$(jq --arg family "$family" --arg code "$code" '
  .family = $family
  | .containerDefinitions[0].entryPoint = ["python", "-u", "-c", $code]
  | {family, taskRoleArn, executionRoleArn, networkMode, containerDefinitions, requiresCompatibilities, cpu, memory, runtimePlatform}
  | with_entries(select(.value != null))
' <<<"$definition")" > /dev/null

task=$(aws ecs run-task --cluster "$cluster" --launch-type FARGATE --task-definition "$family" \
  --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$security_groups],assignPublicIp=DISABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "task: $task"

aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"

aws logs get-log-events --log-group-name "$log_group" --log-stream-name "task/$container/${task##*/}" \
  --query 'events[].message' --output text | tr '\t' '\n'

exit_code=$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task" --query 'tasks[0].containers[0].exitCode' --output text)
echo "exit code: $exit_code"
[ "$exit_code" = "0" ]
