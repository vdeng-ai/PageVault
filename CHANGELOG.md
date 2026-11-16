# Changelog

All notable PageVault changes are documented here. PageVault follows Semantic Versioning from v1.0.0 onward.

## [Unreleased]

## [1.3.0] - Unreleased

### Added

- optional, admin-host-only stateless MCP upload endpoint with `get_upload_policy`, `upload_asset` and `publish_text`, OpenAI file-parameter metadata, private-by-default writes and existing retry-safe storage;
- predefined-client OAuth with PKCE S256, existing administrator login/consent, resource-bound hashed rotating tokens, immediate revocation and bounded token retention in the existing D1/SQLite database;
- a collapsible ChatGPT / MCP connection panel, static upload guide, portable private-plugin packaging script and deployment/capacity documentation;
- integration coverage with the official MCP client, real SQLite/local storage, unsafe download targets, quota-bounded batches, and browser authorization/publishing/revocation.
- a repeatable `test:mcp:worker` smoke check using isolated local workerd/D1/R2 for OAuth, publishing, token rotation/revocation and scheduled retention; enforced before CI/deployment.
- English and Simplified Chinese README walkthroughs for enabling MCP, connecting ChatGPT, saving/publishing files, tool limits, and packaging a private plugin.

### Changed

- batch R2 retention deletion, set-based metadata updates and multi-row audit inserts; add a live-expiry partial index and configurable daily GC batch (default 100, cap 500);
- stop issuing per-file cache purges for already expired content, whose D1 state is checked before cache access;
- optionally prune expired OAuth metadata within the existing daily maintenance invocation; no new Cloudflare product or Cron.

### Compatibility

- apply additive migrations `0008_mcp_oauth.sql` and `0009_gc_active_expiry.sql` before deployment; Docker applies both on startup;
- MCP remains disabled unless `MCP_ENABLED=true`; configure the OAuth client/callback separately;
- existing REST uploads, original bytes, file formats, administrator sessions and public share URLs remain compatible. This version has not been tagged or published.

## [1.2.0] - 2026-11-11

### Changed

- open HTML, PDF, image, and Markdown shares in immersive viewers with a compact tools menu, keeping content prominent on desktop and mobile;

### Added

- render Mermaid diagrams in local Markdown previews, authenticated previews, and public readers using self-hosted, on-demand browser assets, with theme-aware SVG output and unchanged original files;
- automatically extract HTML/Markdown titles and share descriptions once during upload, with bounded parsing and the existing file-type/size fallback; persist descriptions with migration `0007_share_description.sql` and track SQLite migrations so restarts apply each migration only once;
- add a collapsible API-key usage guide with an instance-specific cURL example, copyable AI integration instructions, and static `/llms.txt` and `/upload-api.md` documentation on the admin hostname.

### Fixed

- restore the detail-page encoded-link action and percent-encode copied share/raw URLs across upload, list, and detail views for messaging-app compatibility, while keeping displayed URLs readable;
- align the browser tab icon with the muted violet visual system, support light and dark browser themes, and share the versioned favicon across admin, public viewers, and error pages;
- load dashboard statistics independently of operations metadata, and report missing operations tables with an explicit database-migration error;
- build deployment artifacts in the deployment job itself instead of depending on files created on another GitHub Actions runner;
- wait for upload policy resolution before publishing, revalidate selected files when the limit arrives, and check the current limit again at submission;
- document D1 migration token permissions and surface authorization troubleshooting in failed deployment summaries.

## [1.1.0] - 2026-10-11

PageVault v1.1.0 refines the publishing, content management, and reading experience while preserving the v1 API and share URL contract.

### Changed

- unify the admin workspace, local Markdown preview, and public reader around warm neutral surfaces, graphite text, and a muted violet accent, with consistent typography and controls;
- compact the publishing workbench, keep the publish action reachable, and focus the success state on one primary copy-link action;
- simplify the content library into a five-column table with expandable metadata, advanced filters, and three grouped batch-action menus;
- make mobile previews collapsible, keep publishing above bottom navigation, and reduce public-reader chrome so content starts earlier;
- prioritize content titles in detail views, collapse technical metadata by default, remove duplicate dashboard metrics, and link lifecycle metrics to matching paginated file filters.

### Added

- local success feedback after clipboard writes, focused publishing confirmation, and reduced-motion-aware interaction feedback;
- unsaved-edit protection for workspace navigation, browser Back/Forward, refresh, and sign-out.

### Documentation

- refresh the English and Chinese README screenshots to show the current light-theme publishing workbench.

### Compatibility

- preserve original file bytes, existing `/p/:slug` and `/raw/:slug` URLs, and the lightweight Cloudflare and Docker runtime boundaries;
- no database migration is required for this release.

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
[1.1.0]: https://github.com/vdeng-ai/PageVault/releases/tag/v1.1.0
