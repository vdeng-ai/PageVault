# Security

## Public Access

Public requests are only accepted on the configured public hostname and only for:

- `GET /p/:slug`
- `GET /p/:slug/`
- `GET /p/:slug.html`
- the equivalent `HEAD` requests

Everything else on the public hostname returns `404`, including `/`, `/api/*`, `/admin/*`, `/files`, `/list`, and `/sitemap.xml`.

The public hostname must remain anonymously reachable. If you use Cloudflare Access, Zero Trust policies, Basic Auth, firewall rules, or another upstream authentication layer, scope it only to the admin hostname such as `admin-html.example.com`; do not protect the public hostname such as `h.example.com` or a wildcard like `*.example.com`.

## Storage

R2 buckets must stay private. Public access always flows through the Worker:

```text
request -> Worker -> D1 metadata checks -> R2 object read -> response
```

Docker mode uses the same gateway pattern with local files.

## Admin

Only one administrator is supported. Login uses:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

Cloudflare deployment treats all runtime configuration declared in `apps/worker/wrangler.jsonc` under `secrets.required` as secrets. Keep real values in ignored files such as `apps/worker/.env` or `apps/worker/.env.production`, and deploy with the worker package's `deploy` script so Wrangler uploads them with `--secrets-file`.

The session cookie is `pagevault_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and seven-day `Max-Age`. The cookie must be scoped to the admin hostname, not a parent domain.

All admin write operations require `X-CSRF-Token`. The token is returned by `GET /api/auth/me` and is bound to the signed session.

Upload API keys are created and revoked from the authenticated admin interface. They are cryptographically random, are shown in plaintext only in the create response, and are stored as SHA-256 digests in D1 or SQLite. A key grants access only to the upload endpoint on the admin hostname. Bearer authentication does not use CSRF protection because the key is supplied explicitly in the `Authorization` header rather than sent automatically by a browser.

Revoked keys remain as metadata for administrative history but cannot authenticate. The `last used` timestamp is updated at most once per hour per key to limit database write usage.

External access controls may be added in front of the admin hostname, but they must not match the public hostname. Generated URLs under `PUBLIC_BASE_URL`, for example `https://h.example.com/p/report-ed559a5f`, are intended to be reachable without an admin session.

## HTML Content

Uploaded HTML is stored and returned as original bytes. PageVault does not sanitize, rewrite, inject, remove scripts, rewrite links, or add analytics snippets.

Markdown is stored as original bytes and rendered with raw HTML disabled. JPEG, PNG, and WebP files are returned as uploaded bytes with their corresponding image content type.

For privately reporting a vulnerability in PageVault itself, follow the repository [Security Policy](../SECURITY.md).
