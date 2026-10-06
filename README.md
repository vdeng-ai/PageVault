# PageVault

### Turn AI-made pages into links that open anywhere.

[![CI](https://github.com/vdeng-ai/PageVault/actions/workflows/ci.yml/badge.svg)](https://github.com/vdeng-ai/PageVault/actions/workflows/ci.yml)
[![Docker](https://github.com/vdeng-ai/PageVault/actions/workflows/docker.yml/badge.svg)](https://github.com/vdeng-ai/PageVault/actions/workflows/docker.yml)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](./docs/cloudflare-deploy.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vdeng-ai/PageVault)

Language: English | [简体中文](./README.zh-CN.md)

PageVault is a personal-first, self-hosted publisher for sharing AI-generated HTML, Markdown, PDF, SVG, and image-based infographics in WeChat and other messaging apps. It turns files that are awkward to preview in chat into controlled links that open directly in a browser.

**Upload once → get a controlled link → paste it into any chat.**

**Cloudflare Free-first:** PageVault is intentionally designed for personal use on the free tiers of Workers, D1, R2, Workers Static Assets, and one Cron Trigger. The project avoids heavy compute, Office conversion, background processing infrastructure, and other features that would push the core deployment beyond that lightweight boundary.

**v1.0 stable baseline:** The A–L roadmap is complete. PageVault now follows SemVer and defaults to maintenance, reliability, security, performance, and small compatible UX improvements rather than continued feature expansion.

![PageVault English upload interface with Markdown preview, visibility, and retention settings](./docs/assets/pagevault-upload-en.jpg)

English interface · Dark theme · Local Markdown preview before publishing.

## Highlights

- **Chat-ready sharing** — Turn HTML, Markdown, PDF, SVG, and images that messaging apps cannot preview into browser-friendly links.
- **Built for AI output** — Share AI-generated interactive pages, reports, documents, and infographics.
- **One upload, one link** — Copy a usable link as soon as the upload finishes, without building a website.
- **Personal-first** — A single-admin design without teams, tenants, or complex roles.
- **Controlled access** — Choose public or private visibility, set URL expiry and file retention, disable access, or delete content.
- **Private storage** — Original files are never exposed directly; every public request passes through the PageVault gateway.
- **Deploy your way** — Stay lightweight on Cloudflare's free tier or run the same service with Docker.
- **Deliberately small scope** — HTML, Markdown, PDF, SVG, PNG, JPEG, and WebP only; no DOCX/PPTX conversion, OCR, video processing, or server-side rendering pipeline.

## Architecture

PageVault keeps business logic in `packages/core` and uses runtime-specific adapters:

| Runtime    | Application                    | Metadata | Object storage    |
| ---------- | ------------------------------ | -------- | ----------------- |
| Cloudflare | Worker + Workers Static Assets | D1       | Private R2 bucket |
| Docker     | Node.js 22                     | SQLite   | Local files       |

Production uses separate admin and public hostnames. The incoming `Host` header selects the admin workspace or public publishing gateway, while the same service enforces visibility, status, and expiry rules.

## Getting Started

Install [Node.js 22](https://nodejs.org/), then enable the repository-pinned package manager and install dependencies:

```bash
corepack enable
pnpm install
```

Generate the password hash required by both deployment modes:

```bash
pnpm tsx scripts/hash-password.ts
```

Then choose a deployment target:

| Target     | Best for                                       | Guide                                                |
| ---------- | ---------------------------------------------- | ---------------------------------------------------- |
| Cloudflare | Free-tier-friendly runtime with D1 and R2      | [Cloudflare deployment](./docs/cloudflare-deploy.md) |
| Docker     | Self-managed server with SQLite and local disk | [Docker deployment](./docs/docker-deploy.md)         |

For a contributor-oriented local setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Documentation

- [Product direction and roadmap](./docs/roadmap.md)
- [v1 upgrade and rollback guide](./docs/upgrading.md)
- [Release process](./docs/releasing.md)
- [Support boundaries](./docs/support.md)
- [Changelog](./CHANGELOG.md)
- [Configuration reference](./docs/configuration.md)
- [Operations and free-tier guardrails](./docs/operations.md)
- [Share compatibility checklist](./docs/share-compatibility.md)
- [Cloudflare deployment](./docs/cloudflare-deploy.md)
- [Docker deployment](./docs/docker-deploy.md)
- [HTTP API](./docs/api.md)
- [Runtime security model](./docs/security.md)
- [Vulnerability reporting](./SECURITY.md)

## Development

The main repository checks are:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local services, environment setup, and pull request expectations.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing a change. Report security vulnerabilities privately according to [SECURITY.md](./SECURITY.md), not through a public issue.

## License

PageVault is available under the [MIT License](./LICENSE).
