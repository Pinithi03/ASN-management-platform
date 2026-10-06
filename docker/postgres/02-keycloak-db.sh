#!/bin/bash
# ============================================================
# Creates Keycloak's own database and login role.
# ============================================================
# Runs automatically ONLY when the Postgres volume is empty
# (docker-entrypoint-initdb.d). For an existing dev volume run:
#   make keycloak-db
# Safe to run more than once: it skips what already exists.
# Needs KEYCLOAK_DB_PASSWORD in the postgres container's env.
# ============================================================
set -euo pipefail

if [ -z "${KEYCLOAK_DB_PASSWORD:-}" ]; then
  echo "02-keycloak-db.sh: KEYCLOAK_DB_PASSWORD is not set" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 \
     --username "${POSTGRES_USER}" \
     --dbname "${POSTGRES_DB}" \
     -v kc_password="${KEYCLOAK_DB_PASSWORD}" <<-'EOSQL'
	SELECT format('CREATE ROLE keycloak LOGIN PASSWORD %L', :'kc_password')
	WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'keycloak')\gexec

	SELECT 'CREATE DATABASE keycloak OWNER keycloak'
	WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'keycloak')\gexec

	REVOKE ALL ON DATABASE keycloak FROM PUBLIC;
EOSQL

echo "02-keycloak-db.sh: keycloak database ready"
