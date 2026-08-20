#!/bin/sh
set -eu
PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ROOT_DIR=$(CDPATH= cd -- "$PROJECT_DIR/.." && pwd)
STAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_DIR="$ROOT_DIR/備份/${STAMP}_更新前"
mkdir -p "$BACKUP_DIR"
rsync -a --exclude '.git' --exclude 'node_modules' --exclude 'dist' --exclude '.next' --exclude '.wrangler' "$PROJECT_DIR/" "$BACKUP_DIR/"
echo "$BACKUP_DIR"
