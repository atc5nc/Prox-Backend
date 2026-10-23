#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PG_BINDIR="/opt/homebrew/opt/postgresql@16/bin"
ROOT_TMP="$(mktemp -d /tmp/prox-dq01-postgres.XXXXXX)"
DATA_DIR="$ROOT_TMP/data"
SOCKET_DIR="$ROOT_TMP/socket"
PORT="55439"
LOG_FILE="$ROOT_TMP/postgres.log"

if [[ ! -x "$PG_BINDIR/initdb" || ! -x "$PG_BINDIR/postgres" ]]; then
  printf '%s\n' "PostgreSQL 16 server binaries are required for the disposable local fixture." >&2
  exit 2
fi
mkdir -m 700 "$SOCKET_DIR"
"$PG_BINDIR/initdb" -D "$DATA_DIR" -A trust --no-locale -E UTF8 >/dev/null

cleanup() {
  "$PG_BINDIR/pg_ctl" -D "$DATA_DIR" -m fast -w stop >/dev/null 2>&1 || true
  rm -rf "$ROOT_TMP"
}
trap cleanup EXIT

"$PG_BINDIR/pg_ctl" -D "$DATA_DIR" \
  -o "-h 127.0.0.1 -p $PORT -k $SOCKET_DIR -c listen_addresses=127.0.0.1" \
  -l "$LOG_FILE" -w start >/dev/null

export PGOPTIONS="-c default_transaction_read_only=off"
"$PG_BINDIR/psql" -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U "$(id -un)" -d postgres \
  -f "$ROOT/local_replica_setup.sql" \
  -f "$ROOT/writers_check.sql" \
  -f "$ROOT/compat_usage_check.sql" \
  -f "$ROOT/dry_run_canned_fish_pantry_rule.sql" \
  -f "$ROOT/local_replica_test.sql"
