# GitHub Actions OIDC role for the deploy workflow.
# Reuses the OIDC provider already created by the dumpus-api stack.

locals {
  github_oidc_enabled = var.github_repository != ""
}

data "aws_iam_policy_document" "github_assume" {
  count = local.github_oidc_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        for branch in var.github_deploy_branches :
        "repo:${var.github_repository}:ref:refs/heads/${branch}"
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  count              = local.github_oidc_enabled ? 1 : 0
  name               = "${local.name}-${var.environment}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json
}

data "aws_iam_policy_document" "github_deploy" {
  count = local.github_oidc_enabled ? 1 : 0

  statement {
    sid = "S3Sync"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetObject",
    ]
    resources = [
      aws_s3_bucket.site.arn,
      "${aws_s3_bucket.site.arn}/*",
    ]
  }

  statement {
    sid       = "CloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.site.arn]
  }

  # dumpus.app, deployed from `landing/` by deploy-landing.yml. OpenTofu
  # doesn't manage its bucket or distribution.
  statement {
    sid = "LandingS3Sync"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetObject",
    ]
    resources = [
      "arn:aws:s3:::dumpus-app-landing",
      "arn:aws:s3:::dumpus-app-landing/*",
    ]
  }

  statement {
    sid       = "LandingCloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::436630934006:distribution/E3QLCNIH63M129"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  count  = local.github_oidc_enabled ? 1 : 0
  name   = "${local.name}-${var.environment}-github-deploy"
  role   = aws_iam_role.github_deploy[0].id
  policy = data.aws_iam_policy_document.github_deploy[0].json
}
