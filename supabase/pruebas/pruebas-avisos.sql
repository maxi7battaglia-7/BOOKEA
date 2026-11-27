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
  assert e.body ->> 'html' like '%la seña no se cobró%', 'mientras está en prueba, el mail de cancelación también lo dice';
  raise notice 'OK  turno cancelado: le llega el mail con lo que pasa con la seña (y que en prueba no se cobró)';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin perform public.cancelar_turno(current_setting('prueba.turno')::uuid); end $$;
reset role;
do $$ begin
  assert (select count(*) from net.enviados where body ->> 'subject' like 'Turno cancelado%') = 1, 'cancelar dos veces mandó dos mails';
  raise notice 'OK  cancelar dos veces no manda dos mails';
end $$;
-- Turno en un negocio real: el mail lleva su dirección, "Cómo llegar" y su WhatsApp, tal como los cargó en Mi negocio
insert into auth.users (email, raw_user_meta_data) values ('martin@prueba.com', '{"nombre":"Martín","negocio":"Los Álamos Pádel","rubro":"Pádel"}');
update public.negocios set estado = 'aprobado', direccion = 'Av. San Martín 1234', ciudad = 'Tupungato', whatsapp = '0261 555-1234', mapa = '',
  ajustes = jsonb_build_object(
    'recursos', jsonb_build_array(jsonb_build_object('id', 'r1', 'nombre', 'Cancha 1', 'detalle', ''), jsonb_build_object('id', 'r2', 'nombre', 'Cancha 2', 'detalle', ''),
                                  jsonb_build_object('id', 'r3', 'nombre', 'Cancha 3', 'detalle', '')),
    'duracion', 90,
    'horario', (select jsonb_agg(jsonb_build_object('abre', '09:00', 'cierra', '00:30', 'cerrado', false)) from generate_series(0, 6)),
    'franjas', jsonb_build_array(jsonb_build_object('desde', '09:00', 'hasta', '17:00', 'precio', 24000),
                                 jsonb_build_object('desde', '17:00', 'hasta', '20:00', 'precio', 28000),
                                 jsonb_build_object('desde', '20:00', 'hasta', '00:30', 'precio', 34000)),
    'senaPct', 25, 'cancelarHoras', 6, 'devolverSena', true)
 where email_dueno = 'martin@prueba.com';
select set_config('prueba.neg', (select id::text from public.negocios where email_dueno = 'martin@prueba.com'), false) \g /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  perform set_config('prueba.turno_neg', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg'), 'recurso', 'r1',
    'fecha_agenda', current_date + 8, 'minuto', 1170))) ->> 'id', false);
