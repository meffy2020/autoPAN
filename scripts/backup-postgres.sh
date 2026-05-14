#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ENV_FILE="${ENV_FILE:-/etc/autopan/backup.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

: "${BACKUP_DIR:=/var/backups/autopan}"
: "${RETENTION_DAYS:=14}"
: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=autopan}"
: "${PGUSER:=autopan}"

mkdir -p "${BACKUP_DIR}"

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_file="${BACKUP_DIR}/autopan-${timestamp}.dump"
temp_file="${backup_file}.tmp"

cleanup() {
  rm -f "${temp_file}"
}

trap cleanup ERR INT TERM

pg_dump \
  --format=custom \
  --no-owner \
  --no-acl \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --file="${temp_file}" \
  "${PGDATABASE}"

mv "${temp_file}" "${backup_file}"

find "${BACKUP_DIR}" -type f -name 'autopan-*.dump' -mtime +"${RETENTION_DAYS}" -delete

printf 'backup written: %s\n' "${backup_file}"
