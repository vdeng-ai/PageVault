# Upgrading PageVault

PageVault v1.0 establishes a forward-only migration contract for both supported runtimes.

## Compatibility baseline

The v1.0 schema baseline is:

| Migration | Purpose |
| --- | --- |
| `0001_initial.sql` | files, audit logs, access logs |
| `0002_api_keys.sql` | upload API keys |
| `0003_api_upload_lock.sql` | legacy upload-lock compatibility |
| `0004_api_upload_idempotency.sql` | retry-safe API uploads |
| `0005_maintenance_state.sql` | reconciliation/maintenance cursors and state |
| `0006_admin_list_indexes.sql` | lightweight admin list indexes |

All migrations are additive/idempotent and must be applied in order.

## Supported upgrade path

PageVault v1.0 supports upgrading an existing deployment that already has any prefix of migrations `0001` through `0006`.

The supported sequence is:

```text
backup
  ↓
apply every pending migration in numeric order
  ↓
deploy the new application
  ↓
health/readiness checks
  ↓
login/upload/share/raw smoke tests
  ↓
keep the backup until verification is complete
```

Do not skip numbered migrations.

## Cloudflare

Before upgrading:

1. export or otherwise back up D1;
2. preserve the private R2 objects;
3. record the currently deployed PageVault commit/tag.

Apply migrations before deploying application code that depends on them:

```bash
pnpm wrangler d1 migrations apply pagevault-db --remote
```

Then deploy and verify the admin hostname:

- `/healthz` returns 200;
- `/readyz` returns 200;
- administrator login succeeds;
- one upload succeeds;
- its `/p/:slug` and `/raw/:slug` URLs work.

## Docker

Use the point-in-time backup procedure in [Operations](./operations.md) before changing versions.

The Node runtime applies all bundled SQLite migrations before it begins listening. Migration failure is fatal.

After updating the repository or image:

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

Keep the previous data backup until the post-upgrade checks pass.

## Rollback policy

PageVault does not automatically downgrade database schemas.

A code-only rollback is acceptable only when the newer release did not apply a schema migration that the older code cannot understand.

For a true rollback across a schema change:

1. stop the newer application;
2. restore the backup taken before the upgrade;
3. restore matching object storage when necessary;
4. run the older application version;
5. verify health, login, and representative public content.

Do not manually delete migration records or reverse SQL statements on a production database unless a release specifically documents that procedure.

## v1 compatibility promise

Within the v1.x line:

- `/p/:slug` remains the stable share URL;
- `/raw/:slug` remains the original-content URL;
- existing stored files remain readable unless they expire or are deleted by configured lifecycle rules;
- documented admin/upload API behavior is kept compatible where practical;
- response fields may be added in minor releases;
- breaking route, storage, or schema-contract changes require a major version or an explicitly documented migration.

Security fixes may tighten validation or authentication behavior without waiting for a major version.
