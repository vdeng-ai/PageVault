# Releasing PageVault

PageVault releases are tag-driven after v1.0.

## Versioning

PageVault follows Semantic Versioning:

- patch: compatible bug, security, reliability, or performance fixes;
- minor: compatible small features or UX improvements;
- major: intentional breaking API/schema/architecture changes.

All workspace package versions must match the root version.

## Prepare a release

1. Update the package versions.
2. Add the release entry to `CHANGELOG.md`.
3. Run:

```bash
pnpm run release:check
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

4. Ensure Docker and Playwright workflows are green.
5. Merge the release preparation to `main`.
6. Create and push the matching tag, for example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The Release workflow validates the tag/version/changelog contract, reruns the repository checks, extracts the matching changelog section, and creates the GitHub Release.

## Release policy

Do not create a release tag from an unmerged feature branch.

Do not reuse or move a published release tag.

If a release workflow fails before the GitHub Release is created, fix the release contract on `main`, create a new version/tag when the failed tag has already been published externally, and preserve the audit trail rather than rewriting history.
