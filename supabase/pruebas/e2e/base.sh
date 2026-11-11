#!/usr/bin/env bash
# Base nueva para la prueba de punta a punta: Supabase simulado + el esquema de Bookea.
set -euo pipefail
B="$(cd "$(dirname "$0")/../.." && pwd)"
q() { su postgres -c "PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 $*"; }
q -d postgres -c "'drop database if exists bookea_e2e'" >/dev/null
q -d postgres -c "'create database bookea_e2e'" >/dev/null
q -d bookea_e2e -f $B/pruebas/supabase-simulado.sql >/dev/null
q -d bookea_e2e -c "'create extension if not exists pgcrypto; alter table auth.users add column clave text, add column confirmado boolean default true'" >/dev/null
q -d bookea_e2e -f $B/esquema.sql >/dev/null
echo base lista