end $$;
reset role;
do $$
declare e record;
begin
  assert public.codificar_url('Los Álamos, Av. 1') = 'Los%20%C3%81lamos%2C%20Av.%201', 'codificar_url: ' || public.codificar_url('Los Álamos, Av. 1');
  assert public.link_whatsapp('0261 555-1234') = 'https://wa.me/5492615551234' and public.link_whatsapp('+54 9 261 555 1234') = 'https://wa.me/5492615551234'
     and public.link_whatsapp('') is null, 'link_whatsapp';
  select * into e from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1;
  assert e.body ->> 'subject' like 'Turno confirmado: Los Álamos Pádel, %', 'el nombre del lugar sale de la base: ' || (e.body ->> 'subject');
  assert e.body ->> 'html' like '%>Av. San Martín 1234<br>%' and e.body ->> 'html' like '%Los Álamos Pádel · Tupungato%'
     and e.body ->> 'html' like '%https://www.google.com/maps/search/?api=1&amp;query=Los%20%C3%81lamos%20P%C3%A1del%2C%20Av.%20San%20Mart%C3%ADn%201234%2C%20Tupungato%'
     and e.body ->> 'html' like '%>Cómo llegar<%', 'falta la dirección o "Cómo llegar": ' || (e.body ->> 'html');
  assert e.body ->> 'html' like '%href="https://wa.me/5492615551234"%' and e.body ->> 'html' like '%>0261 555-1234<%', 'falta el WhatsApp: ' || (e.body ->> 'html');
  assert e.body ->> 'html' like '%de 19:30 a 21:00%' and e.body ->> 'html' like '%$&nbsp;7.000%' and e.body ->> 'html' like '%hasta 6 h antes%'
     and e.body ->> 'html' like '%Bookea está en prueba: la seña no se cobró.%' and e.body ->> 'html' not like '%son de ejemplo%', 'datos del turno: ' || (e.body ->> 'html');
  raise notice 'OK  turno en un negocio real: el mail lleva la dirección, "Cómo llegar" (Google Maps) y el WhatsApp de Mi negocio';
  -- 6. Al negocio: turno nuevo, con el cliente y su WhatsApp
  select * into e from net.enviados where body -> 'to' ->> 0 = 'martin@prueba.com' and body ->> 'subject' like 'Turno nuevo%' order by id desc limit 1;
  assert e.body ->> 'subject' = 'Turno nuevo: Juli Paz, ' || public.fecha_larga(current_date + 8) || ' a las 19:30', 'asunto al negocio: ' || coalesce(e.body::text, 'no llegó');
  assert e.body ->> 'html' like '%Tenés un turno nuevo%' and e.body ->> 'html' like '%Hola, Martín:%' and e.body ->> 'html' like '%>Juli Paz<%'
     and e.body ->> 'html' like '%href="https://wa.me/5492615551234"%' and e.body ->> 'html' like '%>261 555 1234<%'
     and e.body ->> 'html' like '%$&nbsp;28.000%' and e.body ->> 'html' like '%No se cobró (Bookea está en prueba)%'
     and e.body ->> 'html' like '%https://bookea.ar/admin.html%', 'mail al negocio: ' || (e.body ->> 'html');
  raise notice 'OK  turno nuevo: al negocio le llega el mail con el día, la cancha, el cliente y su WhatsApp';
end $$;
-- 5 y 7. El cliente cancela: le llega a él y al negocio
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin perform public.cancelar_turno(current_setting('prueba.turno_neg')::uuid); end $$;
reset role;
do $$
declare e record;
begin
  select * into e from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1;
  assert e.body ->> 'html' like '%Cancelaste tu turno%' and e.body ->> 'html' like '%href="https://bookea.ar/losalamospadel/reservar"%', 'al cliente: ' || (e.body ->> 'html');
  select * into e from net.enviados where body -> 'to' ->> 0 = 'martin@prueba.com' order by id desc limit 1;
  assert e.body ->> 'subject' = 'Turno cancelado: Juli Paz, ' || public.fecha_larga(current_date + 8) || ' a las 19:30'
     and e.body ->> 'html' like '%Se canceló un turno%' and e.body ->> 'html' like '%El horario ya está libre en tu agenda%', 'al negocio: ' || e.body::text;
  raise notice 'OK  el cliente cancela: le llega a él y al negocio, que tiene el horario libre';
end $$;
-- 5. El negocio cancela desde su panel: al cliente le llega que lo canceló el lugar (y al negocio no le llega nada)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  perform set_config('prueba.turno_neg2', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg'), 'recurso', 'r2',
    'fecha_agenda', current_date + 8, 'minuto', 1170))) ->> 'id', false);
end $$;
reset role;
select set_config('prueba.mails_antes', (select count(*)::text from net.enviados), false) \g /dev/null
update public.reservas set estado = 'cancelada', retenida = false where id = (select reserva_id from public.turnos where id = current_setting('prueba.turno_neg2')::uuid);
do $$
declare e record;
begin
  assert (select count(*) from net.enviados) = current_setting('prueba.mails_antes')::int + 1, 'el negocio canceló y salieron otros mails que el del cliente';
  select * into e from net.enviados order by id desc limit 1;
  assert e.body -> 'to' ->> 0 = 'juli@prueba.com' and e.body ->> 'html' like '%Los Álamos Pádel</b> canceló tu turno%' and e.body ->> 'html' like '%se te devuelve%',
    'el lugar canceló: ' || e.body::text;
  raise notice 'OK  el negocio cancela desde su panel: al cliente le llega que lo canceló el lugar';
