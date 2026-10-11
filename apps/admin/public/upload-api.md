# PageVault Upload API

> Publish an original file from an AI agent or automation using an upload-only API key.

## Instance and credentials

Admin base URL: `https://YOUR_ADMIN_HOST`

When reading this document over HTTP, use the origin serving this document as the admin base URL. The public share hostname does not accept `/api/*` requests.

Create a key in the administrator's API Keys page. Store it securely in the `PAGEVAULT_API_KEY` environment variable. Never include a real key in generated documents, public files, source control, or logs. This guide contains no credentials.

Keys authorize only `POST /api/admin/items`. They cannot list, read, preview, update, or delete files, or manage keys. Send `Authorization: Bearer <key>`; no session cookie or CSRF token is needed. Revoking a key immediately removes its upload access.

## Upload

Send `multipart/form-data` to `/api/admin/items`. Let your HTTP client set the multipart Content-Type and boundary.

| Field            | Meaning                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `file`           | Required original file, with its filename and extension.                                                           |
| `visibility`     | `public` for sharing or `private` for administrator-only access. Omission defaults to `public`; select explicitly. |
| `urlExpireDays`  | Positive integer: link lifetime, default 15 days.                                                                  |
| `fileExpireDays` | Positive integer: file retention, default 30 days.                                                                 |

Expiry defaults can be changed by the deployment. For a link to remain usable throughout its lifetime, choose file retention at least as long as the link lifetime; either expiry makes the public file inaccessible. Specify both values when predictable expiry is needed.

Supported extensions: `.html`, `.htm`, `.md`, `.markdown`, `.pdf`, `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`. Files must contain valid content matching their format. The default upload limit is 10 MiB, configurable by the administrator via `MAX_UPLOAD_SIZE_MB`. Original bytes are preserved; no Office conversion, OCR, or video processing is available.

## Quick start

Set `PAGEVAULT_API_KEY` securely in your environment, replace the admin URL, and choose a new `UPLOAD_ID` for each logical upload. Keep that ID unchanged when retrying. This example deliberately publishes a public file; use `visibility=private` to store it without public access.

```bash
ADMIN_BASE_URL="https://YOUR_ADMIN_HOST"
UPLOAD_ID="report-001"
: "${PAGEVAULT_API_KEY:?Set PAGEVAULT_API_KEY in your environment}"
curl --fail-with-body "$ADMIN_BASE_URL/api/admin/items" \
  -H "Authorization: Bearer $PAGEVAULT_API_KEY" \
  -H "Idempotency-Key: $UPLOAD_ID" \
  -F "file=@report.html" \
  -F "visibility=public" \
  -F "urlExpireDays=15" \
  -F "fileExpireDays=30"
```

## Success and links

Successful uploads return HTTP 200 with JSON fields `id`, `title`, `slug`, `publicUrl`, `urlExpiresAt`, and `fileExpiresAt`.

Use the returned `publicUrl` as the share/viewer link (`/p/:slug`). Upload responses do not contain `rawUrl`. If original bytes are needed, derive the original-file URL by replacing `/p/` with `/raw/` in the returned URL. Both public routes require a public, active file and valid link and retention periods. A private upload still returns `publicUrl`, but that link is inaccessible publicly. Previewing it requires an administrator session in the admin UI.

## Retry rules

Send an `Idempotency-Key` header of 1–200 visible ASCII characters. It is optional but recommended for all retrying clients and scoped to the API key.

- A new upload returns `Idempotency-Replayed: false`.
- Retry with the same API key, ID, original bytes, filename, visibility, and expiry inputs. Successful replays return the original result and `Idempotency-Replayed: true` for 24 hours after completion.
- HTTP 409 with code `idempotency_in_progress`: the original request is still processing. Wait, then retry the identical request using bounded backoff. A processing claim expires after 15 minutes.
- HTTP 409 with code `idempotency_conflict`: the ID was used for a different request. Do not blindly retry; correct the request or use a new ID for a genuinely new upload.
- On connection loss or a transient 5xx response, retry the identical request with the same ID using bounded backoff. Without an ID, retries may create duplicate files. After the 24-hour replay window, reusing an ID may create another file.

## Errors

JSON errors have an `error` message and may have a stable `code`. Missing or revoked credentials return 401. Invalid fields or unsupported file content return 400. Oversized uploads return 413. Rate limiting returns 429; honor `Retry-After` when present. Fix permanent errors before retrying. Admin API responses include `X-Request-Id` for diagnostics; do not log credentials.
