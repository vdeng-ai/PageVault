# PageVault

### Turn AI-made pages into links that open anywhere.

[![CI](https://github.com/vdeng-ai/PageVault/actions/workflows/ci.yml/badge.svg)](https://github.com/vdeng-ai/PageVault/actions/workflows/ci.yml)
[![Docker](https://github.com/vdeng-ai/PageVault/actions/workflows/docker.yml/badge.svg)](https://github.com/vdeng-ai/PageVault/actions/workflows/docker.yml)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](./docs/cloudflare-deploy.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/vdeng-ai/PageVault)

Language: English | [简体中文](./README.zh-CN.md)

PageVault is a personal-first, self-hosted publisher for sharing AI-generated HTML, Markdown, and infographics in WeChat and other messaging apps. It turns files that are awkward to preview in chat into controlled links that open directly in a browser.

**Upload once → get a controlled link → paste it into any chat.**

**Free-tier friendly:** PageVault can start on Cloudflare's included free quotas for Workers, D1, and R2. Usage beyond those quotas is subject to Cloudflare's current pricing.

![PageVault upload page with file, visibility, and retention settings](./docs/assets/pagevault-upload.png)

## Highlights

- **Chat-ready sharing** — Turn HTML and Markdown that messaging apps cannot preview into browser-friendly links.
- **Built for AI output** — Share AI-generated interactive pages, reports, documents, and infographics.
- **One upload, one link** — Copy a usable link as soon as the upload finishes, without building a website.
- **Personal-first** — A single-admin design without teams, tenants, or complex roles.
- **Controlled access** — Choose public or private visibility, set URL expiry and file retention, disable access, or delete content.
- **Private storage** — Original files are never exposed directly; every public request passes through the PageVault gateway.
- **Deploy your way** — Start with Cloudflare Workers, D1, and R2 free quotas, or run the same service with Docker.

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

- [Configuration reference](./docs/configuration.md)
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
