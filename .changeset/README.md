# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets).
It records intended version bumps and generates the changelog on release.

## Adding a changeset

After making a user-facing change, run:

```bash
npm run changeset
```

Pick the bump type (following [semver](https://semver.org/)):

- **patch** — bug fixes and internal changes with no API impact
- **minor** — backwards-compatible new features
- **major** — breaking API changes

Write a short, user-facing summary. This creates a markdown file in
`.changeset/` — commit it alongside your change.

## Releasing

```bash
npm run version   # consume changesets: bump package.json + write CHANGELOG.md
npm run release   # build, test, and publish to npm
```

`npm run version` is typically run on a release branch (or by CI) and committed;
`npm run release` publishes the resulting version.
