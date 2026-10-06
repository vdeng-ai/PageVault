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

## Remaining roadmap

### Phase H — Free-tier and Deployment Hardening

Make the free-tier constraint operational:

- health/readiness endpoint;
- fail loudly on migration errors;
- remove migration error suppression from Docker startup;
- non-root Docker runtime;
- graceful shutdown;
- SQLite WAL/checkpoint review;
- backup/restore verification;
- Cloudflare/Docker configuration parity checks;
- document free-tier guardrails.

Review every new feature for CPU cost, D1 read/write amplification, R2 list/read amplification, and additional platform dependencies.

### Phase I — Lightweight Admin Experience

Improve personal content management without introducing a search service:

- filename/title search;
- file-type filter;
- visibility/status filters;
- creation and expiry filters;
- file-size display/filtering;
- efficient pagination and indexes;
- safer batch actions;
- copy share/raw links.

Do not introduce FTS until real personal-scale data demonstrates that indexed SQL is insufficient.

### Phase J — Share Viewer 2.0

Invest in the actual PageVault value proposition: opening shared AI output cleanly.

- stronger mobile layout;
- HTML full-screen/open-original controls;
- Markdown long-form reading and TOC polish;
- PDF metadata/open-original controls;
- image fit/background/original-size controls;
- Open Graph/Twitter metadata verification;
- WeChat/Telegram/Slack/Discord opening tests;
- copy-link and optional client-side QR code.

Do not generate server-side screenshots or preview images. Use static fallback share art where a format lacks a natural image.

### Phase K — Security and Lightweight Observability

Keep security and diagnostics simple:

- login/API-key rate limiting;
- API-key scopes only if needed by actual workflows;
- request IDs;
- audit log improvements;
- upload/error/GC counters;
- storage usage summary;
- last successful maintenance run.

Do not add SIEM, Prometheus infrastructure, ClickHouse, Durable Object analytics, or other telemetry infrastructure.

### Phase L — v1.0 and Maintenance Mode

Define v1.0 as the stable completion point:

Cloudflare:
- Worker;
- Workers Static Assets;
- D1;
- private R2;
- one daily Cron.

Docker:
- Node.js;
- SQLite;
- local filesystem.

Finish:

- migration compatibility guidance;
- backup/restore documentation and tests;
- release notes/changelog automation;
- clean deployment/upgrade instructions;
- stable API behavior;
- documented support boundaries.

After v1.0, favor maintenance, performance, reliability, and security over adding major product surfaces.

## Change acceptance checklist

Before accepting a feature, ask:

- Does it materially increase Worker CPU?
- Does it add a full-table D1 scan?
- Does it create a D1 write per public page view?
- Does it require a full R2 listing?
- Does it add another Cloudflare product or external service?
- Does it require background compute or content conversion?

If several answers are yes, the feature probably does not belong in PageVault core.
