#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${SPICEDB_DATASTORE_CONN_URI:-}" || -z "${SPICEDB_PRESHARED_KEY:-}" ]]; then
  echo 'SPICEDB_DATASTORE_CONN_URI and SPICEDB_PRESHARED_KEY are required' >&2
  exit 1
fi

spicedb datastore migrate head \
  --datastore-engine=postgres \
  --datastore-conn-uri="$SPICEDB_DATASTORE_CONN_URI"

exec spicedb serve \
  --datastore-engine=postgres \
  --datastore-conn-uri="$SPICEDB_DATASTORE_CONN_URI" \
  --datastore-bootstrap-files=/bootstrap/bootstrap.yaml \
  --grpc-preshared-key="$SPICEDB_PRESHARED_KEY" \
  --http-enabled=true
