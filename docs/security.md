# Security

## Public Access

Public requests are only accepted on the configured public hostname and only for:

- `GET /p/:slug`
- `GET /p/:slug/`
- `GET /p/:slug.html`
- the equivalent `HEAD` requests

Everything else on the public hostname returns `404`, including `/`, `/api/*`, `/admin/*`, `/files`, `/list`, and `/sitemap.xml`.

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

The session cookie is `htmlbed_session` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, and seven-day `Max-Age`. The cookie must be scoped to the admin hostname, not a parent domain.

All admin write operations require `X-CSRF-Token`. The token is returned by `GET /api/auth/me` and is bound to the signed session.

## HTML Content

Uploaded HTML is stored and returned as original bytes. HTMLBed does not sanitize, rewrite, inject, remove scripts, rewrite links, or add analytics snippets.
