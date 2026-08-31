# Security policy

## Supported versions

The latest major release receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository:

<https://github.com/sushinaito/ignore-drift/security/advisories/new>

Do not open a public issue for an undisclosed vulnerability. Include affected
versions, impact, reproduction steps, and any suggested mitigation. You should
receive an initial response within seven days.

## Trust model

`ignore-drift` runs local Git and npm commands and reads path metadata and ignore
files. npm inventory always uses `--ignore-scripts`. It does not read file
contents for secret detection, contact a service, upload repository data, or run
Dockerfiles. A repository's Git configuration and npm installation remain part
of the local trust boundary.
