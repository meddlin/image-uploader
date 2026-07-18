# Container Scanning

Automated container scanning takes place with two GitHub actions workflows.

- `container-security.yml`
- `container-security-report.yml`

## Data Flow

- [container-security.yml (line
38)](/Users/darrienrushing/git/image-uploader/.github/workflows/container-security.yml:38) builds
and scans both images with read-only permissions.
- It uploads the JSON reports as a seven-day
artifact. 
- [container-security-report.yml (line
3)](/Users/darrienrushing/git/image-uploader/.github/workflows/container-security-report.yml:3) runs
automatically when “Container security” completes.
- It downloads that artifact, formats the
vulnerability table, and creates or updates one PR comment.