# ignore-drift

[![CI](https://github.com/sushinaito/ignore-drift/actions/workflows/ci.yml/badge.svg)](https://github.com/sushinaito/ignore-drift/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Audit which Git-ignored files escape into Docker build contexts and npm
packages.

```text
$ ignore-drift
ignore-drift: 2 findings (1 error, 1 warning)

ERROR ID001 .env [docker]
  A potentially sensitive Git-ignored path is exposed to the Docker build context.

WARNING ID101 dist/ [npm]
  A Git-ignored path is exposed to the npm package.
```

An ignored file is not necessarily private. `.gitignore`, `.dockerignore`, and
npm packaging decide different boundaries with different rules. `ignore-drift`
asks each tool for its effective file set, then reports local-only paths that
cross a distribution boundary.

## Why this project exists

Excellent tools already audit Docker contexts. `ignore-drift` deliberately does
not try to replace them. Its distinct job is one cross-boundary policy for the
same path across Git, Docker, and npm.

| Path | Git | Docker | npm | Result |
| --- | --- | --- | --- | --- |
| `.env` | ignored | included | excluded | Error: unexpected Docker exposure |
| `dist/` | ignored | excluded | included | Warning: document intentional package exposure |
| `src/` | tracked | included | included | No drift |

See [the public-work comparison](docs/research.md) for direct overlaps,
alternatives, and the evidence behind this scope. No finite search can prove
universal uniqueness; the project claims a specific differentiator, not that
no similar code can exist.

## Quick start

Requires Node.js 20 or newer, Git, and npm when the npm surface is active.

From the tagged GitHub release:

```sh
npx --yes github:sushinaito/ignore-drift#v1.0.0
```

After the npm package is published:

```sh
npx ignore-drift
```

The default command auto-enables Docker when the context has `.dockerignore`,
`Dockerfile`, or `Containerfile`, and npm when the root has a publishable
`package.json`. Force a surface when auto-detection is not appropriate:

```sh
ignore-drift --surface docker
ignore-drift --surface docker,npm
ignore-drift --dockerfile docker/release.Dockerfile
```

## Findings

| Code | Boundary | Meaning | Severity |
| --- | --- | --- | --- |
| `ID001` | Docker | Git ignores a path that the effective Docker context includes. | Error for likely secrets and `.git`; warning otherwise. |
| `ID101` | npm | Git ignores a path that `npm pack --dry-run` includes. | Error for likely secrets; warning otherwise. |

Only unapproved exposure drift fails the run. Tracked files omitted from an
artifact are outside this tool's purpose; package and Dockerfile linters cover
that problem better.

## Intentional drift policy

Compiled output is commonly Git-ignored and intentionally published. Generate
a policy file, then document that decision instead of muting the entire rule:

```sh
ignore-drift init
```

```json
{
  "$schema": "https://raw.githubusercontent.com/sushinaito/ignore-drift/v1.0.0/schema/ignore-drift.schema.json",
  "surfaces": {
    "docker": "auto",
    "npm": "auto"
  },
  "allow": [
    {
      "code": "ID101",
      "surface": "npm",
      "path": "dist/**",
      "reason": "Compiled output is the public package API."
    }
  ],
  "sensitivePatterns": ["**/*.vault"]
}
```

Every allow rule requires a reason. `--show-allowed` includes approved drift in
human output. JSON always retains it under `allowedFindings` for auditability.

## Explain one path

```sh
ignore-drift explain .env
```

```text
.env
  Git:    ignored — .gitignore:4 (".env")
  Docker: included — no matching rule
  npm:    excluded — example-package@1.0.0
  Result: ERROR ID001 [docker] — A potentially sensitive Git-ignored path is exposed to the Docker build context.
```

## CI and output formats

```sh
ignore-drift --fail-on warning
ignore-drift --format json
ignore-drift --format sarif > ignore-drift.sarif
ignore-drift --format github
```

GitHub Actions example:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v7
  with:
    node-version: 24
- run: npx --yes ignore-drift --format github --fail-on warning
```

Exit codes:

- `0`: no unapproved finding at the configured threshold
- `1`: an unapproved finding reached the configured threshold
- `2`: usage, configuration, tool, or incomplete-scan error

The default threshold is `error`. `--fail-on warning` provides a strict gate;
`--fail-on never` keeps the audit advisory. Path limits fail closed rather than
returning a misleading partial success.

## CLI

```text
ignore-drift [check] [directory] [options]
ignore-drift explain <path> [--root <directory>] [options]
ignore-drift init [directory]

--surface <name>    force docker or npm; repeat or comma-separate
--dockerfile <path> select Dockerfile and its effective ignore file
--format <format>   human, json, sarif, or github
--json              alias for --format json
--config <path>     explicit policy file
--show-allowed      include policy-approved findings in human output
--fail-on <level>   error, warning, or never
--max-paths <n>     complete-scan path limit (default: 50000)
```

## How surface inventories are computed

- Git is the authority for tracked, untracked, and ignored paths. Nested ignore
  rules, repository excludes, and user excludes therefore behave as Git does.
- Docker uses a Docker-compatible matcher. `<Dockerfile>.dockerignore` takes
  precedence over the context-root `.dockerignore`, matching Docker's documented
  behavior. The selected Dockerfile and effective ignore file remain included
  as Docker control files even when a pattern matches them.
- npm runs `npm pack --dry-run --json --ignore-scripts`. This honors
  `package.json#files`, `.npmignore`, npm's `.gitignore` fallback, and npm's
  automatic inclusions/exclusions without running lifecycle scripts.

File contents are never read for secret detection; sensitivity is path-based.
No repository data is sent to a service.

## Scope

One invocation audits one Git repository root, the repository root as one
Docker build context, and one root npm package. Version 1 does not discover npm
workspaces or nested Docker context roots. `--dockerfile` selects a Dockerfile
while keeping the repository root as its context. Remote Docker contexts are
not downloaded. Content-based secret scanning is intentionally left to tools
such as Secretlint or Gitleaks.

## API

The ESM package ships TypeScript declarations:

```js
import { explainPath, scanRepository, VERSION } from "ignore-drift";

const report = scanRepository(".", {
  surfaces: ["docker", "npm"],
  configPath: ".ignore-drift.json",
});

console.log(VERSION, report.findings);
console.log(explainPath(".env"));
```

JSON output and the library report use `schemaVersion: 2`; the published schema
is [`schema/report-v2.schema.json`](schema/report-v2.schema.json).

## Development and release

```sh
npm ci
npm run check
npm pack --dry-run
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[RELEASING.md](RELEASING.md).

## License

MIT
