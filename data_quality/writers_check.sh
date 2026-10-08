#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  printf '%s\n' "DATABASE_URL is unset; provide a read-only connection string to run this catalog inspection." >&2
  exit 2
fi

export PAGER=cat
export PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c default_transaction_read_only=on -c statement_timeout=120000"
exec psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off -f "$(dirname "$0")/writers_check.sql"
