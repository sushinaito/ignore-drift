# ignore-drift

Catch Git and Docker ignore mismatches before secrets leak or builds break.

```text
$ ignore-drift
ignore-drift: 1 finding (1 error, 0 warning)

ERROR ID001 .env
  A potentially sensitive Git-ignored path is included in the Docker build context.
  Fix: Add ".env" to .dockerignore or explicitly accept the mismatch.
```

Git and Docker both have ignore files, but they use them for different jobs and
their matching rules are not identical. A file can be safely hidden from Git
while still being sent to a Docker builder, or it can be present in Git but
unavailable to a Dockerfile `COPY`.

## Install and run

Requires Node.js 20 or newer and Git.

Until the first npm release, run the CLI directly from GitHub:

```sh
npx github:sushinaito/ignore-drift
```

Or install it from a checkout:

```sh
npm install
npm link
ignore-drift
```

## What it reports

| Code | Meaning | Default severity |
| --- | --- | --- |
| `ID001` | Git ignores the path, but Docker includes it. | Error for likely secrets and `.git`; warning otherwise. |
| `ID002` | Git tracks or shows the path, but Docker excludes it. | Warning. |

The default exit policy fails only on errors. For a strict CI gate, fail on
warnings too:

```sh
ignore-drift --fail-on warning
ignore-drift --json --fail-on warning
```

Inspect one path and the rules that decided it:

```sh
ignore-drift explain .env
```

```text
.env
  Git:    ignored — .gitignore:4 (".env")
  Docker: included — no matching rule
  Result: ERROR ID001 — A potentially sensitive Git-ignored path is included in the Docker build context.
```

## CLI

```text
ignore-drift [check] [directory] [options]
ignore-drift explain <path> [--root <directory>] [--json]

--fail-on <level>  error, warning, or never (default: error)
--max-paths <n>    candidate-path safety limit (default: 50000)
--json             machine-readable output
```

Exit codes are `0` for success, `1` when a finding reaches the configured
threshold, and `2` for usage or repository errors.

## Scope and limitations

Version 0.1 reads the repository's root `.dockerignore` and the effective local
Git view. It does not yet model Dockerfile-specific ignore files, remote build
contexts, submodules, npm publishing, or formatter ignores. Scans collapse
ignored directories to keep large dependency trees fast; `--max-paths` guards
against unexpectedly large repositories.

See [the research and project selection](docs/research.md) for the alternatives
considered, primary documentation, and why this project is a distinct small
slice rather than another ignore-file generator.

## Development

```sh
npm install
npm run check
npm pack --dry-run
```

## License

MIT
