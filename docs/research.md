# Landscape research

Research snapshot: 2026-08-31.

The goal was to find a useful, small developer tool without rebuilding an
already-served category. Search is evidence of a gap, not proof that no similar
project exists anywhere.

## Candidates considered

| Candidate | Existing work | Decision |
| --- | --- | --- |
| Cross-worktree conflict detector | [Grove](https://github.com/NathanDrake2406/grove), [Foremerge](https://foremerge.com/), and [Regente](https://regente.dev/) already target early conflict detection and agent coordination. | Rejected: active, direct competitors. |
| Git-only ignore debugger | Git already provides `git check-ignore -v`; [GitIgnore Doctor](https://www.reddit.com/r/sideprojects/comments/1vp6o72/i_built_a_cli_to_audit_gitignore_files_using_git/) packages auditing and explanation around it. | Rejected: useful but duplicative. |
| Docker-only ignore debugger | [dignore](https://github.com/ssumoo/dignore) debugs `.dockerignore`, and Docker documents matching in detail. | Rejected: already served. |
| Cross-system ignore drift auditor | Exact GitHub searches for `ignore drift gitignore dockerignore` and `gitignore dockerignore npmignore compare` returned no repositories; the `ignore-drift` npm name was unclaimed. Existing tools found in broader searches focus on one ignore system or copy one ignore file into another. | Selected: distinct, bounded, and CI-friendly. |

## Why drift is real

These files look similar, but their consumers do not behave identically:

- [Git's documentation](https://git-scm.com/docs/gitignore) says ignore rules
  apply only to untracked files, use precedence across multiple sources, and
  cannot re-include a file when its parent directory has been excluded.
- [Docker's build-context documentation](https://docs.docker.com/build/concepts/context/#dockerignore-files)
  says `.dockerignore` removes content before the context is sent, uses Docker's
  own pattern rules, and allows Dockerfile-specific ignore files.
- [Prettier's CLI documentation](https://prettier.io/docs/cli/#--ignore-path)
  reads both `.gitignore` and `.prettierignore` by default.
- [npm's package documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files)
  combines `files`, `.npmignore`, automatic inclusions, and automatic
  exclusions when it builds a package.

The risky first slice is Git versus Docker:

1. Git-ignored but Docker-included paths can enlarge contexts or send local
   secrets such as `.env` and private keys to a builder.
2. Git-visible but Docker-ignored paths can make `COPY` or `ADD` fail, or produce
   an incomplete image.

## MVP boundary

Version 0.1 compares the effective local Git view with the root
`.dockerignore`. It intentionally does not yet model Dockerfile-specific ignore
files, remote/Git build contexts, npm package contents, or Prettier. Those are
separate increments after the Git/Docker signal is proven useful.

Implementation choices:

- Ask Git for tracked, untracked, and ignored paths instead of reimplementing
  Git's precedence rules.
- Use [`@balena/dockerignore`](https://github.com/balena-io-modules/dockerignore),
  a tested JavaScript port of Docker's matcher, instead of treating the two
  pattern languages as interchangeable.
- Emit stable finding codes and JSON so the tool can run locally or in CI.
