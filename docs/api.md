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

## Dashboard

`GET /api/admin/dashboard`

Returns counts for live files, public files, URL-expired files, files whose retention ends soon, and deleted records.

## Items

`GET /api/admin/items?page=1&pageSize=20&q=&status=&visibility=&includeTotal=`

By default, the list response uses lightweight pagination, returns `total: null`, and provides `hasNextPage`. Pass `includeTotal=true` when a precise total is needed.

`POST /api/admin/items` accepts `multipart/form-data` fields:

- `file`
- `urlExpireDays`
- `fileExpireDays`
- `visibility`, either `public` or `private`

Supported file extensions are `.html`, `.htm`, `.md`, `.markdown`, `.jpg`, `.jpeg`, `.png`, and `.webp`. The upload limit defaults to 10 MiB and is controlled by `MAX_UPLOAD_SIZE_MB`.

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
