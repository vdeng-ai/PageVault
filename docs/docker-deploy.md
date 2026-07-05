# Docker Deploy

Docker mode uses the same service layer with SQLite and local object files.

## Environment

Set:

- `APP_ENV=production`
- `RUNTIME=node`
- `DB_DRIVER=sqlite`
- `STORAGE_DRIVER=local`
- `SQLITE_PATH=/data/htmlbed/htmlbed.sqlite`
- `LOCAL_STORAGE_DIR=/data/htmlbed/objects`
- `ADMIN_BASE_URL=https://admin-html.example.com`
- `PUBLIC_BASE_URL=https://h.example.com`
- `ADMIN_EMAIL=admin@example.com`
- `ADMIN_PASSWORD_HASH=...`
- `SESSION_SECRET=...`
- `DEFAULT_URL_EXPIRE_DAYS=7`
- `DEFAULT_FILE_EXPIRE_DAYS=180`
- `MAX_UPLOAD_SIZE_MB=10`
- `PORT=3000`

## Start

```bash
docker compose -f docker/docker-compose.example.yml up -d --build
```

Lucky or another reverse proxy should route both hostnames to the same container:

```text
admin-html.example.com -> http://127.0.0.1:13080
h.example.com          -> http://127.0.0.1:13080
```

The application decides admin versus public behavior from the `Host` header.
