# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-31

### Added

- Effective Git, Docker, and npm package exposure comparison.
- `ID001` Docker-context and `ID101` npm-package findings.
- Path-based sensitive-file classification with custom sensitive globs.
- Reasoned allow policy in `.ignore-drift.json` with a published JSON Schema.
- Dockerfile-specific ignore-file precedence and `--dockerfile` selection.
- Docker's mandatory inclusion of the selected Dockerfile and effective ignore file.
- npm inventory through script-disabled `npm pack --dry-run`.
- Human, JSON schema v2, SARIF 2.1.0, and GitHub Actions output.
- `explain` and `init` commands, library API, and TypeScript declarations.
- Fail-closed path limits and cross-platform automated tests.

[1.0.0]: https://github.com/sushinaito/ignore-drift/releases/tag/v1.0.0
