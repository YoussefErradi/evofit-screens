#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 || -z ${EVOFIT_BACKUP_PASSPHRASE_FILE:-} ]]; then
  echo "Usage: EVOFIT_BACKUP_PASSPHRASE_FILE=/private/path/passphrase scripts/backup.sh /backup/directory" >&2
  exit 2
fi
if [[ ! -f $EVOFIT_BACKUP_PASSPHRASE_FILE ]]; then
  echo "Backup passphrase file does not exist" >&2
  exit 2
fi

destination=$1
mkdir -p "$destination"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
database="$destination/evofit-db-$stamp.dump.enc"
media="$destination/evofit-media-$stamp.tar.enc"
trap 'rm -f "$database.partial" "$media.partial"' EXIT

docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' |
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 -pass "file:$EVOFIT_BACKUP_PASSPHRASE_FILE" -out "$database.partial"
mv "$database.partial" "$database"
docker compose exec -T api tar -C /app/media -cf - . |
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 250000 -pass "file:$EVOFIT_BACKUP_PASSPHRASE_FILE" -out "$media.partial"
mv "$media.partial" "$media"
echo "Encrypted database and media backups: $database $media"
