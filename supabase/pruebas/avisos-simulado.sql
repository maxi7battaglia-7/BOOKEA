-- Solo para probar avisos-por-mail.sql fuera de Supabase: imita pg_net (Vault está en supabase-simulado.sql).
-- net.http_post no manda nada: guarda el pedido en net.enviados para revisarlo.
create schema if not exists net;
create table if not exists net.enviados (id serial primary key, url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language sql as $$ insert into net.enviados (url, headers, body) values (url, headers, body) returning id::bigint $$;
