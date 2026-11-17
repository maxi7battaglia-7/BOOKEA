-- =====================================================================================
-- Bookea: avisos por mail con Resend
--
--   1. A vos (equipo de Bookea): cada vez que un negocio se registra y queda pendiente.
--   2. Al negocio: cuando lo aprobás.
--   3. Al negocio: cuando lo rechazás (o le quitás el acceso a uno que estaba aprobado).
--   Los avisos 2 y 3 solo se mandan si configurás un remitente con tu propio dominio
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
  select '<div style="background:#f5ecd7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#11151c"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border-collapse:separate"><tr><td bgcolor="#11151c" style="background:#11151c;padding:22px 28px"><img src="https://bookea.ar/marca/isotipo-192.png" width="36" height="36" alt="" style="vertical-align:middle;border:0"><span style="font-size:22px;font-weight:bold;letter-spacing:-0.3px;vertical-align:middle;margin-left:10px;color:#f5ecd7">Bookea</span></td></tr><tr><td style="padding:0;line-height:0;font-size:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="62%" height="6" bgcolor="#1fa08c" style="background:#1fa08c;height:6px;line-height:6px;font-size:0">&nbsp;</td><td width="38%" height="6" bgcolor="#e4572e" style="background:#e4572e;height:6px;line-height:6px;font-size:0">&nbsp;</td></tr></table></td></tr>'
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
