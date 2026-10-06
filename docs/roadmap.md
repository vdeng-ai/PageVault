# Product Direction and Roadmap

PageVault is a personal-first, Cloudflare-Free-first publisher for AI-generated content.

Its job is intentionally narrow: store lightweight AI output, publish it through a controlled share URL, and make that URL open reliably in browsers and messaging apps. PageVault is not intended to become a general-purpose document conversion platform, team SaaS, analytics platform, or media-processing service.

## Non-negotiable design principles

1. **Personal-first** — one administrator, small-scale self-hosting, no multi-tenant or enterprise role system.
2. **Cloudflare Free-first** — the Cloudflare runtime must remain practical on the free tiers of Workers, D1, R2, Workers Static Assets, and one Cron Trigger.
3. **No heavy compute** — no Office conversion, OCR, video processing, server-side screenshot generation, antivirus daemon, or image-rendering pipeline in the core product.
4. **Storage over processing** — preserve original bytes and stream files rather than transforming them on the server.
5. **Few moving parts** — the Cloudflare architecture stays Worker + D1 + private R2 + one daily Cron. Do not add queues, Durable Objects, external databases, or always-on services without a compelling replacement-level benefit.
6. **Fast path first** — public delivery should remain a short edge path. Avoid full-table scans, full-bucket scans, per-view writes, and expensive parsing.
7. **Free-tier headroom** — design comfortably below platform limits rather than targeting the limit itself.
8. **Maintenance over feature count** — after v1.0, prefer smaller, faster, safer, and easier-to-operate changes over additional file formats.

## Supported content boundary

Core formats:

- HTML
- Markdown
- PDF
- SVG
- PNG
- JPEG
- WebP

PageVault intentionally does **not** plan to support DOCX/PPTX conversion or other compute-heavy preview formats.

## Completed foundation

- **Phase A — File Capability Registry:** centralized format behavior and removed HTML-only assumptions.
- **Phase B — PDF Range / Streaming:** byte-range PDF delivery and streaming storage reads.
- **Phase C — File Authenticity Validation:** magic-byte, UTF-8, and SVG-root validation before persistence.
- **Phase D — Share Viewer / Raw Split:** stable `/p/:slug` viewer URLs plus `/raw/:slug` original content delivery.
- **Phase E — Concurrent Idempotent API Uploads:** remove the global upload lock and provide retry-safe API uploads.
- **Phase F — Reliability Baseline:** Playwright coverage for login, browser upload, public/raw delivery, lifecycle states, core formats, mobile layout, PDF ranges, and API idempotency.
- **Phase G — Incremental GC and Storage Reconciliation:** bounded DB/storage cursor scans, safe deleted-object cleanup, dry-run diagnostics, and one shared daily maintenance path.
- **Phase H — Free-tier and Deployment Hardening:** health/readiness probes, fail-closed migrations, non-root Docker, graceful SQLite shutdown, backup/restore verification, deployment parity checks, and enforceable free-tier guardrails.
- **Phase I — Lightweight Admin Experience:** server-side type/time/expiry/size filters, targeted list indexes, clearer title/type metadata, share/raw link actions, and safer batch restore without introducing a search service.
- **Phase J — Share Viewer 2.0:** stronger mobile controls, HTML/PDF fullscreen, image fit/background controls, client-side copy-link feedback, Markdown reading polish, verified Open Graph/Twitter metadata, and a fixed raster fallback share card without server-side rendering.
- **Phase K — Security and Lightweight Observability:** request IDs, best-effort write-free login/API-key abuse limits, existing audit-log visibility, and persisted maintenance status without adding writes to the public fast path.
- **Phase L — v1.0 and Maintenance Mode:** SemVer/version alignment, changelog and tag-driven GitHub Releases, migration/rollback guidance, stable v1 API behavior, documented support boundaries, and release-contract checks in CI.

## v1.0 maintenance mode

The A–L roadmap is complete at v1.0. Future work is intentionally not organized as another sequence of large feature phases.

The default priority order is:

1. correctness and data safety;
2. security;
3. reliability;
4. performance and Cloudflare free-tier headroom;
5. operational simplicity;
6. small usability improvements.

Compatible improvements ship as v1.x releases. Breaking API, schema, or architecture changes require an explicit major-version decision rather than silently expanding the v1 scope.

The stable deployment boundary remains:

- Cloudflare: Worker + Workers Static Assets + D1 + private R2 + one daily Cron;
- Docker: Node.js + SQLite + local filesystem.

## Change acceptance checklist

Before accepting a feature, ask:

- Does it materially increase Worker CPU?
- Does it add a full-table D1 scan?
- Does it create a D1 write per public page view?
- Does it require a full R2 listing?
- Does it add another Cloudflare product or external service?
- Does it require background compute or content conversion?

If several answers are yes, the feature probably does not belong in PageVault core.
