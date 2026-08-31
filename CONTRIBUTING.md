# Contributing

Thanks for improving `ignore-drift`.

## Development

Requirements: Node.js 20 or newer, npm, and Git.

```sh
git clone https://github.com/sushinaito/ignore-drift.git
cd ignore-drift
npm ci
npm run check
```

Add a regression test for behavior changes. Tests must use temporary Git
repositories and must not depend on Docker or network access. Keep the CLI's
exit-code contract and JSON `schemaVersion` stable within a major release.

## Pull requests

1. Explain the user-visible problem and why it belongs in the cross-boundary
   exposure scope.
2. Include tests and update the README or changelog when behavior changes.
3. Run `npm run check` and `npm pack --dry-run`.
4. Avoid adding a new runtime dependency when a platform tool is the more
   authoritative source of truth.

By participating, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
