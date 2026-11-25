-- =====================================================================================
-- Bookea: base de datos en Supabase (Postgres)
--
-- Cómo se usa: en tu proyecto de Supabase, abrí "SQL Editor", pegá TODO este archivo y
-- tocá "Run". Se puede correr más de una vez sin romper nada.
--
-- Qué guarda:
--   · Las cuentas (email y contraseña) las guarda Supabase Auth, en auth.users. Bookea
--     nunca ve ni guarda la contraseña: Supabase guarda solo un hash (bcrypt).
--   · negocios  → cada cancha, complejo o local, con su link de reservas (slug).
--   · miembros  → qué cuenta administra qué negocio: el dueño y las personas de su equipo,
--                 cada una con sus permisos (ver la agenda, cargar turnos, finanzas, etc.).
--   · invitaciones → los links que el dueño le manda a alguien para sumarlo a su equipo.
--   · reservas  → los turnos de cada negocio.
--   · admins_bookea → las cuentas del equipo de Bookea, que aprueban o rechazan los negocios nuevos.
--   · clientes  → quienes reservan turnos desde la página (bookea.ar): nombre, email y celular.
--   · turnos    → los turnos que reservó cada cliente (ver "Clientes", al final).
--
-- Aprobación: un negocio recién registrado queda "pendiente". Hasta que alguien de Bookea lo
-- apruebe, su cuenta puede ver que está en espera, pero no puede leer ni guardar turnos.
--
-- Quién ve qué (Row Level Security): cada cuenta solo puede leer y cambiar los negocios
-- de los que es miembro y sus reservas. Lo controla la base, no el navegador: aunque
-- alguien toque el código de la página, no puede ver los datos de otro negocio.
-- =====================================================================================

-- ---------- Negocios ----------
create table if not exists public.negocios (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]{1,30}$'),
  nombre      text not null check (char_length(nombre) between 1 and 80),
  rubro       text not null default '' check (char_length(rubro) <= 60),
  ciudad      text not null default '' check (char_length(ciudad) <= 80),
  direccion   text not null default '' check (char_length(direccion) <= 120),
  whatsapp    text not null default '' check (char_length(whatsapp) <= 40),
  foto        text not null default '' check (char_length(foto) <= 400000),   -- imagen chica (320 px) como data URL
  descripcion text not null default '' check (char_length(descripcion) <= 300),
  mapa        text not null default '' check (char_length(mapa) <= 500),
  -- canchas o lugares, duración del turno, horarios, precios por franja, seña y cancelación
  ajustes     jsonb not null default '{}'::jsonb check (jsonb_typeof(ajustes) = 'object'),
  creado      timestamptz not null default now()
);

-- Aprobación por el equipo de Bookea (se agrega así para que funcione también en una base que ya existía)
alter table public.negocios
  add column if not exists estado       text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  add column if not exists nombre_dueno text not null default '' check (char_length(nombre_dueno) <= 80),
  add column if not exists email_dueno  text not null default '' check (char_length(email_dueno) <= 200),
  add column if not exists revisado     timestamptz;

-- La página del negocio en bookea.ar/nombre (pedido del dueño, 21/11): frase, historia, redes, si muestra su WhatsApp,
-- y las direcciones de su logo, su portada y su galería (las fotos van en Storage: negocios/<id del negocio>/...).
alter table public.negocios add column if not exists pagina jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'negocios_pagina_valida') then
    alter table public.negocios add constraint negocios_pagina_valida
      check (jsonb_typeof(pagina) = 'object' and octet_length(pagina::text) <= 20000);
  end if;
end $$;

-- ---------- Equipo de Bookea: quién aprueba los negocios nuevos ----------
-- Se agrega a mano desde el SQL Editor (ver supabase/LEEME.md):
--   insert into public.admins_bookea (user_id) select id from auth.users where email = 'tu@email.com';
create table if not exists public.admins_bookea (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creado  timestamptz not null default now()
);

-- ---------- Miembros: qué cuenta administra qué negocio ----------
create table if not exists public.miembros (
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rol        text not null default 'dueno' check (rol in ('dueno', 'encargado')),
  creado     timestamptz not null default now(),
  primary key (negocio_id, user_id)
);
create index if not exists miembros_por_cuenta on public.miembros (user_id);

-- ---------- Equipo: las personas que el dueño suma a su negocio, cada una con sus permisos ----------
-- Permisos posibles (el dueño los tiene todos y además maneja el equipo):
--   agenda   → ver la agenda
--   turnos   → cargar turnos, cambiarlos, cancelarlos y marcar si pagaron (incluye ver la agenda)
--   finanzas → ver Finanzas
--   clientes → ver Clientes
--   negocio  → cambiar Mi negocio (datos, horarios, precios, canchas y link)
alter table public.miembros
  add column if not exists permisos text[] not null default '{}',
  add column if not exists nombre   text   not null default '' check (char_length(nombre) <= 80),
  add column if not exists email    text   not null default '' check (char_length(email) <= 200);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'miembros_permisos_validos') then
    alter table public.miembros add constraint miembros_permisos_validos
      check (permisos <@ array['agenda', 'turnos', 'finanzas', 'clientes', 'negocio']::text[]);
  end if;
end $$;
-- Cuentas de antes: se completa el nombre y el email de cada miembro
update public.miembros m
   set email  = left(lower(coalesce(u.email, '')), 200),
       nombre = left(btrim(coalesce(u.raw_user_meta_data ->> 'nombre', '')), 80)
  from auth.users u
 where u.id = m.user_id and m.email = '';

-- El dueño crea una invitación y le manda el link (con el token) a la persona por WhatsApp.
-- La persona crea su cuenta con ese link y con el mismo email: queda en el equipo con esos permisos.
-- Cada link sirve una sola vez y vence a los 7 días.
create table if not exists public.invitaciones (
  id         uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios (id) on delete cascade,
  token      text not null unique check (char_length(token) >= 32),
  email      text not null check (char_length(email) between 3 and 200),
  nombre     text not null default '' check (char_length(nombre) <= 80),
  permisos   text[] not null default '{}' check (permisos <@ array['agenda', 'turnos', 'finanzas', 'clientes', 'negocio']::text[]),
  creado     timestamptz not null default now(),
  vence      timestamptz not null default now() + interval '7 days',
  usada      timestamptz,
  usada_por  uuid references auth.users (id) on delete set null
);
create index if not exists invitaciones_por_negocio on public.invitaciones (negocio_id);

