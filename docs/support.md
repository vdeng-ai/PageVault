# Support Boundaries

PageVault v1 is intentionally a small personal publishing system.

## Supported deployment models

### Cloudflare

- Cloudflare Worker
- Workers Static Assets
- D1
- private R2
- one daily Cron Trigger

### Docker

- Node.js 22
- SQLite
- local filesystem
- a reverse proxy that preserves the original `Host` header

Other databases, object stores, orchestration systems, and multi-node coordination layers are outside the v1 support boundary unless explicitly documented later.

## Supported content

- HTML
- Markdown
- PDF
- SVG
- PNG
- JPEG
- WebP

PageVault does not promise DOCX/PPTX conversion, OCR, video/media processing, server-side screenshots, thumbnail-generation pipelines, or arbitrary document conversion.

## Product model

v1 supports:

- one administrator;
- public/private publishing;
- lifecycle expiry;
- API-key uploads;
- lightweight administration and maintenance.

v1 does not provide:

- organizations or teams;
- multi-tenant isolation;
- RBAC;
- billing;
- external search infrastructure;
- distributed job processing;
- enterprise analytics.

## Browser and messaging compatibility

PageVault targets current evergreen browsers and practical opening behavior in common embedded messaging browsers.

The release checklist covers WeChat, iOS Safari, Android Chrome, Telegram, Slack, and Discord where manual testing is possible. Embedded browsers and social preview caches are third-party environments, so PageVault cannot guarantee identical rendering across every client version.

## Free-tier statement

Cloudflare-Free-first is an architectural target, not a quota guarantee. Actual consumption depends on traffic, object size, retention, and account-level provider rules.

Changes that introduce substantial Worker CPU, per-view D1 writes, full D1 scans, full R2 listings, or additional always-on services should be rejected unless they replace an existing core component with a clearly better design.

## Maintenance policy

After v1.0, the default priority order is:

1. correctness and data safety;
2. security;
3. reliability;
4. performance and free-tier headroom;
5. operational simplicity;
6. small usability improvements.

Major new product surfaces are not part of the default roadmap.
