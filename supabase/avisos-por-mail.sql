-- =====================================================================================
-- Bookea: avisos por mail con Resend
--
--   1. A vos (equipo de Bookea): cada vez que un negocio se registra y queda pendiente.
--   2. Al negocio: cuando lo aprobás.
--   3. Al negocio: cuando lo rechazás (o le quitás el acceso a uno que estaba aprobado).
--   4. Al cliente que reserva en bookea.ar: su turno confirmado.
--   5. Al cliente: cuando cancela un turno.
--   Los avisos 2 a 5 solo se mandan si configurás un remitente con tu propio dominio
--   (Resend no deja mandar a otras personas desde su dirección de prueba).
--   Todos salen con la misma cara que los mails de Supabase (supabase/mails/): franja noche
--   con el logo, línea verde agua y naranja, fondo crema.
--
-- Antes de correr este archivo, guardá los datos en Vault (SQL Editor, una vez, cambiando los valores):
--
--   select vault.create_secret('re_TU_API_KEY', 'resend_api_key');        -- la API key de Resend
--   select vault.create_secret('tu@email.com',  'aviso_bookea_email');     -- adónde te llegan los avisos
--   -- recién cuando tengas tu dominio verificado en Resend (Bookea ya lo tiene):
--   select vault.create_secret('Bookea <no-responder@bookea.ar>', 'resend_remitente');
--
-- Sin remitente propio se usa "onboarding@resend.dev", que solo puede mandarle al email con el
-- que creaste la cuenta de Resend: usá ese mismo email en aviso_bookea_email.
--
-- Los mails salen con pg_net (pedidos HTTP desde la base, sin servidor aparte). Si algo falla
-- (sin clave, Resend caído), el registro del negocio sigue igual: el aviso nunca lo frena.
-- Se puede correr más de una vez.
-- =====================================================================================

create extension if not exists pg_net with schema extensions;

-- Dirección del panel, para los links de los mails
create or replace function public.bookea_url_panel() returns text language sql immutable as $$
  select 'https://bookea.ar/admin.html'
$$;