-- ---------- Reservas ----------
create table if not exists public.reservas (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  recurso     text not null check (char_length(recurso) between 1 and 40),     -- id de la cancha dentro del negocio
  fecha       date not null,
  hora        smallint not null check (hora >= 0 and hora < 2880),             -- minutos desde las 00:00
  cliente     text not null default '' check (char_length(cliente) <= 80),
  wa          text not null default '' check (char_length(wa) <= 40),
  precio      integer not null default 0 check (precio >= 0),
  sena        integer not null default 0 check (sena >= 0),
  estado      text not null check (estado in ('confirmada', 'jugada', 'ausente', 'cancelada', 'bloqueo')),
  retenida    boolean not null default false,
  origen      text not null default '' check (origen in ('', 'link', 'telefono', 'fijo')),
  nota        text not null default '' check (char_length(nota) <= 500),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists reservas_por_fecha on public.reservas (negocio_id, fecha);
-- Un horario de una cancha no puede tener dos reservas activas (las canceladas no cuentan).
-- Si dos personas reservan el mismo turno a la vez, la base acepta una y rechaza la otra.
create unique index if not exists reservas_un_turno_por_horario
  on public.reservas (negocio_id, recurso, fecha, hora) where estado <> 'cancelada';

create or replace function public.marcar_actualizado() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado := now();
  return new;
end $$;
drop trigger if exists reservas_actualizado on public.reservas;
create trigger reservas_actualizado before update on public.reservas
  for each row execute function public.marcar_actualizado();

-- ---------- ¿Esta cuenta administra este negocio? ----------
create or replace function public.es_miembro(n uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m where m.negocio_id = n and m.user_id = auth.uid());
$$;

-- ¿Esta cuenta administra este negocio y el negocio ya está aprobado? (para usar el panel)
create or replace function public.es_miembro_activo(n uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m join public.negocios x on x.id = m.negocio_id
    where m.negocio_id = n and m.user_id = auth.uid() and x.estado = 'aprobado'
  );
$$;

-- ¿Esta cuenta es del equipo de Bookea?
create or replace function public.es_admin_bookea() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins_bookea a where a.user_id = auth.uid());
$$;

-- Aprobar o rechazar un negocio. Solo el equipo de Bookea; nadie puede aprobarse solo.
create or replace function public.revisar_negocio(n uuid, aprobar boolean) returns text
language plpgsql security definer set search_path = '' as $$
declare nuevo text := case when aprobar then 'aprobado' else 'rechazado' end;
begin
  if not public.es_admin_bookea() then
    raise exception 'Solo el equipo de Bookea puede aprobar negocios' using errcode = '42501';
  end if;
  update public.negocios set estado = nuevo, revisado = now() where id = n;
  if not found then raise exception 'No existe ese negocio' using errcode = 'P0002'; end if;
  return nuevo;
end $$;

-- ---------- Equipo: quién puede hacer qué ----------
-- ¿Esta cuenta es la dueña de este negocio?
create or replace function public.es_dueno(n uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros m where m.negocio_id = n and m.user_id = auth.uid() and m.rol = 'dueno');
$$;

-- ¿Esta cuenta puede hacer "p" en este negocio? El dueño puede todo; el resto, lo que le dieron.
-- El negocio tiene que estar aprobado.
create or replace function public.tiene_permiso(n uuid, p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.miembros m join public.negocios x on x.id = m.negocio_id
    where m.negocio_id = n and m.user_id = auth.uid() and x.estado = 'aprobado'
      and (m.rol = 'dueno' or p = any (m.permisos))
  );
$$;

-- Deja solo permisos que existen, sin repetir. Cargar turnos incluye ver la agenda.
create or replace function public.limpiar_permisos(p text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x order by x), '{}'::text[]) from (
    select distinct x
      from unnest(coalesce(p, '{}'::text[]) || case when 'turnos' = any (coalesce(p, '{}'::text[])) then array['agenda'] else '{}'::text[] end) as x
     where x in ('agenda', 'turnos', 'finanzas', 'clientes', 'negocio')
  ) s;
$$;

-- El dueño invita a alguien: devuelve el token del link. Si ya había una invitación sin usar para ese email, la reemplaza.
create or replace function public.crear_invitacion(n uuid, correo text, quien text, puede text[]) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(btrim(coalesce(correo, '')));
  t text;
begin
  if not public.es_dueno(n) then
    raise exception 'Solo el dueño del negocio puede sumar personas al equipo' using errcode = '42501';
  end if;
  if e !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Ese email no es válido' using errcode = '22023';
  end if;
  if exists (select 1 from public.miembros m where m.negocio_id = n and m.email = e) then
    raise exception 'Esa persona ya está en el equipo' using errcode = '23505';
  end if;
  delete from public.invitaciones i where i.negocio_id = n and i.email = e and i.usada is null;
  t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.invitaciones (negocio_id, token, email, nombre, permisos)
    values (n, t, e, left(btrim(coalesce(quien, '')), 80), public.limpiar_permisos(puede));
  return t;
end $$;

-- Lo que ve quien abre el link (también sin sesión): de qué negocio es, para qué email y si todavía sirve
create or replace function public.ver_invitacion(t text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'negocio', x.nombre, 'email', i.email, 'nombre', i.nombre, 'permisos', to_jsonb(i.permisos),
    'valida', i.usada is null and i.vence > now() and x.estado = 'aprobado')
  from public.invitaciones i join public.negocios x on x.id = i.negocio_id
  where char_length(coalesce(t, '')) >= 32 and i.token = t;
$$;

