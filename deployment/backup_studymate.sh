#!/usr/bin/env bash
# StudyMate AI — Online SQLite & Persistent Storage Backup Script
set -euo pipefail

STORAGE_ROOT="/opt/studymate/storage"
BACKUP_ROOT="/opt/studymate/backups"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
DEST_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

mkdir -p "${DEST_DIR}"

# 1. Safe online SQLite backup (WAL-safe)
if [ -f "${STORAGE_ROOT}/database/studymate.db" ]; then
    sqlite3 "${STORAGE_ROOT}/database/studymate.db" ".backup '${DEST_DIR}/studymate.db'"
fi

# 2. Archive uploads & generated PDFs
tar -czf "${DEST_DIR}/storage_files.tar.gz" \
    -C "${STORAGE_ROOT}" uploads generated

# 3. Retain last 7 days of backups
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +

echo "Backup completed at ${DEST_DIR}"