end $$;
-- Con su propio link de Google Maps, se usa ese; un link que no es de Maps (o sin WhatsApp) no aparece
update public.negocios set mapa = 'https://maps.app.goo.gl/AbC123' where email_dueno = 'martin@prueba.com';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg'), 'recurso', 'r3', 'fecha_agenda', current_date + 8, 'minuto', 1170));
end $$;
reset role;
do $$ begin
  assert (select body ->> 'html' from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1) like '%href="https://maps.app.goo.gl/AbC123"%', 'no usó el link de Maps del dueño';
end $$;
update public.negocios set mapa = 'javascript:alert(1)', whatsapp = '', direccion = '', ciudad = '', ajustes = ajustes || '{"devolverSena": false}' where email_dueno = 'martin@prueba.com';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg'), 'recurso', 'r3', 'fecha_agenda', current_date + 8, 'minuto', 1260));
end $$;
reset role;
do $$
declare h text := (select body ->> 'html' from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1);
begin
  assert h not like '%javascript:%' and h not like '%wa.me%' and h not like '%Cómo llegar%' and h like '%Cancha 3%', 'con datos vacíos o un link raro: ' || h;
  assert h like '%en este lugar la seña no se devuelve%', 'un lugar que no devuelve la seña: ' || h;
  raise notice 'OK  con su propio link de Google Maps usa ese; sin datos (o con un link que no es de Maps) no muestra esas filas';
end $$;
-- Con Mercado Pago: mientras espera el pago no sale ningún mail; al acreditarse, los dos (con la seña pagada); al
-- cancelar con tiempo, la seña se devuelve por Mercado Pago y se le avisa a la función (las llaves son inventadas)
select public.mp_guardar_cuenta(current_setting('prueba.neg')::uuid, null,
  '{"access_token": "PRUEBA_LLAVE_martin_0123456789", "refresh_token": "PRUEBA_RENOVAR_martin", "user_id": "777"}') \g /dev/null
update public.negocios set mapa = '', direccion = 'Av. San Martín 1234', ciudad = 'Tupungato', ajustes = ajustes || '{"devolverSena": true}'
 where email_dueno = 'martin@prueba.com';
select set_config('prueba.mails_antes', (select count(*)::text from net.enviados), false) \g /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  perform set_config('prueba.turno_mp', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg'), 'recurso', 'r1',
    'fecha_agenda', current_date + 9, 'minuto', 1170))) ->> 'id', false);
end $$;
reset role;
do $$ begin
  assert (select estado from public.turnos where id = current_setting('prueba.turno_mp')::uuid) = 'pendiente', 'el turno no quedó esperando el pago';
  assert (select count(*) from net.enviados) = current_setting('prueba.mails_antes')::int, 'salió un mail de un turno que todavía no se pagó';
end $$;
select public.mp_cobro_creado(current_setting('prueba.turno_mp')::uuid, 'ORDTSTM1', 'https://x', 7000, 0) \g /dev/null
select public.mp_resultado('ORDTSTM1', 'processed', 'accredited', 7000) \g /dev/null
do $$
declare e record;
begin
  select * into e from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1;
  assert e.body ->> 'subject' like 'Turno confirmado: Los Álamos Pádel, %' and e.body ->> 'html' like '%$&nbsp;7.000 · pagada con Mercado Pago%'
     and e.body ->> 'html' not like '%no se cobró%' and e.body ->> 'html' like '%>Cómo llegar<%', 'al cliente, pagado: ' || (e.body ->> 'html');
  select * into e from net.enviados where body -> 'to' ->> 0 = 'martin@prueba.com' order by id desc limit 1;
  assert e.body ->> 'subject' like 'Turno nuevo: Juli Paz, %' and e.body ->> 'html' like '%pagada con Mercado Pago (ya está en tu cuenta)%'
     and e.body ->> 'html' not like '%Bookea está en prueba%', 'al negocio, pagado: ' || (e.body ->> 'html');
  assert (select count(*) from net.enviados) = current_setting('prueba.mails_antes')::int + 2, 'al acreditarse no salieron los dos mails (o salieron de más)';
  raise notice 'OK  con Mercado Pago: mientras espera el pago no sale ningún mail; al acreditarse llegan los dos, con la seña pagada';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin perform public.cancelar_turno(current_setting('prueba.turno_mp')::uuid); end $$;
