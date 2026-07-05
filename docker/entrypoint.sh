#!/bin/sh
set -eu

node apps/worker/dist/cli.js migrate 2>/dev/null || true
exec "$@"
