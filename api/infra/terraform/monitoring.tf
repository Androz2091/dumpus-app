# SNS topic that ops alarms publish to. A small Lambda forwards each
# message to the Discord WH_URL webhook so notifications land in the
# same channel as package-processed notices.
resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

# Anything in the DLQ means the forwarder Lambda failed to launch a Fargate
# worker task twice in a row (capacity / IAM / network). Always worth a look.
# Process-level failures inside a worker task surface as an ERRORED package
# row + Discord webhook from process_package() — they don't go through the
# DLQ because the SQS message was already acked by the forwarder.
resource "aws_cloudwatch_metric_alarm" "worker_dlq_depth" {
  alarm_name          = "${local.name}-worker-dlq-not-empty"
  alarm_description   = "Forwarder Lambda failed to launch a Fargate worker task. Check /aws/lambda/${aws_lambda_function.forwarder.function_name} and the worker log group ${aws_cloudwatch_log_group.worker.name}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# An API Lambda that fails outright: a cold start that can't load, or an
# exception no view catches. Views answer their own errors with a 500, which
# `api_5xx` counts.
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.name}-api-errors"
  alarm_description   = "The API Lambda failed. Check /aws/lambda/${aws_lambda_function.api.function_name}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# What Lambda's own errors don't count, like PostgreSQL refusing a connection. A
# lookup answers 500 now and then when Discord doesn't answer, hence the margin.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  alarm_description   = "The API answered 5xx several times. Check the \"request:\" lines in /aws/lambda/${aws_lambda_function.api.function_name} and the gateway's in ${aws_cloudwatch_log_group.apigw.name}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5xx"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.api.id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# Calls turned away by the API's reserved concurrency, see lambda.tf.
resource "aws_cloudwatch_metric_alarm" "api_throttles" {
  alarm_name          = "${local.name}-api-throttles"
  alarm_description   = "API calls were turned away at the concurrency cap. Check the \"request:\" lines in /aws/lambda/${aws_lambda_function.api.function_name} for the routes behind the burst."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.api.function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# PostgreSQL takes about 80 connections on db.t4g.micro, and past them calls
# fail. API instances only hold one during a call (`db.py`).
resource "aws_cloudwatch_metric_alarm" "db_connections" {
  alarm_name          = "${local.name}-db-connections"
  alarm_description   = "PostgreSQL is close to its connection limit. Check the \"request:\" lines in /aws/lambda/${aws_lambda_function.api.function_name} and the running worker tasks."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 60
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.main.identifier
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
}

# --- Discord notifier Lambda ---

data "archive_file" "notifier" {
  type        = "zip"
  source_file = "${path.module}/notifier/notifier.py"
  output_path = "${path.module}/notifier/notifier.zip"
}

# Pulls the latest WH_URL out of Secrets Manager at apply time so the
# notifier doesn't need its own runtime SM read.
data "aws_secretsmanager_secret_version" "wh_url_current" {
  secret_id = aws_secretsmanager_secret.wh_url.id
}

resource "aws_iam_role" "notifier" {
  name               = "${local.name}-notifier-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "notifier_basic" {
  role       = aws_iam_role.notifier.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "notifier" {
  name              = "/aws/lambda/${local.name}-alert-notifier"
  retention_in_days = 30
}

resource "aws_lambda_function" "notifier" {
  function_name    = "${local.name}-alert-notifier"
  role             = aws_iam_role.notifier.arn
  filename         = data.archive_file.notifier.output_path
  source_code_hash = data.archive_file.notifier.output_base64sha256
  handler          = "notifier.handler"
  runtime          = "python3.13"
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      WH_URL = data.aws_secretsmanager_secret_version.wh_url_current.secret_string
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.notifier_basic,
    aws_cloudwatch_log_group.notifier,
  ]
}

resource "aws_lambda_permission" "sns_invoke_notifier" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

resource "aws_sns_topic_subscription" "notifier" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.notifier.arn
}
