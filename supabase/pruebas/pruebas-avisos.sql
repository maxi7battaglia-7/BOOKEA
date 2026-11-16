-- Pruebas de avisos-por-mail.sql (con Vault y pg_net simulados)
\set ON_ERROR_STOP on
\set QUIET on
-- sin claves guardadas: registrarse funciona igual y no se manda nada
insert into auth.users (email, raw_user_meta_data) values ('sin@prueba.com', '{"nombre":"Sin","negocio":"Sin Aviso"}');
do $$ begin
  assert (select count(*) from net.enviados) = 0, 'mandó algo sin clave';
  assert (select count(*) from public.negocios where nombre = 'Sin Aviso') = 1, 'sin clave no se registró';
  raise notice 'OK  sin la clave de Resend: el registro funciona igual y no se manda nada';
end $$;
insert into vault.decrypted_secrets values ('resend_api_key', 're_prueba'), ('aviso_bookea_email', 'equipo@bookea.test');
insert into auth.users (email, raw_user_meta_data) values ('lu@prueba.com', '{"nombre":"Lu Pérez","negocio":"Pádel <b>Lu</b> & Cía","rubro":"Pádel"}');
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.url = 'https://api.resend.com/emails', 'url: ' || coalesce(e.url, 'nada');
  assert e.headers ->> 'Authorization' = 'Bearer re_prueba', 'sin la clave en el pedido';
  assert e.body -> 'to' ->> 0 = 'equipo@bookea.test', 'para: ' || (e.body ->> 'to');
  assert e.body ->> 'from' = 'Bookea <onboarding@resend.dev>', 'de: ' || (e.body ->> 'from');
  assert e.body ->> 'subject' like 'Nuevo negocio para aprobar: Pádel%', 'asunto: ' || (e.body ->> 'subject');
  assert e.body ->> 'html' like '%Pádel &lt;b&gt;Lu&lt;/b&gt; &amp; Cía%' and e.body ->> 'html' like '%lu@prueba.com%', 'html sin escapar: ' || (e.body ->> 'html');
  assert e.body ->> 'html' like '%https://bookea.ar/admin.html%', 'falta el link al panel';
  raise notice 'OK  negocio nuevo: te llega el aviso con el nombre, quién lo pidió y el link al panel (el HTML va escapado)';
end $$;
-- aprobar sin remitente propio: no se le manda al negocio
update public.negocios set estado = 'aprobado' where email_dueno = 'lu@prueba.com';
do $$ begin
  assert (select count(*) from net.enviados) = 1, 'le mandó al negocio sin remitente propio';
  raise notice 'OK  aprobado sin dominio propio: no se intenta mandarle al negocio';
end $$;
-- con remitente propio: al aprobar le llega al dueño
insert into vault.decrypted_secrets values ('resend_remitente', 'Bookea <avisos@bookea.test>');
update public.negocios set estado = 'pendiente' where email_dueno = 'sin@prueba.com';
update public.negocios set estado = 'aprobado' where email_dueno = 'sin@prueba.com';
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.body -> 'to' ->> 0 = 'sin@prueba.com' and e.body ->> 'from' = 'Bookea <avisos@bookea.test>', 'aviso de aprobado: ' || e.body::text;
  assert e.body ->> 'subject' = 'Tu negocio ya está aprobado en Bookea';
  assert e.body ->> 'html' like '%Hola, Sin:%', 'saludo: ' || (e.body ->> 'html');
  raise notice 'OK  con dominio propio: al aprobarlo, al dueño le llega "Tu negocio ya está aprobado"';
end $$;
-- con la cara de Bookea: franja noche, línea verde agua y naranja, lema nuevo
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.body ->> 'html' like '%#11151c%' and e.body ->> 'html' like '%#1fa08c%' and e.body ->> 'html' like '%#e4572e%' and e.body ->> 'html' like '%#f5ecd7%', 'sin los colores de la marca';
  assert e.body ->> 'html' like '%Reservá turnos en segundos.%', 'sin el lema';
  assert e.body ->> 'html' like '%Entrar al panel%', 'sin el botón';
  raise notice 'OK  los avisos salen con los colores de Bookea, el botón y el lema';
end $$;
-- rechazar una solicitud: le llega "no fue aprobada"
insert into auth.users (email, raw_user_meta_data) values ('re@prueba.com', '{"nombre":"Re Gómez","negocio":"Cancha <i>Re</i>"}');
update public.negocios set estado = 'rechazado' where email_dueno = 're@prueba.com';
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.body -> 'to' ->> 0 = 're@prueba.com', 'rechazo, para: ' || (e.body ->> 'to');
  assert e.body ->> 'subject' = 'Tu solicitud en Bookea no fue aprobada', 'asunto: ' || (e.body ->> 'subject');
  assert e.body ->> 'html' like '%Hola, Re:%' and e.body ->> 'html' like '%Cancha &lt;i&gt;Re&lt;/i&gt;%' and e.body ->> 'html' like '%hola@bookea.ar%', 'rechazo html: ' || (e.body ->> 'html');
  raise notice 'OK  rechazar: al dueño le llega "Tu solicitud no fue aprobada", con a quién escribir';
end $$;
-- quitarle el acceso a uno aprobado: el texto cambia
update public.negocios set estado = 'rechazado' where email_dueno = 'sin@prueba.com';
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.body -> 'to' ->> 0 = 'sin@prueba.com' and e.body ->> 'subject' = 'Se pausó el acceso de tu negocio a Bookea', 'quitar acceso: ' || e.body::text;
  raise notice 'OK  quitarle el acceso a un negocio aprobado: le llega "Se pausó el acceso"';
end $$;
-- volver a guardar el mismo estado no manda otro mail
update public.negocios set estado = 'rechazado' where email_dueno = 'sin@prueba.com';
do $$
declare n int := (select count(*) from net.enviados where body -> 'to' ->> 0 = 'sin@prueba.com');
begin
  assert n = 2, 'mandó de más: ' || n;
  raise notice 'OK  sin cambio de estado no se repite el mail';
end $$;
-- si pg_net falla, registrarse sigue funcionando
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
language plpgsql as $$ begin raise exception 'Resend caído'; end $$;
insert into auth.users (email, raw_user_meta_data) values ('mo@prueba.com', '{"nombre":"Mo","negocio":"Mo Barber"}');
do $$ begin
  assert (select count(*) from public.negocios where nombre = 'Mo Barber') = 1;
  raise notice 'OK  si el mail falla, el negocio se registra igual';
end $$;
\echo 'Todas las pruebas de avisos pasaron.'
