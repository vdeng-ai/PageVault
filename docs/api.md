# API

## Auth

`POST /api/auth/login`

```json
{ "email": "admin@example.com", "password": "plain-password" }
```

`GET /api/auth/me`

```json
{ "authenticated": true, "email": "admin@example.com", "csrfToken": "..." }
```

`POST /api/auth/logout`

## Admin Items

All write requests require `X-CSRF-Token`.

`GET /api/admin/items?page=1&pageSize=20&q=&status=&visibility=`

`POST /api/admin/items` as `multipart/form-data`:

- `file`
- `urlExpireDays`
- `fileExpireDays`
- `visibility`

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

`POST /api/admin/items/batch`

```json
{
  "ids": ["id1", "id2"],
  "action": "extend_url",
  "days": 7
}
```

Supported actions: `extend_url`, `extend_file`, `set_url_expires_at`, `set_file_expires_at`, `set_public`, `set_private`, `disable`, `restore`, and `delete`.

`POST /api/admin/gc`

## Public

`GET /p/:slug`, `GET /p/:slug/`, `GET /p/:slug.html`, and matching `HEAD` routes return HTML only when the item is public, active, not deleted, URL-valid, and file-valid.
