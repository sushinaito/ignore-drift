# Public-work and differentiation research

Research snapshot: 2026-08-31.

## Honest conclusion

The original Git-versus-Docker MVP was not unique. A broader search found direct
and stronger public work that the initial search missed. No finite search can
prove that a project has no duplication with *all* public work, so this document
records what was searched, what overlaps, and the narrower claim this project
can defend.

The release scope is differentiated as a policy-driven comparison of effective
Git, Docker, and npm package exposure. Searches found multi-ignore generators
and single-boundary auditors, but no tool performing that three-surface exposure
audit with one reasoned allow policy and CI report.

## Direct and adjacent work

| Project | What it does | Relationship to `ignore-drift` |
| --- | --- | --- |
| [`oursky/action-check-dockerignore`](https://github.com/oursky/action-check-dockerignore) | GitHub Action requiring `.dockerignore` to be a superset of `.gitignore`. | Directly overlaps the original Git→Docker check. It is why the project was broadened. |
| [`dockerignore-audit`](https://github.com/Dtoxic28/dockerignore-audit) | Deep Docker/Compose context inventory, secret-prone paths, context size, `COPY`/`ADD`, effective ignore files, explanations, and CI annotations. | The stronger choice for Docker-only auditing. `ignore-drift` does not reproduce its Compose, size, or Dockerfile analysis. |
| [`dockerignore-guard`](https://github.com/agentlaunchops-ai/dockerignore-guard) | Docker context guardrails, sensitive/noisy path checks, broad-copy checks, and SARIF. | Adjacent Docker security scanner; no npm exposure comparison. |
| [`dockerignore-doctor`](https://github.com/funnyhcat-dotcom/dockerignore-doctor) | Checks a recommended `.dockerignore` baseline. | Adjacent policy/best-practice checker. |
| [`gitignore-to-dockerignore`](https://github.com/LinusU/gitignore-to-dockerignore) | Converts nested Git ignore rules into an equivalent Docker ignore file. | Generator, not an effective cross-surface audit. |
| [`dignore`](https://github.com/ssumoo/dignore), [`stevedore`](https://jonasbn.github.io/stevedore/), and [`docker-show-context`](https://github.com/pwaller/docker-show-context) | Inspect or explain Docker context membership and size. | Useful single-surface inspectors. |
| [IgnoreForge](https://marketplace.visualstudio.com/items?itemName=AnandShah.ignoreforge) and other ignore generators | Generate `.gitignore`, `.dockerignore`, `.npmignore`, formatter ignores, and other templates. | Multi-file generation, not actual artifact exposure or drift policy. |
| [`npm-packlist`](https://github.com/npm/npm-packlist) / `npm pack --dry-run` | Compute npm package membership. | Authoritative npm mechanisms used or mirrored by packaging tools; they do not compare against Docker and Git exposure. |

## Searches performed

The research used:

- GitHub repository-name, description, README, and code searches for
  combinations of `gitignore`, `dockerignore`, `npmignore`, `compare`, `audit`,
  `drift`, `context`, `security`, and `exposure`.
- npm registry searches for the same terms and package names.
- PyPI, RubyGems, and public web searches for cross-ignore and context-audit
  tools.
- Direct README and release inspection for every close result above.

The `ignore-drift` package name was unclaimed on npm at the snapshot date.

## Primary behavior sources

- [Git `gitignore` documentation](https://git-scm.com/docs/gitignore) defines
  ignore precedence and notes that tracked files are not affected.
- [Docker build-context documentation](https://docs.docker.com/build/concepts/context/#dockerignore-files)
  defines context filtering, pattern behavior, and Dockerfile-specific ignore
  precedence.
- [npm package files documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#files)
  and the [npm files/ignores notes](https://github.com/npm/cli/wiki/Files-%26-Ignores)
  define `files`, `.npmignore`, `.gitignore` fallback, and automatic package
  membership.

## Defensible product boundary

`ignore-drift` answers one question:

> Which paths are intentionally local according to Git but still cross a Docker
> or npm distribution boundary, and which of those differences has the project
> explicitly approved with a reason?

It does not claim to be a full Dockerfile linter, Docker context optimizer,
secret-content scanner, package-entry-point validator, or ignore-file generator.
