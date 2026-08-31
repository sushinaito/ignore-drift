# Releasing

## Prepare

1. Update `version` in `package.json`, `src/version.js`, and `CHANGELOG.md`.
2. Run `npm ci`, `npm run check`, and `npm pack --dry-run`.
3. Confirm `npm view ignore-drift version` does not already contain the version.
4. Commit, push, and wait for CI to pass.

## Publish

The `release.yml` workflow publishes tags matching `v*` from a GitHub-hosted
runner with OIDC permission and npm provenance.

Before using it, configure npm trusted publishing for:

- GitHub owner: `sushinaito`
- repository: `ignore-drift`
- workflow: `release.yml`
- environment: `npm`
- allowed action: `npm publish`

For the first package publication, npm may require a one-time automation token;
store it as the `NPM_TOKEN` repository secret if trusted publishing cannot be
configured before the package exists. Never commit a token.

Create and push the signed release tag only after the version commit is green:

```sh
git tag -s v1.0.0 -m "ignore-drift v1.0.0"
git push origin v1.0.0
```

After the workflow succeeds, create GitHub release notes from `CHANGELOG.md` and
verify the npm provenance link, package contents, executable, and README.
