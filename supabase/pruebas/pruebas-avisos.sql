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
  assert e.body ->> 'html' not like '%recibir reservas%', 'promete reservas online que todavía no están';
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
-- las piezas de los mails no quedan como /rpc/ públicas
do $$ begin
  assert not has_function_privilege('anon', 'public.mail_bookea(text,text,text,text,text)', 'execute'), 'anon puede llamar mail_bookea';
  assert not has_function_privilege('authenticated', 'public.saludo(text)', 'execute'), 'authenticated puede llamar saludo';
  assert not has_function_privilege('anon', 'public.html_seguro(text)', 'execute'), 'anon puede llamar html_seguro';
  raise notice 'OK  mail_bookea, saludo y html_seguro no se pueden llamar desde la página';
end $$;
-- Clientes de bookea.ar: al reservar les llega la confirmación, y al cancelar, la cancelación
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'juli@prueba.com', '{"nombre":"Juli Paz","celular":"261 555 1234","cliente":true}');
do $$ begin
  assert (select count(*) from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com') = 0, 'al registrarse un cliente no se manda nada desde acá (lo manda Supabase)';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.reservar_turno(jsonb_build_object('lugar_id', 'losalamos', 'lugar', 'Los <Álamos>', 'zona', 'Tupungato', 'rubro', 'Pádel',
    'servicio_id', 'turno', 'servicio', 'Turno de 90 min', 'cancha', 'Cancha 2', 'fecha', current_date + 7, 'hora', '20:00', 'fin', '21:30',
    'precio', 34000, 'sena', 8500, 'cancelar_horas', 6));
  perform set_config('prueba.turno', t ->> 'id', false);
  perform set_config('prueba.codigo', t ->> 'codigo', false);
end $$;
reset role;
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.body -> 'to' ->> 0 = 'juli@prueba.com' and e.body ->> 'from' = 'Bookea <avisos@bookea.test>', 'confirmación: ' || e.body::text;
  assert public.fecha_larga('2026-11-20') = 'viernes 20 de noviembre' and public.fecha_larga('2027-01-03') = 'domingo 3 de enero', 'fecha_larga';
  assert e.body ->> 'subject' = 'Turno confirmado: Los <Álamos>, ' || public.fecha_larga(current_date + 7) || ' a las 20:00', 'asunto: ' || (e.body ->> 'subject');
  assert e.body ->> 'html' like '%Hola, Juli:%' and e.body ->> 'html' like '%Los &lt;Álamos&gt;%' and e.body ->> 'html' not like '%Los <Álamos>%', 'html sin escapar';
  assert e.body ->> 'html' like '%' || upper(left(public.fecha_larga(current_date + 7), 1)) || substr(public.fecha_larga(current_date + 7), 2) || ', de 20:00 a 21:30%' and e.body ->> 'html' like '%Cancha 2%'
     and e.body ->> 'html' like '%$&nbsp;8.500%' and e.body ->> 'html' like '%$&nbsp;25.500%'
     and e.body ->> 'html' like '%' || current_setting('prueba.codigo') || '%', 'faltan datos del turno: ' || (e.body ->> 'html');
  assert e.body ->> 'html' like '%https://bookea.ar/#mis-turnos%' and e.body ->> 'html' like '%hasta 6 h antes%', 'falta el link o la regla de cancelación';
  assert e.body ->> 'html' like '%la seña no se cobró%', 'mientras está en prueba, el mail lo dice';
  raise notice 'OK  turno confirmado: al cliente le llega el mail con el día, la hora, la cancha, la seña, lo que paga en el lugar y el código';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin perform public.cancelar_turno(current_setting('prueba.turno')::uuid); end $$;
reset role;
do $$
declare e record;
begin
  select * into e from net.enviados order by id desc limit 1;
  assert e.body -> 'to' ->> 0 = 'juli@prueba.com' and e.body ->> 'subject' = 'Turno cancelado: Los <Álamos>, ' || public.fecha_larga(current_date + 7) || ' a las 20:00', 'cancelación: ' || e.body::text;
  assert e.body ->> 'html' like '%la seña de $&nbsp;8.500 se devuelve%' and e.body ->> 'html' like '%hola@bookea.ar%', 'html: ' || (e.body ->> 'html');
  raise notice 'OK  turno cancelado: le llega el mail con lo que pasa con la seña';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin perform public.cancelar_turno(current_setting('prueba.turno')::uuid); end $$;
reset role;
do $$ begin
  assert (select count(*) from net.enviados where body ->> 'subject' like 'Turno cancelado%') = 1, 'cancelar dos veces mandó dos mails';
  raise notice 'OK  cancelar dos veces no manda dos mails';
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
