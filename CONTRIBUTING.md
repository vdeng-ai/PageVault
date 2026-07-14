# Contributing to PageVault

Thank you for helping improve PageVault. Issues and pull requests are welcome for bug fixes, documentation, tests, and focused product improvements.

Security vulnerabilities must be reported privately according to [SECURITY.md](./SECURITY.md), not through a public issue.

## Prerequisites

- Node.js 22
- Corepack, included with Node.js
- Git

Enable the pinned `pnpm` version and install dependencies from the repository root:

```bash
corepack enable
pnpm install
```

## Local Cloudflare Development

PageVault's Cloudflare development mode uses local D1 and R2 emulation. Copy the environment template:

```bash
cp apps/worker/.env.example apps/worker/.env
```

Use local origins in `apps/worker/.env` so the Vite admin application and public gateway have different hostnames:

```dotenv
APP_ENV=production
ADMIN_BASE_URL=http://localhost:5173
PUBLIC_BASE_URL=http://127.0.0.1:8787
```

Generate `ADMIN_PASSWORD_HASH` interactively, generate a random `SESSION_SECRET`, and put both values in the ignored environment file:

```bash
pnpm tsx scripts/hash-password.ts
openssl rand -base64 32
```

Create the local D1 schema and build the initial admin assets:

```bash
pnpm wrangler d1 migrations apply pagevault-db --local
pnpm --filter @pagevault/admin run build
```

Start the Worker and admin development server in separate terminals:

```bash
pnpm run dev:worker
```

```bash
pnpm run dev:admin
```

Open `http://localhost:5173` for the admin interface. Published URLs use `http://127.0.0.1:8787` so requests reach the public-host routing path.

## Repository Layout

- `apps/admin`: React administration interface.
- `apps/worker`: Cloudflare Worker and Node.js runtime adapters.
- `packages/core`: runtime-independent business logic.
- `migrations`: D1 and SQLite schema migrations.
- `docs`: deployment, configuration, API, and security documentation.

## Checks

Run the same checks used by CI before opening a pull request:

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run format
```

`pnpm run format` is a check and does not rewrite files. Use `pnpm exec prettier --write <files>` when you intentionally want to format changed files.

## Pull Requests

- Keep each pull request focused and explain the user-visible behavior it changes.
- Add or update tests for behavior changes.
- Update documentation when configuration, APIs, deployment steps, or security properties change.
- Do not commit `.env` files, production credentials, generated build output, Wrangler state, or uploaded content.
- Confirm CI and Docker build checks pass.

There is no required commit-message convention. Use concise messages that describe the change.