-- Suma la cuenta al equipo con los permisos de la invitación (la usan el alta y aceptar_invitacion, no la página)
create or replace function public.unir_por_invitacion(uid uuid, correo text, t text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  i   public.invitaciones%rowtype;
  nom text;
begin
  select * into i from public.invitaciones where token = t for update;
  if not found or i.usada is not null or i.vence <= now() then
    raise exception 'Esa invitación ya se usó o venció' using errcode = 'P0002';
  end if;
  if lower(coalesce(correo, '')) <> i.email then
    raise exception 'Esa invitación es para otro email' using errcode = '42501';
  end if;
  if exists (select 1 from public.miembros where user_id = uid) then
    raise exception 'Esa cuenta ya está en un negocio' using errcode = '23505';
  end if;
  select left(btrim(coalesce(raw_user_meta_data ->> 'nombre', '')), 80) into nom from auth.users where id = uid;
  insert into public.miembros (negocio_id, user_id, rol, permisos, nombre, email)
    values (i.negocio_id, uid, 'encargado', i.permisos, coalesce(nullif(nom, ''), i.nombre), i.email);
  update public.invitaciones set usada = now(), usada_por = uid where id = i.id;
  return i.negocio_id;
end $$;

-- Una cuenta que ya existía (sin negocio) acepta una invitación con su mismo email
create or replace function public.aceptar_invitacion(t text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare correo text;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = '42501'; end if;
  select email into correo from auth.users where id = auth.uid();
  return public.unir_por_invitacion(auth.uid(), correo, t);
end $$;

-- (si existían de una versión anterior que no devolvía nada, se borran para poder cambiarlas)
do $$ begin
  if exists (select 1 from pg_proc where proname = 'anular_invitacion' and prorettype = 'void'::regtype) then drop function public.anular_invitacion(uuid); end if;
  if exists (select 1 from pg_proc where proname = 'quitar_miembro' and prorettype = 'void'::regtype) then drop function public.quitar_miembro(uuid, uuid); end if;
end $$;

-- El dueño anula una invitación que todavía no se usó
create or replace function public.anular_invitacion(i uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n uuid;
begin
  select negocio_id into n from public.invitaciones where id = i;
  if n is null or not public.es_dueno(n) then
    raise exception 'Solo el dueño del negocio puede anular invitaciones' using errcode = '42501';
  end if;
  delete from public.invitaciones where id = i and usada is null;
  return found;
end $$;

-- El dueño cambia qué puede hacer alguien de su equipo
create or replace function public.cambiar_permisos(n uuid, u uuid, puede text[]) returns text[]
language plpgsql security definer set search_path = '' as $$
declare nuevos text[] := public.limpiar_permisos(puede);
begin
  if not public.es_dueno(n) then
    raise exception 'Solo el dueño del negocio puede cambiar permisos' using errcode = '42501';
  end if;
  update public.miembros set permisos = nuevos where negocio_id = n and user_id = u and rol = 'encargado';
  if not found then raise exception 'Esa persona no está en el equipo' using errcode = 'P0002'; end if;
  return nuevos;
end $$;

-- El dueño saca a alguien del equipo (la cuenta sigue existiendo, pero ya no entra a este negocio)
create or replace function public.quitar_miembro(n uuid, u uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_dueno(n) then
    raise exception 'Solo el dueño del negocio puede sacar a alguien del equipo' using errcode = '42501';
  end if;
  delete from public.miembros where negocio_id = n and user_id = u and rol = 'encargado';
  if not found then raise exception 'Esa persona no está en el equipo' using errcode = 'P0002'; end if;
  return true;
end $$;

-- Si alguien cambia su nombre en Cuenta, el dueño lo ve actualizado en Equipo
create or replace function public.sincronizar_nombre() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.miembros set nombre = left(btrim(coalesce(new.raw_user_meta_data ->> 'nombre', '')), 80)
   where user_id = new.id and coalesce(new.raw_user_meta_data ->> 'nombre', '') <> '';
  return new;
end $$;
drop trigger if exists sincronizar_nombre on auth.users;
create trigger sincronizar_nombre after update of raw_user_meta_data on auth.users
  for each row execute function public.sincronizar_nombre();

-- ---------- Alta: al crear la cuenta se crea su negocio y queda atada a él ----------
-- La página de registro manda el nombre de la persona, del negocio y el rubro como datos
-- de la cuenta (raw_user_meta_data). Esto corre dentro de la base, en el mismo paso en que
-- Supabase crea la cuenta: no hay forma de quedar con una cuenta sin negocio, ni de
-- atarse al negocio de otro.
create or replace function public.alta_de_cuenta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nom_neg  text  := left(btrim(coalesce(meta ->> 'negocio', '')), 80);
  base     text;
  s        text;
  k        int   := 1;
  nid      uuid;
begin
  -- Cliente que se registra en la página de reservas (bookea.ar) para pagar la seña: se guardan sus datos y
  -- listo, no tiene negocio. Aceptó las condiciones y la política de privacidad en ese mismo paso.
  if coalesce(meta ->> 'cliente', '') = 'true' then
    insert into public.clientes (id, nombre, email, celular, promos)
      values (new.id,
              coalesce(nullif(left(btrim(coalesce(meta ->> 'nombre', '')), 80), ''), left(split_part(coalesce(new.email, ''), '@', 1), 80), 'Cliente'),
              left(lower(coalesce(new.email, '')), 200),
              left(btrim(coalesce(meta ->> 'celular', '')), 40),
              coalesce(meta ->> 'promos', '') = 'true')
      on conflict (id) do nothing;
    return new;
  end if;
  if nom_neg = '' then
    -- Cuenta sin negocio propio: si vino con el link de una invitación, entra al equipo de ese negocio.
    -- Si la invitación no sirve (vencida, usada u otro email), la cuenta se crea igual y el panel lo explica.
    if coalesce(meta ->> 'invitacion', '') <> '' then
      begin
        perform public.unir_por_invitacion(new.id, new.email, meta ->> 'invitacion');
      exception when others then
        null;
      end;
    end if;
    return new;
  end if;
  -- link de reservas: el nombre del negocio sin tildes ni espacios; si ya existe, se le suma un número
  base := regexp_replace(translate(lower(nom_neg), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '', 'g');
  base := left(base, 24);
  if base = '' then base := 'minegocio'; end if;
  s := base;
  while exists (select 1 from public.negocios where slug = s) loop
    k := k + 1;
    s := left(base, 24) || k::text;
  end loop;
  insert into public.negocios (slug, nombre, rubro, estado, nombre_dueno, email_dueno)
    values (s, nom_neg, left(btrim(coalesce(meta ->> 'rubro', '')), 60), 'pendiente',
            left(btrim(coalesce(meta ->> 'nombre', '')), 80), left(coalesce(new.email, ''), 200))
    returning id into nid;
  insert into public.miembros (negocio_id, user_id, rol, nombre, email)
    values (nid, new.id, 'dueno', left(btrim(coalesce(meta ->> 'nombre', '')), 80), left(lower(coalesce(new.email, '')), 200));
  return new;
end $$;
drop trigger if exists alta_de_cuenta on auth.users;
create trigger alta_de_cuenta after insert on auth.users
  for each row execute function public.alta_de_cuenta();

-- Negocios creados antes de que existiera la aprobación: se completa quién es el dueño
update public.negocios x
   set email_dueno  = left(coalesce(u.email, ''), 200),
       nombre_dueno = left(btrim(coalesce(u.raw_user_meta_data ->> 'nombre', '')), 80)
  from public.miembros m join auth.users u on u.id = m.user_id
 where m.negocio_id = x.id and m.rol = 'dueno' and x.email_dueno = '';

-- ---------- Permisos ----------
alter table public.negocios enable row level security;
alter table public.miembros enable row level security;
alter table public.reservas enable row level security;
alter table public.admins_bookea enable row level security;
alter table public.invitaciones enable row level security;

-- Sin sesión (anon) no se ve nada. Con sesión, solo lo propio (las reglas de abajo).
revoke all on public.negocios, public.miembros, public.reservas, public.admins_bookea, public.invitaciones from anon;
revoke all on public.invitaciones from authenticated;
grant select on public.invitaciones to authenticated;  -- el dueño las ve; se crean y anulan solo con las funciones de arriba
revoke all on public.negocios from authenticated;
grant select on public.negocios to authenticated;
-- Los datos que el dueño puede cambiar. El estado (aprobado o no) NO está: solo cambia con revisar_negocio.
grant update (slug, nombre, rubro, ciudad, direccion, whatsapp, foto, descripcion, mapa, ajustes, pagina) on public.negocios to authenticated;
grant select on public.miembros to authenticated;
grant select, insert, update, delete on public.reservas to authenticated;
grant select on public.admins_bookea to authenticated;
revoke all on function public.es_miembro(uuid) from public, anon;
grant execute on function public.es_miembro(uuid) to authenticated;
revoke all on function public.es_miembro_activo(uuid) from public, anon;
grant execute on function public.es_miembro_activo(uuid) to authenticated;
revoke all on function public.es_admin_bookea() from public, anon;
grant execute on function public.es_admin_bookea() to authenticated;
revoke all on function public.revisar_negocio(uuid, boolean) from public, anon;
grant execute on function public.revisar_negocio(uuid, boolean) to authenticated;
revoke all on function public.alta_de_cuenta() from public, anon, authenticated;
revoke all on function public.sincronizar_nombre() from public, anon, authenticated;
revoke all on function public.unir_por_invitacion(uuid, text, text) from public, anon, authenticated;
revoke all on function public.es_dueno(uuid) from public, anon;
grant execute on function public.es_dueno(uuid) to authenticated;
revoke all on function public.tiene_permiso(uuid, text) from public, anon;
grant execute on function public.tiene_permiso(uuid, text) to authenticated;
revoke all on function public.crear_invitacion(uuid, text, text, text[]) from public, anon;
grant execute on function public.crear_invitacion(uuid, text, text, text[]) to authenticated;
revoke all on function public.ver_invitacion(text) from public;
grant execute on function public.ver_invitacion(text) to anon, authenticated;  -- quien abre el link todavía no tiene cuenta
revoke all on function public.aceptar_invitacion(text) from public, anon;
grant execute on function public.aceptar_invitacion(text) to authenticated;
revoke all on function public.anular_invitacion(uuid) from public, anon;
grant execute on function public.anular_invitacion(uuid) to authenticated;
revoke all on function public.cambiar_permisos(uuid, uuid, text[]) from public, anon;
grant execute on function public.cambiar_permisos(uuid, uuid, text[]) to authenticated;
revoke all on function public.quitar_miembro(uuid, uuid) from public, anon;
grant execute on function public.quitar_miembro(uuid, uuid) to authenticated;

drop policy if exists "negocios: ver los propios" on public.negocios;
create policy "negocios: ver los propios" on public.negocios
  for select to authenticated using (public.es_miembro(id) or public.es_admin_bookea());
drop policy if exists "negocios: cambiar los propios" on public.negocios;
create policy "negocios: cambiar los propios" on public.negocios
  for update to authenticated using (public.tiene_permiso(id, 'negocio')) with check (public.tiene_permiso(id, 'negocio'));

-- Cada uno ve su propia fila; el dueño ve a todo su equipo
drop policy if exists "miembros: ver los de mis negocios" on public.miembros;
create policy "miembros: ver los de mis negocios" on public.miembros
  for select to authenticated using (user_id = auth.uid() or public.es_dueno(negocio_id));

drop policy if exists "invitaciones: el dueño ve las suyas" on public.invitaciones;
create policy "invitaciones: el dueño ve las suyas" on public.invitaciones
  for select to authenticated using (public.es_dueno(negocio_id));

drop policy if exists "reservas: ver las de mis negocios" on public.reservas;
create policy "reservas: ver las de mis negocios" on public.reservas
  for select to authenticated using (public.es_miembro_activo(negocio_id));
-- Ver los turnos: cualquiera del equipo. Cargarlos, cambiarlos o borrarlos: el dueño o quien tenga el permiso "turnos".
drop policy if exists "reservas: cargar en mis negocios" on public.reservas;
create policy "reservas: cargar en mis negocios" on public.reservas
  for insert to authenticated with check (public.tiene_permiso(negocio_id, 'turnos'));
drop policy if exists "reservas: cambiar las de mis negocios" on public.reservas;
create policy "reservas: cambiar las de mis negocios" on public.reservas
  for update to authenticated using (public.tiene_permiso(negocio_id, 'turnos')) with check (public.tiene_permiso(negocio_id, 'turnos'));
drop policy if exists "reservas: borrar las de mis negocios" on public.reservas;
create policy "reservas: borrar las de mis negocios" on public.reservas
  for delete to authenticated using (public.tiene_permiso(negocio_id, 'turnos'));

drop policy if exists "admins: verse a sí mismo" on public.admins_bookea;
create policy "admins: verse a sí mismo" on public.admins_bookea
  for select to authenticated using (user_id = auth.uid());

-- =====================================================================================
-- Clientes: quienes reservan turnos desde la página (bookea.ar)
--
-- Para pagar la seña, el cliente crea su cuenta (nombre, email, celular y contraseña) o entra con la suya.
-- La contraseña la guarda Supabase Auth (solo un hash, igual que las cuentas de los negocios).
--   · clientes → los datos de cada cliente (uno por cuenta). Los carga alta_de_cuenta al registrarse.
--   · turnos   → los turnos que reservó cada cliente: en los lugares de ejemplo de la página (lugar_id es el de
--                sitio.js) o en un negocio de verdad (negocio_id), donde el turno entra también en su agenda
--                (reservas) con el nombre y el celular del cliente. Ver "Negocios en la página", al final.
-- Cada cliente ve solo lo suyo. Reservar, cancelar, corregir sus datos y borrar la cuenta se hace con las
-- funciones de abajo, que controlan todo en la base. Los mails de cada turno salen de avisos-por-mail.sql.
-- =====================================================================================
create table if not exists public.clientes (
  id      uuid primary key references auth.users (id) on delete cascade,
  nombre  text not null check (char_length(nombre) between 1 and 80),
  email   text not null default '' check (char_length(email) <= 200),
  celular text not null default '' check (char_length(celular) <= 40),
  promos  boolean not null default false,          -- quiere recibir promociones (opcional; lo cambia cuando quiere)
  acepto  timestamptz not null default now(),      -- cuándo aceptó las condiciones y la política de privacidad
  creado  timestamptz not null default now()
);

create table if not exists public.turnos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes (id) on delete cascade,
  codigo         text not null default ('BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)))
                   check (codigo ~ '^BK-[A-Z0-9]{4,8}$'),
  lugar_id       text not null check (lugar_id ~ '^[a-z0-9-]{1,40}$'),
  lugar          text not null check (char_length(lugar) between 1 and 80),
  zona           text not null default '' check (char_length(zona) <= 80),
  rubro          text not null default '' check (char_length(rubro) <= 40),
  servicio_id    text not null default '' check (char_length(servicio_id) <= 40),
  servicio       text not null default '' check (char_length(servicio) <= 80),
  cancha         text not null check (char_length(cancha) between 1 and 60),   -- la cancha, o el barbero
  fecha          date not null,
  hora           time not null,
  fin            time not null,
  precio         integer not null check (precio between 0 and 10000000),
  sena           integer not null check (sena >= 0 and sena <= precio),
  cancelar_horas smallint not null default 0 check (cancelar_horas between 0 and 168),  -- hasta cuántas horas antes se devuelve la seña
  estado         text not null default 'confirmado' check (estado in ('confirmado', 'cancelado')),
  creado         timestamptz not null default now(),
  cancelado      timestamptz
);
create index if not exists turnos_por_cliente on public.turnos (cliente_id, fecha);
-- El negocio real del turno (vacío en los lugares de ejemplo). De ahí salen, siempre al día, la dirección,
-- el link de Google Maps y el WhatsApp que el dueño cargó en Mi negocio, para el mail de confirmación.
alter table public.turnos add column if not exists negocio_id uuid references public.negocios (id) on delete set null;
create index if not exists turnos_por_negocio on public.turnos (negocio_id, fecha);
-- En un negocio de verdad: la fila de su agenda (reservas) que ocupa el turno, si la seña se devuelve al cancelar
-- con tiempo (el dueño puede elegir que no), quién lo canceló y si al final la seña se devolvió.
alter table public.turnos
  add column if not exists reserva_id    uuid references public.reservas (id) on delete set null,
  add column if not exists devuelve_sena boolean not null default true,
  add column if not exists cancelado_por text not null default '' check (cancelado_por in ('', 'cliente', 'negocio')),
  add column if not exists devuelta      boolean;
create index if not exists turnos_por_reserva on public.turnos (reserva_id) where reserva_id is not null;
-- Un horario de una cancha no se reserva dos veces: si dos personas pagan el mismo turno a la vez, la base acepta una.
create unique index if not exists turnos_un_cliente_por_horario
  on public.turnos (lugar_id, cancha, fecha, hora) where estado = 'confirmado';

-- La hora de Mendoza (los turnos se guardan en la hora del lugar)
create or replace function public.ahora_mendoza() returns timestamp
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Argentina/Mendoza')
$$;

-- El cliente guarda o corrige sus datos. Sirve también para una cuenta que ya existía (por ejemplo, la de un
-- dueño que reserva en otro lugar): la primera vez queda anotado que aceptó las condiciones.
create or replace function public.guardar_mis_datos(nom text, cel text, promos_si boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  n      text := left(btrim(coalesce(nom, '')), 80);
  c      text := left(btrim(coalesce(cel, '')), 40);
  correo text;
  fila   public.clientes%rowtype;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = '42501'; end if;
  if char_length(n) < 2 then raise exception 'Falta tu nombre' using errcode = '23514'; end if;
  if char_length(regexp_replace(c, '[^0-9]', '', 'g')) < 8 then raise exception 'Falta tu celular' using errcode = '23514'; end if;
  select lower(u.email) into correo from auth.users u where u.id = auth.uid();
  insert into public.clientes as x (id, nombre, email, celular, promos)
    values (auth.uid(), n, left(coalesce(correo, ''), 200), c, coalesce(promos_si, false))
    on conflict (id) do update set nombre = excluded.nombre, celular = excluded.celular, promos = excluded.promos, email = excluded.email
    returning * into fila;
  return to_jsonb(fila);
end $$;

-- Mientras Bookea esté en prueba (la seña todavía no se cobra), la página, la agenda del negocio y los mails lo dicen.
-- Cuando se cobre de verdad (Mercado Pago), cambiá el true por false y volvé a correr este archivo.
create or replace function public.bookea_en_prueba() returns boolean language sql immutable as $$
  select true
$$;

-- "21:30" → 1290 (minutos desde las 00:00), como guarda el panel los horarios
create or replace function public.minutos(hhmm text) returns integer
language sql immutable set search_path = '' as $$
  select case when coalesce(hhmm, '') ~ '^[0-9]{1,2}:[0-9]{2}$'
              then split_part(hhmm, ':', 1)::integer * 60 + split_part(hhmm, ':', 2)::integer end
$$;

-- Lo que sale un turno que empieza en ese minuto, según los precios por horario de Mi negocio (igual que el panel:
-- una franja que pasa la medianoche sigue del otro lado, y fuera de toda franja vale la última)
create or replace function public.precio_en(franjas jsonb, minuto integer) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  m      integer := minuto % 1440;
  f      jsonb;
  d      integer;
  h      integer;
  ultimo integer := 0;
begin
  for f in select value from jsonb_array_elements(case when jsonb_typeof(franjas) = 'array' then franjas else '[]'::jsonb end) loop
    d := coalesce(public.minutos(f ->> 'desde'), 0);
    h := coalesce(public.minutos(f ->> 'hasta'), 0);
    if h <= d then h := h + 1440; end if;
    ultimo := case when coalesce(f ->> 'precio', '') ~ '^[0-9]{1,8}(\.[0-9]+)?$' then round((f ->> 'precio')::numeric)::integer else 0 end;
    if (case when m < d then m + 1440 else m end) >= d and (case when m < d then m + 1440 else m end) < h then return ultimo; end if;
  end loop;
  return ultimo;
end $$;

-- Reservar (después de pagar la seña). El turno queda a nombre de la cuenta que reserva; la base pone el código.
-- En un lugar de ejemplo, "t" trae: lugar_id, lugar, zona, rubro, servicio_id, servicio, cancha, fecha, hora, fin,
-- precio, sena y cancelar_horas.
-- En un negocio de verdad trae negocio_id, recurso (la cancha), fecha_agenda y minuto (como la agenda del panel:
-- un turno de las 00:30 que sigue a la noche del sábado es del sábado, minuto 1470). Todo lo demás (la cancha, el
-- horario, el precio, la seña y la regla para cancelar) sale de lo que el negocio cargó en Mi negocio, no de la página.
-- El turno entra también en su agenda, con el nombre y el celular del cliente.
create or replace function public.reservar_turno(t jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  f        date := (t ->> 'fecha')::date;
  h        time := (t ->> 'hora')::time;
  fin      time := (t ->> 'fin')::time;
  precio   integer := (t ->> 'precio')::integer;
  sena     integer := (t ->> 'sena')::integer;
  horas    integer := coalesce((t ->> 'cancelar_horas')::integer, 0);
  devuelve boolean := true;
  cancha   text := btrim(t ->> 'cancha');
  servicio text := coalesce(t ->> 'servicio', '');
  cod      text := 'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  yo       public.clientes%rowtype;
  neg      public.negocios%rowtype;
  aj       jsonb;
  rec      jsonb;
  dia      jsonb;
  fa       date;
  m        integer;
  dur      integer;
  abre     integer;
  cierra   integer;
  pct      numeric;
  rid      uuid;
  fila     public.turnos%rowtype;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = '42501'; end if;
  select * into yo from public.clientes c where c.id = auth.uid();
  if not found then raise exception 'Faltan tus datos' using errcode = '42501'; end if;
  -- Turno en un negocio de verdad: tiene que estar aprobado, y el turno sale de su Mi negocio
  if nullif(t ->> 'negocio_id', '') is not null then
    select * into neg from public.negocios x where x.id = (t ->> 'negocio_id')::uuid and x.estado = 'aprobado';
    if not found then raise exception 'Ese lugar no está disponible' using errcode = 'P0002'; end if;
    aj  := neg.ajustes;
    fa  := coalesce(nullif(t ->> 'fecha_agenda', ''), t ->> 'fecha')::date;
    m   := case when coalesce(t ->> 'minuto', '') ~ '^[0-9]{1,4}$' then (t ->> 'minuto')::integer end;
    rec := (select r from jsonb_array_elements(case when jsonb_typeof(aj -> 'recursos') = 'array' then aj -> 'recursos' else '[]'::jsonb end) r
             where r ->> 'id' = t ->> 'recurso' limit 1);
    dur := case when coalesce(aj ->> 'duracion', '') ~ '^[0-9]{1,3}$' then (aj ->> 'duracion')::integer end;
    dia := case when jsonb_typeof(aj -> 'horario') = 'array' then aj -> 'horario' -> extract(dow from fa)::integer end;
    abre := public.minutos(dia ->> 'abre');
    cierra := public.minutos(dia ->> 'cierra');
    if cierra <= abre then cierra := cierra + 1440; end if;
    -- la cancha existe, ese día abre, y el turno empieza en uno de sus horarios y termina antes de cerrar
    if rec is null or m is null or coalesce(dur, 0) < 5 or dia is null or dia ->> 'cerrado' = 'true'
       or abre is null or cierra is null or m < abre or m + dur > cierra or (m - abre) % dur <> 0 then
      raise exception 'Ese horario no está disponible' using errcode = 'P0002';
    end if;
    f        := fa + m / 1440;
    h        := make_time((m % 1440) / 60, m % 60, 0);
    fin      := make_time(((m + dur) % 1440) / 60, (m + dur) % 60, 0);
    precio   := public.precio_en(aj -> 'franjas', m);
    pct      := case when coalesce(aj ->> 'senaPct', '') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then least((aj ->> 'senaPct')::numeric, 100) else 0 end;
    sena     := (round(precio * pct / 10000) * 100)::integer;  -- como el panel: redondeada a $ 100
    horas    := case when coalesce(aj ->> 'cancelarHoras', '') ~ '^[0-9]{1,3}$' then least((aj ->> 'cancelarHoras')::integer, 168) else 0 end;
    devuelve := coalesce(aj ->> 'devolverSena', '') <> 'false';
    cancha   := left(btrim(coalesce(rec ->> 'nombre', '')), 40)
                || case when btrim(coalesce(rec ->> 'detalle', '')) <> '' then ' · ' || lower(left(btrim(rec ->> 'detalle'), 17)) else '' end;
    servicio := 'Turno de ' || dur || ' min';
  end if;
  if f + h < public.ahora_mendoza() then raise exception 'Ese horario ya pasó' using errcode = '23514'; end if;
  if f > current_date + 60 then raise exception 'Ese día está muy lejos' using errcode = '23514'; end if;
  -- Para que nadie se quede con todos los horarios: hasta 10 turnos por delante por cuenta
  if (select count(*) from public.turnos x where x.cliente_id = auth.uid() and x.estado = 'confirmado'
        and x.fecha + x.hora >= public.ahora_mendoza()) >= 10 then
    raise exception 'Ya tenés 10 turnos por delante' using errcode = '23514';
  end if;
  -- En la agenda del negocio, como un turno "por el link". Si ese horario ya está ocupado (otro turno, uno cargado
  -- a mano o un bloqueo), la base no deja reservarlo. Mientras Bookea esté en prueba, la seña no se cobró: va en 0.
  if neg.id is not null then
    insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, wa, precio, sena, estado, origen, nota)
      values (neg.id, rec ->> 'id', fa, m, left(yo.nombre, 80), left(yo.celular, 40), precio,
              case when public.bookea_en_prueba() then 0 else sena end, 'confirmada', 'link',
              'Reservó en bookea.ar · código ' || cod
              || case when public.bookea_en_prueba() then ' · Bookea está en prueba: la seña no se cobró.' else '' end)
      returning id into rid;
  end if;
  insert into public.turnos (cliente_id, negocio_id, reserva_id, codigo, lugar_id, lugar, zona, rubro, servicio_id, servicio, cancha,
                             fecha, hora, fin, precio, sena, cancelar_horas, devuelve_sena)
    values (auth.uid(), neg.id, rid, cod, coalesce(neg.slug, t ->> 'lugar_id'), coalesce(neg.nombre, btrim(t ->> 'lugar')),
            coalesce(nullif(neg.ciudad, ''), t ->> 'zona', ''), left(coalesce(case when neg.id is not null then neg.rubro end, t ->> 'rubro', ''), 40),
            case when neg.id is not null then 'turno' else coalesce(t ->> 'servicio_id', '') end, servicio, cancha, f, h, fin,
            precio, sena, horas, devuelve)
    returning * into fila;
  return to_jsonb(fila);
end $$;

-- Cancelar uno de mis turnos (si todavía no empezó). Dice si la seña se devuelve: con más horas de anticipación
-- que las del lugar, sí; si no (o si el lugar no devuelve la seña), queda para el negocio.
-- En un negocio de verdad, el horario se libera también en su agenda.
create or replace function public.cancelar_turno(turno uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  fila     public.turnos%rowtype;
  ahora    timestamp := public.ahora_mendoza();
  devuelve boolean;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = '42501'; end if;
  select * into fila from public.turnos x where x.id = turno and x.cliente_id = auth.uid() for update;
  if not found then raise exception 'No existe ese turno' using errcode = 'P0002'; end if;
  devuelve := fila.devuelve_sena and (fila.fecha + fila.hora) - ahora > make_interval(hours => fila.cancelar_horas);
  if fila.estado = 'confirmado' then
    if fila.fecha + fila.hora < ahora then raise exception 'Ese turno ya pasó' using errcode = '23514'; end if;
    update public.turnos x set estado = 'cancelado', cancelado = now(), cancelado_por = 'cliente', devuelta = devuelve
      where x.id = turno returning * into fila;
    update public.reservas r set estado = 'cancelada', retenida = not devuelve and r.sena > 0
      where r.id = fila.reserva_id and r.estado <> 'cancelada';
  end if;
  return to_jsonb(fila) || jsonb_build_object('devuelve', coalesce(fila.devuelta, devuelve));
end $$;

-- Borrar mi cuenta y mis datos (Ley 25.326: el cliente puede pedir que se borren). Se borran la cuenta, sus datos
-- y sus turnos; los que todavía no pasaron se cancelan antes, así se liberan en la agenda de cada negocio.
-- Una cuenta que también maneja un negocio no se borra desde acá: se pide por mail.
create or replace function public.borrar_mi_cuenta() returns boolean
language plpgsql security definer set search_path = '' as $$
declare x uuid;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = '42501'; end if;
  if exists (select 1 from public.miembros m where m.user_id = auth.uid())
     or exists (select 1 from public.admins_bookea a where a.user_id = auth.uid()) then
    raise exception 'Esta cuenta maneja un negocio' using errcode = '42501';
  end if;
  for x in select t.id from public.turnos t where t.cliente_id = auth.uid() and t.estado = 'confirmado'
             and t.fecha + t.hora >= public.ahora_mendoza() loop
    perform public.cancelar_turno(x);
  end loop;
  delete from auth.users u where u.id = auth.uid();
  return true;
end $$;

alter table public.clientes enable row level security;
alter table public.turnos enable row level security;
-- Sin sesión no se ve nada. Con sesión, cada cliente ve solo lo suyo y lo cambia solo con las funciones de arriba.
revoke all on public.clientes, public.turnos from anon, authenticated;
grant select on public.clientes, public.turnos to authenticated;
drop policy if exists "clientes: ver los propios" on public.clientes;
create policy "clientes: ver los propios" on public.clientes
  for select to authenticated using (id = auth.uid());
drop policy if exists "turnos: ver los propios" on public.turnos;
create policy "turnos: ver los propios" on public.turnos
  for select to authenticated using (cliente_id = auth.uid());
revoke all on function public.ahora_mendoza() from public, anon, authenticated;
revoke all on function public.bookea_en_prueba() from public, anon, authenticated;
revoke all on function public.minutos(text) from public, anon, authenticated;
revoke all on function public.precio_en(jsonb, integer) from public, anon, authenticated;
revoke all on function public.guardar_mis_datos(text, text, boolean) from public, anon;
grant execute on function public.guardar_mis_datos(text, text, boolean) to authenticated;
revoke all on function public.reservar_turno(jsonb) from public, anon;
grant execute on function public.reservar_turno(jsonb) to authenticated;
revoke all on function public.cancelar_turno(uuid) from public, anon;
grant execute on function public.cancelar_turno(uuid) to authenticated;
revoke all on function public.borrar_mi_cuenta() from public, anon;
grant execute on function public.borrar_mi_cuenta() to authenticated;

-- =====================================================================================
-- Negocios en la página (bookea.ar)
--
-- La página muestra cada negocio aprobado con lo que cargó en Mi negocio: nombre, rubro, ciudad, dirección, foto,
-- descripción, canchas, duración del turno, horarios, precios, seña y cancelación. Y los horarios ocupados de su
-- agenda, sin decir de quién son. Nada más: ni el email del dueño, ni su WhatsApp, ni sus clientes.
--
-- Cuáles aparecen:
--   · En la lista de la página (inicio y resultados): los aprobados que ya pueden cobrar la seña con Mercado Pago.
--     Hasta que esté Mercado Pago, ninguno (tiene_mercado_pago dice que no).
--   · Con su link (bookea.ar/su-link): cualquiera aprobado que ya tenga canchas y horarios, para que el dueño se vea
--     y lo pruebe.
-- Los turnos: reservar_turno los pone también en la agenda del negocio (reservas). Si el cliente cancela, el horario
-- se libera en la agenda; si el negocio cancela desde el panel, se cancela también el del cliente y le llega el mail.
-- =====================================================================================

-- ¿Ya puede cobrar la seña con Mercado Pago? Es el paso que sigue: hasta entonces, ninguno.
create or replace function public.tiene_mercado_pago(n uuid) returns boolean
language sql stable set search_path = '' as $$
  select false
$$;

-- ¿Tiene lo mínimo para tomar turnos? Al menos una cancha, la duración del turno y los horarios de los 7 días.
create or replace function public.lugar_listo(aj jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(aj -> 'recursos') = 'array' and jsonb_typeof(aj -> 'horario') = 'array'
                   and coalesce(aj ->> 'duracion', '') ~ '^[0-9]{1,3}$'
              then jsonb_array_length(aj -> 'recursos') > 0 and jsonb_array_length(aj -> 'horario') = 7
                   and (aj ->> 'duracion')::integer >= 5
              else false end
$$;

-- Los horarios ocupados de su agenda (turnos, también los cargados a mano, y bloqueos), de ayer a 8 días:
-- [cancha, fecha de la agenda, minuto]. Sin nombres.
create or replace function public.ocupados_de(n uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(r.recurso, r.fecha, r.hora) order by r.fecha, r.hora, r.recurso), '[]'::jsonb)
  from public.reservas r
  where r.negocio_id = n and r.estado <> 'cancelada'
    and r.fecha between public.ahora_mendoza()::date - 1 and public.ahora_mendoza()::date + 8
$$;

-- Una foto de su página: solo si está en su carpeta de Storage (negocios/<id>/...); cualquier otra dirección no se muestra
create or replace function public.foto_publica(n uuid, u text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(u, '') ~* ('^https?://[^/]+/storage/v1/object/public/negocios/' || n::text || '/[a-z0-9._-]+$') then u end
$$;
-- Un usuario de Instagram, TikTok o Facebook: aunque peguen el link entero, queda solo el usuario ("losalamospadel")
create or replace function public.red_social(t text) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(split_part(split_part(
           regexp_replace(btrim(coalesce(t, '')), '^(https?://)?(www\.|m\.)?(instagram\.com|tiktok\.com|facebook\.com|fb\.com)/', '', 'i'),
           '/', 1), '?', 1), '[^A-Za-z0-9._-]', '', 'g'), 60)
$$;

-- Lo que la página muestra de un negocio (los ajustes, armados de nuevo campo por campo: solo lo que hace falta)
create or replace function public.lugar_publico(x public.negocios) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', x.id, 'slug', x.slug, 'nombre', x.nombre, 'rubro', x.rubro, 'ciudad', x.ciudad, 'direccion', x.direccion,
    'mapa', x.mapa, 'foto', x.foto, 'descripcion', x.descripcion,
    'recursos', (select coalesce(jsonb_agg(jsonb_build_object('id', r ->> 'id', 'nombre', coalesce(r ->> 'nombre', ''),
                                                              'detalle', coalesce(r ->> 'detalle', '')) order by i), '[]'::jsonb)
                   from jsonb_array_elements(x.ajustes -> 'recursos') with ordinality as e(r, i)),
    'duracion', (x.ajustes ->> 'duracion')::integer,
    'horario', (select jsonb_agg(jsonb_build_object('abre', coalesce(d ->> 'abre', ''), 'cierra', coalesce(d ->> 'cierra', ''),
                                                    'cerrado', d ->> 'cerrado' = 'true') order by i)
                  from jsonb_array_elements(x.ajustes -> 'horario') with ordinality as e(d, i)),
    'franjas', (select coalesce(jsonb_agg(jsonb_build_object('desde', coalesce(f ->> 'desde', ''), 'hasta', coalesce(f ->> 'hasta', ''),
                                                             'precio', public.precio_en(jsonb_build_array(f), public.minutos(f ->> 'desde'))) order by i), '[]'::jsonb)
                  from jsonb_array_elements(case when jsonb_typeof(x.ajustes -> 'franjas') = 'array' then x.ajustes -> 'franjas' else '[]'::jsonb end)
                       with ordinality as e(f, i)),
    'senaPct', case when coalesce(x.ajustes ->> 'senaPct', '') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then least((x.ajustes ->> 'senaPct')::numeric, 100) else 0 end,
    'cancelarHoras', case when coalesce(x.ajustes ->> 'cancelarHoras', '') ~ '^[0-9]{1,3}$' then least((x.ajustes ->> 'cancelarHoras')::integer, 168) else 0 end,
    'devolverSena', coalesce(x.ajustes ->> 'devolverSena', '') <> 'false',
    -- su página: el WhatsApp, solo si eligió mostrarlo
    'pagina', jsonb_build_object(
      'frase', left(btrim(coalesce(x.pagina ->> 'frase', '')), 160),
      'historia', left(btrim(coalesce(x.pagina ->> 'historia', '')), 3000),
      'logo', public.foto_publica(x.id, x.pagina ->> 'logo'),
      'portada', public.foto_publica(x.id, x.pagina ->> 'portada'),
      'galeria', (select coalesce(jsonb_agg(u order by i), '[]'::jsonb) from (
                    select public.foto_publica(x.id, g) as u, i
                      from jsonb_array_elements_text(case when jsonb_typeof(x.pagina -> 'galeria') = 'array' then x.pagina -> 'galeria' else '[]'::jsonb end)
                           with ordinality as e(g, i)) s
                   where u is not null and i <= 8),
      'instagram', public.red_social(x.pagina ->> 'instagram'),
      'tiktok', public.red_social(x.pagina ->> 'tiktok'),
      'facebook', public.red_social(x.pagina ->> 'facebook'),
      -- sus servicios (estacionamiento, vestuarios…): solo claves cortas; la página muestra las que conoce
      'servicios', (select coalesce(jsonb_agg(s order by i), '[]'::jsonb)
                      from jsonb_array_elements_text(case when jsonb_typeof(x.pagina -> 'servicios') = 'array' then x.pagina -> 'servicios' else '[]'::jsonb end)
                           with ordinality as e(s, i)
                     where s ~ '^[a-z]{2,10}$' and i <= 30),
      'whatsapp', case when x.pagina ->> 'mostrar_whatsapp' = 'true' then x.whatsapp else '' end),
    'publicado', public.tiene_mercado_pago(x.id),
    'ocupados', public.ocupados_de(x.id))
$$;

-- Para la página (también sin cuenta): los negocios de la lista y, si se pide, el de un link (bookea.ar/su-link)
create or replace function public.lugares_publicos(incluir text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.lugar_publico(x) order by x.nombre), '[]'::jsonb)
  from public.negocios x
  where x.estado = 'aprobado' and public.lugar_listo(x.ajustes)
    and (public.tiene_mercado_pago(x.id) or x.slug = lower(btrim(coalesce(incluir, ''))))
$$;

-- Los horarios ocupados de un negocio, al momento (la página los vuelve a pedir al abrir su ficha)
create or replace function public.horarios_ocupados(lugar text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.ocupados_de(x.id) from public.negocios x
                    where x.slug = lower(btrim(coalesce(lugar, ''))) and x.estado = 'aprobado'), '[]'::jsonb)
$$;

-- La agenda del negocio y los turnos de bookea.ar, siempre de acuerdo:
--   · Si el negocio borra la fila de un turno de bookea.ar, el turno del cliente se cancela (y la seña se devuelve).
--   · Un turno que el cliente ya canceló no vuelve a la agenda (por ejemplo, desde un panel abierto desde antes).
create or replace function public.reserva_web_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.turnos t set estado = 'cancelado', cancelado = now(), cancelado_por = 'negocio', devuelta = true
     where t.reserva_id = old.id and t.estado = 'confirmado';
    return old;
  end if;
  if old.estado = 'cancelada' and new.estado <> 'cancelada'
     and exists (select 1 from public.turnos t where t.reserva_id = old.id and t.estado = 'cancelado') then
    new.estado := 'cancelada';
    new.retenida := old.retenida;
  end if;
  return new;
end $$;
drop trigger if exists reserva_web_antes on public.reservas;
create trigger reserva_web_antes before update or delete on public.reservas
  for each row execute function public.reserva_web_antes();

--   · Si el negocio cancela en el panel un turno de bookea.ar, se cancela también el del cliente (le llega el mail).
--     Si el negocio retuvo la seña, no se devuelve; si no, sí.
create or replace function public.reserva_web_cancelada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.turnos t set estado = 'cancelado', cancelado = now(), cancelado_por = 'negocio', devuelta = not new.retenida
   where t.reserva_id = new.id and t.estado = 'confirmado';
  return new;
end $$;
drop trigger if exists reserva_web_cancelada on public.reservas;
create trigger reserva_web_cancelada after update of estado on public.reservas
  for each row when (new.estado = 'cancelada' and old.estado <> 'cancelada')
  execute function public.reserva_web_cancelada();

-- ---------- Las fotos de la página (Supabase Storage) ----------
-- Un bucket público, "negocios": cada negocio sube sus fotos a su carpeta (negocios/<id del negocio>/...) y solo puede
-- quien cambia Mi negocio (el dueño, o quien tenga el permiso "negocio") y el equipo de Bookea, que arma la página de
-- cada negocio (pedido del dueño, 25/11: "lo voy a cargar yo"). Las ve cualquiera: son las de su página.
create or replace function public.puede_subir_foto(objeto text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when split_part(coalesce(objeto, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.tiene_permiso(split_part(objeto, '/', 1)::uuid, 'negocio') or public.es_admin_bookea() else false end
$$;
revoke all on function public.puede_subir_foto(text) from public, anon;
grant execute on function public.puede_subir_foto(text) to authenticated;

-- La página de un negocio, guardada por el equipo de Bookea (desde Solicitudes → "Editar su página") o por quien cambia
-- su Mi negocio. Cambia solo la página (fotos, frase, historia, servicios, redes): nada más del negocio.
create or replace function public.guardar_pagina(n uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (public.es_admin_bookea() or public.tiene_permiso(n, 'negocio')) then
    raise exception 'sin permiso para cambiar la página de este negocio' using errcode = '42501';
  end if;
  update public.negocios set pagina = coalesce(p, '{}'::jsonb) where id = n;
  if not found then raise exception 'no existe ese negocio' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.guardar_pagina(uuid, jsonb) from public, anon;
grant execute on function public.guardar_pagina(uuid, jsonb) to authenticated;
do $$ begin
  if to_regclass('storage.objects') is not null then  -- en Supabase siempre está; en una base de prueba, solo si se simula
    insert into storage.buckets (id, name, public) values ('negocios', 'negocios', true)
      on conflict (id) do update set public = true;
    execute 'drop policy if exists "fotos: el negocio ve las suyas" on storage.objects';
    execute 'create policy "fotos: el negocio ve las suyas" on storage.objects for select to authenticated using (bucket_id = ''negocios'' and public.puede_subir_foto(name))';
    execute 'drop policy if exists "fotos: el negocio sube las suyas" on storage.objects';
    execute 'create policy "fotos: el negocio sube las suyas" on storage.objects for insert to authenticated with check (bucket_id = ''negocios'' and public.puede_subir_foto(name))';
    execute 'drop policy if exists "fotos: el negocio cambia las suyas" on storage.objects';
    execute 'create policy "fotos: el negocio cambia las suyas" on storage.objects for update to authenticated using (bucket_id = ''negocios'' and public.puede_subir_foto(name)) with check (bucket_id = ''negocios'' and public.puede_subir_foto(name))';
    execute 'drop policy if exists "fotos: el negocio borra las suyas" on storage.objects';
    execute 'create policy "fotos: el negocio borra las suyas" on storage.objects for delete to authenticated using (bucket_id = ''negocios'' and public.puede_subir_foto(name))';
  end if;
end $$;

revoke all on function public.tiene_mercado_pago(uuid) from public, anon, authenticated;
revoke all on function public.foto_publica(uuid, text) from public, anon, authenticated;
revoke all on function public.red_social(text) from public, anon, authenticated;
revoke all on function public.lugar_listo(jsonb) from public, anon, authenticated;
revoke all on function public.ocupados_de(uuid) from public, anon, authenticated;
revoke all on function public.lugar_publico(public.negocios) from public, anon, authenticated;
revoke all on function public.reserva_web_antes() from public, anon, authenticated;
revoke all on function public.reserva_web_cancelada() from public, anon, authenticated;
revoke all on function public.lugares_publicos(text) from public;
grant execute on function public.lugares_publicos(text) to anon, authenticated;  -- la página, con o sin cuenta
revoke all on function public.horarios_ocupados(text) from public;
grant execute on function public.horarios_ocupados(text) to anon, authenticated;
