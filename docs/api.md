# HTTP API

The API is served only on the configured admin hostname. The public hostname accepts only published-file routes and returns `404` for `/api/*`.

JSON error responses use an `error` message and may include a stable `code`. Unless stated otherwise, request and response bodies are JSON.

## Authentication

`POST /api/auth/login`

```json
{ "email": "admin@example.com", "password": "plain-password" }
```

`GET /api/auth/me`

```json
{ "authenticated": true, "email": "admin@example.com", "csrfToken": "..." }
```

`POST /api/auth/logout`

Successful login creates the signed `pagevault_session` cookie. All authenticated write requests require the `X-CSRF-Token` value returned by `GET /api/auth/me`.

Upload API keys use `Authorization: Bearer <key>` and are accepted only by `POST /api/admin/items`. They cannot read items or call other admin endpoints, and they do not require a CSRF token. All API keys share one upload slot; a concurrent key upload receives `409` with code `api_upload_busy` and `Retry-After: 5`. Administrator uploads authenticated with the session cookie do not use this slot. The safety lease lasts 15 minutes, so a key upload that runs longer than 15 minutes can overlap with a later upload after the lease expires.

## API Keys

API key management requires an authenticated admin session:

- `GET /api/admin/api-keys`
- `POST /api/admin/api-keys` with `{ "name": "CI uploader" }`
- `DELETE /api/admin/api-keys/:id`

The create response contains the plaintext `token` once. Later list responses return only the key name, prefix, timestamps, and revocation state. Deleting a key revokes it immediately while retaining its management record.

## Dashboard

`GET /api/admin/dashboard`

Returns counts for live files, public files, URL-expired files, files whose retention ends soon, and deleted records. The response also includes `totalSizeBytes`, the combined size of records that have not been deleted.

## Items

`GET /api/admin/items?page=1&pageSize=20&q=&status=&visibility=&includeTotal=`

By default, the list response uses lightweight pagination, returns `total: null`, and provides `hasNextPage`. Pass `includeTotal=true` when a precise total is needed.

`POST /api/admin/items` accepts `multipart/form-data` fields:

- `file`
- `urlExpireDays`
- `fileExpireDays`
- `visibility`, either `public` or `private`

Supported file extensions are `.html`, `.htm`, `.md`, `.markdown`, `.jpg`, `.jpeg`, `.png`, and `.webp`. The upload limit defaults to 10 MiB and is controlled by `MAX_UPLOAD_SIZE_MB`.

When omitted, `urlExpireDays` defaults to 15 days and `fileExpireDays` defaults to 30 days. Explicit positive values remain authoritative.

An external client can upload with a key created in the admin interface:

```bash
curl "$ADMIN_BASE_URL/api/admin/items" \
  -H "Authorization: Bearer $PAGEVAULT_API_KEY" \
  -F "file=@report.html" \
  -F "visibility=private" \
  -F "urlExpireDays=15" \
  -F "fileExpireDays=30"
```

`GET /api/admin/items/:id`

`PATCH /api/admin/items/:id`

```json
{
  "title": "New title",
  "visibility": "public",
  "status": "active",
  "urlExpiresAt": "2026-08-01T00:00:00.000Z",
  "fileExpiresAt": "2027-01-01T00:00:00.000Z"
}
```

`DELETE /api/admin/items/:id`

Deletion marks the record as deleted. Expired-file garbage collection removes retained object bytes according to the lifecycle policy.

## Batch Actions

`POST /api/admin/items/batch`

```json
{
  "ids": ["id1", "id2"],
  "action": "extend_url",
  "days": 7
}
```

Supported actions are `extend_url`, `extend_file`, `set_url_expires_at`, `set_file_expires_at`, `set_public`, `set_private`, `disable`, `restore`, and `delete`.

Actions that set an absolute expiry use the corresponding ISO 8601 date field; extension actions use a positive `days` value.

## Garbage Collection

`POST /api/admin/gc`

Runs expired-file cleanup immediately. Cloudflare deployments also invoke cleanup from the configured Cron Trigger, and the Docker service runs it periodically.

## Public Files

The public hostname accepts matching `GET` and `HEAD` requests for:

- `/p/:slug`
- `/p/:slug/`
- `/p/:slug.html`

The file is returned only when the record is public, active, not deleted, URL-valid, and file-valid. HTML is returned as uploaded, Markdown is rendered to HTML with raw HTML disabled, and JPEG, PNG, and WebP files retain their image content type.

See [Security](./security.md) for host isolation, storage, and content-handling details.
