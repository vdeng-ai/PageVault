# AGENTS.md

## Product intent

PageVault is a **personal-first, Cloudflare-Free-first, lightweight AI-content publisher**. Optimize for small code paths, low operational complexity, low CPU usage, low D1 write amplification, and predictable R2 access.

Read `docs/roadmap.md` before proposing architectural work.

## Hard constraints

- Keep the Cloudflare core to Worker + Workers Static Assets + D1 + private R2 + one daily Cron.
- Do not introduce queues, Durable Objects, Redis, PostgreSQL, external search services, or always-on workers unless an existing core component is being replaced and the change is explicitly approved.
- Do not add DOCX/PPTX conversion, OCR, video processing, server-side screenshots, antivirus daemons, or server-side image rendering.
- Supported core formats are HTML, Markdown, PDF, SVG, PNG, JPEG, and WebP.
- Preserve original file bytes. Prefer streaming and range reads over server-side transformation.
- Avoid unbounded D1 scans, unbounded R2 listings, and D1 writes on every public page view.
- Keep existing public share URLs compatible whenever practical.

## Engineering priorities

When tradeoffs exist, prefer this order:

1. correctness and data safety;
2. security and isolation;
3. low-latency public reads;
4. Cloudflare Free-tier headroom;
5. simple operations;
6. feature breadth.

## Required checks

Before merging application changes, run:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

Changes covered by public sharing, authentication, upload, lifecycle state, or browser rendering must also pass the Playwright E2E suite in `e2e/`. Playwright remains a test-only dependency outside the production pnpm workspace.

## Architecture boundaries

- `packages/core`: runtime-independent domain/service logic.
- `apps/worker`: Cloudflare and Node HTTP/runtime adapters.
- `apps/admin`: single-admin UI.
- D1/SQLite: metadata and lightweight counters.
- R2/local filesystem: original file objects.
- Public `/p/:slug`: PageVault-owned viewer.
- Public `/raw/:slug`: original stored content.

Keep cross-runtime behavior aligned unless a runtime limitation is explicitly documented.

## Maintenance mode

The A-L roadmap is complete at v1.0. Future changes should default to maintenance, performance, reliability, security, and small compatible UX improvements.

Before proposing a new product surface, confirm that it cannot be solved by improving the existing viewer, admin, storage, or maintenance paths. New formats, platform services, background workers, or multi-user features require an explicit major-version decision.

## Release discipline

- Keep the root, core, worker, and admin package versions aligned.
- Update `CHANGELOG.md` for every published version.
- Run `pnpm run release:check` before tagging.
- Published tags are immutable and follow `vX.Y.Z`.
- Treat the v1 API/share URL contract in `docs/api.md` and `docs/upgrading.md` as compatibility boundaries.
