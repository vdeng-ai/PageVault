# Changelog

All notable PageVault changes are documented here. PageVault follows Semantic Versioning from v1.0.0 onward.

## [Unreleased]

### Fixed

- build deployment artifacts in the deployment job itself instead of depending on files created on another GitHub Actions runner;
- wait for upload policy resolution before publishing, revalidate selected files when the limit arrives, and check the current limit again at submission;
- document D1 migration token permissions and surface authorization troubleshooting in failed deployment summaries.

## [1.0.1] - 2026-10-07

PageVault v1.0.1 is a focused reliability release for public revocation, operation outcomes, uploads, and production deployment.

### Fixed

- validate current public visibility, status, and expiry before serving cached share or raw content, so disabling or making an item private takes effect without waiting for another Cloudflare cache location to expire;
- exclude HEAD requests from public access counting;
- treat audit-log persistence as best-effort after the primary operation commits, preventing successful uploads, updates, or deletes from being reported as failures solely because audit logging failed;
- bound multipart request bodies before full form parsing and expose the configured upload limit to the admin UI for client-side rejection of oversized files.

### Operations

- gate production deployment on release checks, typechecking, linting, unit tests, build, and Playwright browser tests for the same commit;
- inspect and apply pending D1 migrations in the production workflow before deployment;
- verify the admin readiness endpoint and public static share asset after deployment.

## [1.0.0] - 2026-10-06

PageVault v1.0 is the first stable release of the personal-first, Cloudflare-Free-first publishing architecture.

### Added

- capability-driven support for HTML, Markdown, PDF, SVG, PNG, JPEG, and WebP;
- stable share URLs under `/p/:slug` and original-content URLs under `/raw/:slug`;
- PDF byte-range streaming;
- file-signature/content validation before persistence;
- concurrent, idempotent API-key uploads;
- Playwright reliability coverage across the main publishing flows;
- bounded retention cleanup and incremental DB/storage reconciliation;
- health/readiness probes, graceful Docker shutdown, non-root containers, and backup/restore verification;
- lightweight admin search, filtering, pagination, batch actions, share/raw link management, and targeted indexes;
- Share Viewer 2.0 with mobile controls, HTML/PDF fullscreen, image fit/background controls, and social metadata;
- request IDs, lightweight login/API-key abuse limits, audit visibility, and last-maintenance status.

### Security

- admin and public hostnames remain isolated;
- public HTML stays sandboxed without `allow-same-origin`;
- original storage remains private behind PageVault access checks;
- public fast paths do not add per-view audit database writes.

### Operations

- Cloudflare remains Worker + Workers Static Assets + D1 + private R2 + one daily Cron;
- Docker remains Node.js + SQLite + local filesystem;
- schema migrations through `0006_admin_list_indexes.sql` form the v1.0 baseline.

### Compatibility

- existing PageVault share URLs remain valid;
- upgrades from any repository state using migrations `0001` through `0006` are forward-compatible when all pending migrations are applied in order;
- schema downgrades are not automatic. Restore a pre-upgrade backup when a true rollback is required.

[1.0.0]: https://github.com/vdeng-ai/PageVault/releases/tag/v1.0.0

[1.0.1]: https://github.com/vdeng-ai/PageVault/releases/tag/v1.0.1
