-- =====================================================================================
-- Bookea: avisos por mail con Resend
--
--   1. A vos (equipo de Bookea): cada vez que un negocio se registra y queda pendiente.
--   2. Al negocio: cuando lo aprobás. Este solo se manda si configurás un remitente con tu
--      propio dominio (Resend no deja mandar a otras personas desde su dirección de prueba).
--
-- Antes de correr este archivo, guardá los datos en Vault (SQL Editor, una vez, cambiando los valores):
--
--   select vault.create_secret('re_TU_API_KEY', 'resend_api_key');        -- la API key de Resend
--   select vault.create_secret('tu@email.com',  'aviso_bookea_email');     -- adónde te llegan los avisos
--   -- opcional, recién cuando tengas tu dominio verificado en Resend:
--   select vault.create_secret('Bookea <avisos@tudominio.com>', 'resend_remitente');
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

-- 1. Negocio nuevo → aviso al equipo de Bookea
create or replace function public.avisar_negocio_nuevo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.mandar_mail(
    public.secreto('aviso_bookea_email'),
    'Nuevo negocio para aprobar: ' || new.nombre,
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#11151c">'
    || '<p><b>' || public.html_seguro(new.nombre) || '</b> se registró en Bookea y espera tu aprobación.</p>'
    || '<p>Rubro: ' || public.html_seguro(nullif(new.rubro, '')) || '<br>'
    || 'Lo pidió: ' || public.html_seguro(nullif(new.nombre_dueno, '')) || ' (' || public.html_seguro(new.email_dueno) || ')</p>'
    || '<p><a href="' || public.bookea_url_panel() || '" style="color:#0f5e52;font-weight:bold">Entrá al panel</a> y abrí <b>Solicitudes de negocios</b> para aprobarlo o rechazarlo.</p>'
    || '</div>'
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
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#11151c">'
    || '<p>Hola' || coalesce(', ' || nullif(public.html_seguro(split_part(btrim(new.nombre_dueno), ' ', 1)), ''), '') || ':</p>'
    || '<p><b>' || public.html_seguro(new.nombre) || '</b> ya está aprobado. Desde ahora podés entrar al panel con tu email y tu contraseña.</p>'
    || '<p><a href="' || public.bookea_url_panel() || '" style="color:#0f5e52;font-weight:bold">Entrar al panel</a></p>'
    || '</div>'
  );
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists avisar_negocio_aprobado on public.negocios;
create trigger avisar_negocio_aprobado after update of estado on public.negocios
  for each row when (new.estado = 'aprobado' and old.estado is distinct from 'aprobado')
  execute function public.avisar_negocio_aprobado();
