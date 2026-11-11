#!/usr/bin/env bash
# Prueba supabase/esquema.sql en un Postgres local (no hace falta Supabase).
# Uso: bash supabase/pruebas/correr.sh   (con un usuario que pueda crear bases, por ejemplo postgres)
set -euo pipefail
cd "$(dirname "$0")"
BASE=bookea_pruebas
q() { PGOPTIONS="-c client_min_messages=warning" psql -X -q -v ON_ERROR_STOP=1 "$@"; }
q -d postgres -c "drop database if exists $BASE" >/dev/null
q -d postgres -c "create database $BASE" >/dev/null
q -d $BASE -f supabase-simulado.sql >/dev/null
q -d $BASE -f ../esquema.sql >/dev/null
q -d $BASE -f ../esquema.sql >/dev/null   # se puede correr dos veces sin romper nada
PGOPTIONS= psql -X -q -v ON_ERROR_STOP=1 -d $BASE -f pruebas.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