reset role;
do $$
declare e record;
begin
  select * into e from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1;
  assert e.body ->> 'html' like '%se devuelve por Mercado Pago (puede tardar unos días en verse).%' and e.body ->> 'html' not like '%no se cobró%',
    'al cliente, cancelado: ' || (e.body ->> 'html');
  select * into e from net.enviados where body -> 'to' ->> 0 = 'martin@prueba.com' order by id desc limit 1;
  assert e.body ->> 'html' like '%se le devuelve sola por Mercado Pago, desde tu cuenta.%', 'al negocio, cancelado: ' || (e.body ->> 'html');
  assert exists (select 1 from net.enviados where url = 'https://vpxzuutavdjwglglbvdt.supabase.co/functions/v1/mp/devolver'), 'no se le avisó a la función que devuelva la seña';
  assert (select devolucion from public.mp_cobros where orden = 'ORDTSTM1') = 'pendiente', 'la seña no quedó para devolver';
  raise notice 'OK  con Mercado Pago, al cancelar con tiempo los mails dicen que la seña vuelve por Mercado Pago y se le avisa a la función';
end $$;
-- Sin seña (27/11): con la seña en 0 %, los mails dicen "Sin seña" y nada de "en prueba" ni de devolver la seña
update public.negocios set ajustes = ajustes || '{"senaPct": 0}' where id = current_setting('prueba.neg')::uuid;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  perform set_config('prueba.turno_sin', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg'), 'recurso', 'r2',
    'fecha_agenda', current_date + 9, 'minuto', 1170))) ->> 'id', false);
end $$;
reset role;
do $$
declare e record;
begin
  select * into e from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1;
  assert e.body ->> 'subject' like 'Turno confirmado:%' and e.body ->> 'html' like '%Sin seña%' and e.body ->> 'html' like '%$&nbsp;28.000%'
     and e.body ->> 'html' like '%cancelalo desde Mis turnos así el horario se libera.%'
     and e.body ->> 'html' not like '%en prueba%' and e.body ->> 'html' not like '%seña se devuelve%', 'sin seña, al cliente: ' || (e.body ->> 'html');
  select * into e from net.enviados where body -> 'to' ->> 0 = 'martin@prueba.com' and body ->> 'subject' like 'Turno nuevo%' order by id desc limit 1;
  assert e.body ->> 'html' like '%Sin seña%' and e.body ->> 'html' not like '%en prueba%', 'sin seña, al negocio: ' || (e.body ->> 'html');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin perform public.cancelar_turno(current_setting('prueba.turno_sin')::uuid); end $$;
reset role;
do $$
declare e record;
begin
  select * into e from net.enviados where body -> 'to' ->> 0 = 'juli@prueba.com' order by id desc limit 1;
  assert e.body ->> 'html' like '%Este turno no tenía seña.%' and e.body ->> 'html' not like '%en prueba%', 'sin seña, cancelado, al cliente: ' || (e.body ->> 'html');
  select * into e from net.enviados where body -> 'to' ->> 0 = 'martin@prueba.com' order by id desc limit 1;
  assert e.body ->> 'html' like '%El turno no tenía seña.%' and e.body ->> 'html' not like '%en prueba%', 'sin seña, cancelado, al negocio: ' || (e.body ->> 'html');
  raise notice 'OK  sin seña: los mails de turno nuevo y cancelado dicen "Sin seña", sin nada de la prueba ni de devolver la seña';
end $$;
update public.negocios set ajustes = ajustes || '{"senaPct": 25}' where id = current_setting('prueba.neg')::uuid;
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
