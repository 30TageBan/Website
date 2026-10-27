#!/bin/sh
set -eu
: "${DATA_DIR:=/data}"
mkdir -p "$DATA_DIR/files" "$DATA_DIR/logs"
npm run db:migrate:deploy
exec "$@"
