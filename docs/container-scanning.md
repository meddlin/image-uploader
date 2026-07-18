# Container Scanning

Automated container scanning takes place with two GitHub Actions workflows:

- [`container-security.yml`](../.github/workflows/container-security.yml)
- [`container-security-report.yml`](../.github/workflows/container-security-report.yml)

## Data Flow

- `container-security.yml` builds and scans both images with read-only permissions. It records each
  stage's outcome and uploads the JSON reports as a seven-day artifact before enforcing the security
  gate.
- `container-security-report.yml` runs when Container security completes, including failed and
  cancelled runs. It downloads the artifact, formats any available vulnerability information, and
  creates or updates one pull request comment.
- When no usable vulnerability information is available, the comment reports that container
  scanning failed to finish and links to the source workflow run.

The reporting workflow must exist on the repository's default branch before Container security runs.
This lets it comment on Dependabot and fork pull requests without giving their untrusted build jobs a
write token.