-- Lo que escribe la gente (nombre del negocio, etc.) va dentro del HTML del mail: se escapa
create or replace function public.html_seguro(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;')
$$;

create or replace function public.secreto(nombre text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = nombre limit 1
$$;
revoke all on function public.secreto(text) from public, anon, authenticated;

create or replace function public.mandar_mail(para text, asunto text, html text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  clave text := public.secreto('resend_api_key');
  de    text := coalesce(public.secreto('resend_remitente'), 'Bookea <onboarding@resend.dev>');
begin
  if clave is null or coalesce(para, '') = '' then return; end if;
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || clave, 'Content-Type', 'application/json'),
    body    := jsonb_build_object('from', de, 'to', jsonb_build_array(para), 'subject', asunto, 'html', html)
  );
exception when others then
  raise warning 'Bookea: no se pudo mandar el mail a %: %', para, sqlerrm;
end $$;
revoke all on function public.mandar_mail(text, text, text) from public, anon, authenticated;

-- (generado por scripts/mails.py: inicio; no editar a mano)
-- La cara de todos los avisos: la misma de supabase/mails/. "cuerpo" ya viene escapado.
create or replace function public.mail_bookea(titulo text, cuerpo text, boton text default null,
  url text default null, nota text default null) returns text language sql immutable as $$
  select '<div lang="es" dir="ltr" style="background:#f5ecd7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#11151c"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border-collapse:separate"><tr><td bgcolor="#11151c" style="background:#11151c;padding:22px 28px"><img src="https://bookea.ar/marca/isotipo-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0"><span style="font-size:22px;font-weight:bold;letter-spacing:-0.3px;vertical-align:middle;margin-left:10px;color:#f5ecd7">Bookea</span></td></tr><tr><td style="padding:0;line-height:0;font-size:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="62%" height="6" bgcolor="#1fa08c" style="background:#1fa08c;height:6px;line-height:6px;font-size:0">&nbsp;</td><td width="38%" height="6" bgcolor="#e4572e" style="background:#e4572e;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr></table></td></tr>'
    || '<tr><td style="padding:30px 28px 30px">'
    || '<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;color:#11151c">' || titulo || '</h1>'
    || '<div style="font-size:15px;line-height:1.55;color:#3d4350">' || cuerpo || '</div>'
    || coalesce('<a href="' || url || '" style="display:inline-block;margin-top:12px;background:#1fa08c;color:#11151c;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 24px;border-radius:6px">' || boton || '</a>', '')
    || coalesce('<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#5b6170">' || nota || '</p>', '')
    || '</td></tr>'
    || '</table><p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6f6656;text-align:center"><b style="color:#11151c">Bookea</b> · Reservá turnos en segundos.<br><a href="https://bookea.ar" style="color:#6f6656">bookea.ar</a></p></div>'
$$;
-- (generado por scripts/mails.py: fin)

-- "Hola, Lu:" con el primer nombre, o "Hola:" si no hay
create or replace function public.saludo(nombre text) returns text language sql immutable as $$
  select '<p style="margin:0 0 12px">Hola' || coalesce(', ' || nullif(public.html_seguro(split_part(btrim(coalesce(nombre, '')), ' ', 1)), ''), '') || ':</p>'
$$;

-- Las piezas de los mails son solo para los avisos: no quedan como /rpc/ públicas
revoke all on function public.mail_bookea(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.saludo(text) from public, anon, authenticated;
revoke all on function public.html_seguro(text) from public, anon, authenticated;
revoke all on function public.bookea_url_panel() from public, anon, authenticated;

-- 1. Negocio nuevo → aviso al equipo de Bookea
create or replace function public.avisar_negocio_nuevo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.mandar_mail(
    public.secreto('aviso_bookea_email'),
    'Nuevo negocio para aprobar: ' || new.nombre,
    public.mail_bookea(
      'Nuevo negocio para aprobar',
      '<p style="margin:0 0 16px"><b style="color:#11151c">' || public.html_seguro(new.nombre) || '</b> se registró en Bookea y espera tu aprobación.</p>'
      || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;line-height:1.5">'
      || '<tr><td style="padding:2px 16px 2px 0;color:#6f6656">Rubro</td><td style="color:#11151c">' || coalesce(nullif(public.html_seguro(new.rubro), ''), '—') || '</td></tr>'
      || '<tr><td style="padding:2px 16px 2px 0;color:#6f6656">Lo pidió</td><td style="color:#11151c">' || coalesce(nullif(public.html_seguro(new.nombre_dueno), ''), '—') || '</td></tr>'
      || '<tr><td style="padding:2px 16px 2px 0;color:#6f6656">Email</td><td style="color:#11151c">' || public.html_seguro(new.email_dueno) || '</td></tr>'
      || '</table>',
      'Revisar solicitudes', public.bookea_url_panel(),
      'En el panel, abrí <b>Solicitudes</b> para aprobarlo o rechazarlo.')
  );
  return new;
exception when others then
  return new; -- nunca frena el registro
end $$;
drop trigger if exists avisar_negocio_nuevo on public.negocios;
create trigger avisar_negocio_nuevo after insert on public.negocios
  for each row when (new.estado = 'pendiente') execute function public.avisar_negocio_nuevo();

-- 2. Negocio aprobado → aviso al dueño (solo con remitente de dominio propio)
create or replace function public.avisar_negocio_aprobado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.secreto('resend_remitente') is null then return new; end if;
  perform public.mandar_mail(
    new.email_dueno,
    'Tu negocio ya está aprobado en Bookea',
    public.mail_bookea(
      'Tu negocio ya está aprobado',
      public.saludo(new.nombre_dueno)
      || '<p style="margin:0 0 12px"><b style="color:#11151c">' || public.html_seguro(new.nombre) || '</b> ya está aprobado en Bookea. Desde ahora podés entrar al panel con tu email y tu contraseña y armar tu agenda: tus horarios, tus turnos y tus clientes.</p>',
      'Entrar al panel', public.bookea_url_panel(),
      'Si no te acordás la contraseña, en la pantalla de ingreso tocá "¿Te olvidaste la contraseña?".')
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists avisar_negocio_aprobado on public.negocios;
create trigger avisar_negocio_aprobado after update of estado on public.negocios
  for each row when (new.estado = 'aprobado' and old.estado is distinct from 'aprobado')
  execute function public.avisar_negocio_aprobado();

-- 3. Negocio rechazado → aviso al dueño (solo con remitente de dominio propio).
--    Si estaba aprobado y le quitaste el acceso, el texto lo dice así.
create or replace function public.avisar_negocio_rechazado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  quitado boolean := old.estado = 'aprobado';
begin
  if public.secreto('resend_remitente') is null then return new; end if;
  perform public.mandar_mail(
    new.email_dueno,
    case when quitado then 'Se pausó el acceso de tu negocio a Bookea' else 'Tu solicitud en Bookea no fue aprobada' end,
    public.mail_bookea(
      case when quitado then 'Se pausó el acceso de tu negocio' else 'Tu solicitud no fue aprobada' end,
      public.saludo(new.nombre_dueno)
      || '<p style="margin:0 0 12px">'
      || case when quitado
           then 'Por ahora <b style="color:#11151c">' || public.html_seguro(new.nombre) || '</b> no puede usar el panel de Bookea. Tus datos quedan guardados.'
           else 'Revisamos la solicitud de <b style="color:#11151c">' || public.html_seguro(new.nombre) || '</b> y por ahora no la pudimos aprobar.'
         end || '</p>'
      || '<p style="margin:0 0 12px">Si creés que es un error o querés contarnos más de tu negocio, escribinos a <a href="mailto:hola@bookea.ar" style="color:#0f5e52;font-weight:bold">hola@bookea.ar</a>.</p>')
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists avisar_negocio_rechazado on public.negocios;
create trigger avisar_negocio_rechazado after update of estado on public.negocios
  for each row when (new.estado = 'rechazado' and old.estado is distinct from 'rechazado')
  execute function public.avisar_negocio_rechazado();

-- =====================================================================================
-- Mails a los clientes que reservan en bookea.ar (tabla turnos de esquema.sql):
--   4. Turno confirmado: al pagar la seña, con el día, la hora, el lugar, la cancha y el código.
--   5. Turno cancelado: cuando lo cancela desde Mis turnos, con lo que pasa con la seña.
--   Como los avisos 2 y 3, solo se mandan con remitente de dominio propio (resend_remitente).
-- =====================================================================================

-- Adónde llevan los botones de estos mails
create or replace function public.bookea_url_turnos() returns text language sql immutable as $$
  select 'https://bookea.ar/#mis-turnos'
$$;
-- Mientras los lugares de la página sean de ejemplo y la seña no se cobre, los mails lo dicen.
-- Cuando se cobre de verdad (Mercado Pago), cambiá el true por false y volvé a correr este archivo.
create or replace function public.bookea_en_prueba() returns boolean language sql immutable as $$
  select true
$$;
-- "jueves 20 de noviembre"
create or replace function public.fecha_larga(d date) returns text language sql immutable as $$
  select (array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'])[extract(dow from d)::int + 1]
    || ' ' || extract(day from d)::int || ' de '
    || (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from d)::int]
$$;
-- "$ 34.000"
create or replace function public.plata(n integer) returns text language sql immutable as $$
  select '$&nbsp;' || replace(to_char(coalesce(n, 0), 'FM999,999,990'), ',', '.')
$$;
-- Una fila de la tabla de datos del turno (el valor ya viene escapado)
create or replace function public.fila_mail(etiqueta text, valor text) returns text language sql immutable as $$
  select '<tr><td style="padding:3px 16px 3px 0;color:#6f6656;vertical-align:top;white-space:nowrap">' || etiqueta
    || '</td><td style="padding:3px 0;color:#11151c">' || valor || '</td></tr>'
$$;
revoke all on function public.bookea_url_turnos() from public, anon, authenticated;
revoke all on function public.bookea_en_prueba() from public, anon, authenticated;
revoke all on function public.fecha_larga(date) from public, anon, authenticated;
revoke all on function public.plata(integer) from public, anon, authenticated;
revoke all on function public.fila_mail(text, text) from public, anon, authenticated;

-- Un texto listo para ir dentro de un link (los espacios y las tildes, como %20 y %C3%A1)
create or replace function public.codificar_url(t text) returns text language sql immutable as $$
  select coalesce(string_agg(case when b between 48 and 57 or b between 65 and 90 or b between 97 and 122 or b in (45, 46, 95, 126)
                                  then chr(b) else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
  from (select i, get_byte(convert_to(coalesce(t, ''), 'UTF8'), i) as b
          from generate_series(0, octet_length(convert_to(coalesce(t, ''), 'UTF8')) - 1) as i) s
$$;
-- "Cómo llegar": el link de Google Maps que pegó el dueño en Mi negocio, o uno armado con el nombre, la dirección
-- y la ciudad (igual que el panel). Un link que no es de Google Maps no se usa.
create or replace function public.link_mapa(nombre text, direccion text, ciudad text, mapa text) returns text language sql immutable as $$
  select case
    when coalesce(mapa, '') ~* '^https://((www\.)?google\.[a-z.]+/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl/maps)' then mapa
    when btrim(coalesce(direccion, '')) = '' and btrim(coalesce(ciudad, '')) = '' then null
    else 'https://www.google.com/maps/search/?api=1&query='
         || public.codificar_url(concat_ws(', ', nullif(btrim(nombre), ''), nullif(btrim(direccion), ''), nullif(btrim(ciudad), '')))
  end
$$;
-- El WhatsApp del lugar como link de wa.me (igual que el panel: sin el 0 de adelante y con 549 si no tiene el 54)
create or replace function public.link_whatsapp(numero text) returns text language sql immutable as $$
  select case when d = '' then null when d like '54%' then 'https://wa.me/' || d else 'https://wa.me/549' || d end
  from (select regexp_replace(regexp_replace(coalesce(numero, ''), '[^0-9]', '', 'g'), '^0', '') as d) s
$$;
revoke all on function public.codificar_url(text) from public, anon, authenticated;
revoke all on function public.link_mapa(text, text, text, text) from public, anon, authenticated;
revoke all on function public.link_whatsapp(text) from public, anon, authenticated;

-- 4. Turno confirmado → mail al cliente
create or replace function public.avisar_turno_confirmado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c      public.clientes%rowtype;
  n      public.negocios%rowtype; -- el negocio real del turno (vacío en los lugares de ejemplo)
  mapa   text;
  wa     text;
  cuando text := upper(left(public.fecha_larga(new.fecha), 1)) || substr(public.fecha_larga(new.fecha), 2) || ', de ' || to_char(new.hora, 'HH24:MI') || ' a ' || to_char(new.fin, 'HH24:MI');
begin
  if public.secreto('resend_remitente') is null then return new; end if;
  select * into c from public.clientes where id = new.cliente_id;
  -- Turno de un negocio real: su dirección, "Cómo llegar" y su WhatsApp, tal como los tiene cargados en Mi negocio
  if new.negocio_id is not null then
    select * into n from public.negocios where id = new.negocio_id;
    mapa := public.link_mapa(n.nombre, n.direccion, n.ciudad, n.mapa);
    wa   := public.link_whatsapp(n.whatsapp);
  end if;
  perform public.mandar_mail(
    c.email,
    'Turno confirmado: ' || new.lugar || ', ' || public.fecha_larga(new.fecha) || ' a las ' || to_char(new.hora, 'HH24:MI'),
    public.mail_bookea(
      'Tu turno está confirmado',
      public.saludo(c.nombre)
      || '<p style="margin:0 0 16px">Te esperamos en <b style="color:#11151c">' || public.html_seguro(new.lugar) || '</b>. Estos son los datos de tu turno:</p>'
      || '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;line-height:1.5">'
      || public.fila_mail('Cuándo', '<b>' || cuando || '</b>')
      || public.fila_mail('Dónde', public.html_seguro(new.lugar) || coalesce(' · ' || nullif(public.html_seguro(new.zona), ''), ''))
      || case when btrim(coalesce(n.direccion, '')) <> '' or mapa is not null then public.fila_mail('Dirección',
           -- la ciudad ya va en "Dónde": acá solo si es otra
           coalesce(nullif(public.html_seguro(concat_ws(', ', nullif(btrim(n.direccion), ''),
             case when btrim(coalesce(n.ciudad, '')) <> new.zona then nullif(btrim(n.ciudad), '') end)), '') || '<br>', '')
           || coalesce('<a href="' || public.html_seguro(mapa) || '" style="color:#0f5e52;font-weight:bold">Cómo llegar</a>', ''))
         else '' end
      || case when wa is not null then public.fila_mail('WhatsApp',
           '<a href="' || public.html_seguro(wa) || '" style="color:#0f5e52;font-weight:bold">' || public.html_seguro(btrim(n.whatsapp)) || '</a>')
         else '' end
      || public.fila_mail(case when new.rubro ilike 'barber%' then 'Con' else 'Cancha' end, public.html_seguro(new.cancha))
      || case when new.rubro ilike 'barber%' and new.servicio <> '' then public.fila_mail('Servicio', public.html_seguro(new.servicio)) else '' end
      || public.fila_mail('Seña', public.plata(new.sena))
      || public.fila_mail('En el lugar', public.plata(new.precio - new.sena))
      || public.fila_mail('Código', '<b style="font-family:monospace;letter-spacing:1px">' || new.codigo || '</b>')
      || '</table>'
      || '<p style="margin:0 0 12px">Llegá 10 minutos antes. Si no podés ir, cancelalo desde Mis turnos: hasta '
      || new.cancelar_horas || ' h antes, la seña se devuelve.</p>'
      || case when public.bookea_en_prueba()
           then '<p style="margin:0 0 12px;font-size:13px;color:#6f6656">Bookea está en prueba: los lugares de la página son de ejemplo y la seña no se cobró.</p>'
           else '' end,
      'Ver mis turnos', public.bookea_url_turnos(),
      'Te mandamos este mail porque reservaste un turno en Bookea con este email.')
  );
  return new;
exception when others then
  return new; -- el mail nunca frena la reserva
end $$;
drop trigger if exists avisar_turno_confirmado on public.turnos;
create trigger avisar_turno_confirmado after insert on public.turnos
  for each row when (new.estado = 'confirmado') execute function public.avisar_turno_confirmado();

-- 5. Turno cancelado → mail al cliente
create or replace function public.avisar_turno_cancelado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c        public.clientes%rowtype;
  devuelve boolean := (new.fecha + new.hora) - (coalesce(new.cancelado, now()) at time zone 'America/Argentina/Mendoza')
                      > make_interval(hours => new.cancelar_horas);
begin
  if public.secreto('resend_remitente') is null then return new; end if;
  select * into c from public.clientes where id = new.cliente_id;
  perform public.mandar_mail(
    c.email,
    'Turno cancelado: ' || new.lugar || ', ' || public.fecha_larga(new.fecha) || ' a las ' || to_char(new.hora, 'HH24:MI'),
    public.mail_bookea(
      'Cancelaste tu turno',
      public.saludo(c.nombre)
      || '<p style="margin:0 0 12px">Tu turno en <b style="color:#11151c">' || public.html_seguro(new.lugar) || '</b> del '
      || public.fecha_larga(new.fecha) || ' a las ' || to_char(new.hora, 'HH24:MI') || ' (' || public.html_seguro(new.cancha)
      || ') quedó cancelado y el horario se liberó.</p>'
      || '<p style="margin:0 0 12px">'
      || case when new.sena = 0 then 'No tenías seña pagada.'
              when devuelve then 'Lo cancelaste con más de ' || new.cancelar_horas || ' h de anticipación: la seña de ' || public.plata(new.sena) || ' se devuelve.'
              else 'Lo cancelaste con menos de ' || new.cancelar_horas || ' h de anticipación: la seña de ' || public.plata(new.sena) || ' queda para el lugar.' end
      || '</p>',
      'Reservar otro turno', 'https://bookea.ar/',
      'Si no lo cancelaste vos, escribinos a <a href="mailto:hola@bookea.ar" style="color:#0f5e52;font-weight:bold">hola@bookea.ar</a>.')
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists avisar_turno_cancelado on public.turnos;
create trigger avisar_turno_cancelado after update of estado on public.turnos
  for each row when (new.estado = 'cancelado' and old.estado = 'confirmado')
  execute function public.avisar_turno_cancelado();
