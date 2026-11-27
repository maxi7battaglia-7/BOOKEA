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
-- La página (bookea.ar/nombre) no: la arma solo el equipo de Bookea con guardar_pagina (pedido del dueño, 25/11).
grant update (slug, nombre, rubro, ciudad, direccion, whatsapp, foto, descripcion, mapa, ajustes) on public.negocios to authenticated;
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
-- Con Mercado Pago (26/11): en un negocio que cobra la seña, el turno queda "pendiente" hasta que el pago se acredita.
--   · vence    → hasta cuándo se le guarda el horario para pagar (si nadie paga, se libera solo: vencer_pendientes).
--   · pago     → cómo va el cobro de la seña: '' (no se cobra: lugar de ejemplo o negocio sin Mercado Pago),
--                'pendiente', 'aprobado' (se acreditó) o 'devuelto' (se devolvió por Mercado Pago).
--   · pagado   → cuándo se acreditó.   · comision → la parte de Bookea (sale de la seña; no se muestra en la página).
-- "sin_pago" en cancelado_por: el horario se liberó porque nadie pagó la seña a tiempo.
alter table public.turnos
  add column if not exists pago     text not null default '' check (pago in ('', 'pendiente', 'aprobado', 'devuelto')),
  add column if not exists pagado   timestamptz,
  add column if not exists vence    timestamptz,
  add column if not exists comision integer not null default 0 check (comision >= 0);
alter table public.turnos drop constraint if exists turnos_estado_check;
alter table public.turnos add constraint turnos_estado_check check (estado in ('pendiente', 'confirmado', 'cancelado'));
alter table public.turnos drop constraint if exists turnos_cancelado_por_check;
alter table public.turnos add constraint turnos_cancelado_por_check check (cancelado_por in ('', 'cliente', 'negocio', 'sin_pago'));
create index if not exists turnos_pendientes on public.turnos (vence) where estado = 'pendiente';
-- Un horario de una cancha no se reserva dos veces: si dos personas pagan el mismo turno a la vez, la base acepta una.
-- El que está esperando el pago también lo ocupa (hasta que vence).
create unique index if not exists turnos_un_horario_activo
  on public.turnos (lugar_id, cancha, fecha, hora) where estado in ('pendiente', 'confirmado');
drop index if exists public.turnos_un_cliente_por_horario;  -- el de antes (solo los confirmados)

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

-- Los lugares de ejemplo de la página no cobran nada: los mails lo dicen ("Bookea está en prueba"). Los negocios de verdad
-- que todavía no conectaron Mercado Pago toman los turnos sin seña (pedido del dueño, 27/11: "si no conectan con Mercado
-- Pago deben aparecer de igual forma"); los que lo conectaron cobran la seña de verdad (ver "Mercado Pago", abajo).
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
-- Si el negocio cobra la seña con Mercado Pago (tiene_mercado_pago), el turno queda "pendiente" y guardado 20 minutos
-- mientras el cliente paga (la función "mp" arma el cobro); al acreditarse el pago queda confirmado (mp_resultado).
-- Si no pide seña (0 %) o no conectó Mercado Pago, el turno va sin seña y queda confirmado enseguida.
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
  cobra    boolean := false;
  limite   timestamptz := now() + interval '20 minutes';
  fila     public.turnos%rowtype;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión' using errcode = '42501'; end if;
  select * into yo from public.clientes c where c.id = auth.uid();
  if not found then raise exception 'Faltan tus datos' using errcode = '42501'; end if;
  perform public.vencer_pendientes();  -- los turnos que nadie pagó a tiempo liberan su horario
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
    cobra    := sena > 0 and public.tiene_mercado_pago(neg.id);
    if not cobra then sena := 0; end if;  -- sin Mercado Pago no hay cómo cobrarla: el turno va sin seña
  end if;
  if f + h < public.ahora_mendoza() then raise exception 'Ese horario ya pasó' using errcode = '23514'; end if;
  if f > current_date + 60 then raise exception 'Ese día está muy lejos' using errcode = '23514'; end if;
  -- Para que nadie se quede con todos los horarios: hasta 10 turnos por delante por cuenta (también los que esperan el pago)
  if (select count(*) from public.turnos x where x.cliente_id = auth.uid() and x.estado in ('pendiente', 'confirmado')
        and x.fecha + x.hora >= public.ahora_mendoza()) >= 10 then
    raise exception 'Ya tenés 10 turnos por delante' using errcode = '23514';
  end if;
  -- En la agenda del negocio, como un turno "por el link". Si ese horario ya está ocupado (otro turno, uno cargado
  -- a mano o un bloqueo), la base no deja reservarlo. La seña va en 0 hasta que se acredita el pago (mp_resultado la
  -- pone); si no se cobra (sin seña o sin Mercado Pago), va sin seña y sin nota.
  if neg.id is not null then
    insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, wa, precio, sena, estado, origen, nota)
      values (neg.id, rec ->> 'id', fa, m, left(yo.nombre, 80), left(yo.celular, 40), precio, 0, 'confirmada', 'link',
              'Reservó en bookea.ar · código ' || cod
              || case when cobra then ' · Esperando que pague la seña de $ ' || sena || ' con Mercado Pago (hasta las '
                                      || to_char(limite at time zone 'America/Argentina/Mendoza', 'HH24:MI') || '; si no paga, el horario se libera solo).'
                      else '' end)
      returning id into rid;
  end if;
  insert into public.turnos (cliente_id, negocio_id, reserva_id, codigo, lugar_id, lugar, zona, rubro, servicio_id, servicio, cancha,
                             fecha, hora, fin, precio, sena, cancelar_horas, devuelve_sena, estado, pago, vence, comision)
    values (auth.uid(), neg.id, rid, cod, coalesce(neg.slug, t ->> 'lugar_id'), coalesce(neg.nombre, btrim(t ->> 'lugar')),
            coalesce(nullif(neg.ciudad, ''), t ->> 'zona', ''), left(coalesce(case when neg.id is not null then neg.rubro end, t ->> 'rubro', ''), 40),
            case when neg.id is not null then 'turno' else coalesce(t ->> 'servicio_id', '') end, servicio, cancha, f, h, fin,
            precio, sena, horas, devuelve,
            case when cobra then 'pendiente' else 'confirmado' end, case when cobra then 'pendiente' else '' end,
            case when cobra then limite end, case when cobra then public.comision_de(sena) else 0 end)
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
  elsif fila.estado = 'pendiente' then
    -- Todavía no pagó la seña: el horario se libera y sale de la agenda del negocio (no había nada que devolver).
    -- Si el pago se acredita igual después, la seña se devuelve sola (mp_resultado).
    update public.turnos x set estado = 'cancelado', cancelado = now(), cancelado_por = 'cliente', devuelta = false
      where x.id = turno returning * into fila;
    delete from public.reservas r where r.id = fila.reserva_id;
    return to_jsonb(fila) || jsonb_build_object('devuelve', false);
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
  for x in select t.id from public.turnos t where t.cliente_id = auth.uid() and t.estado in ('pendiente', 'confirmado')
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
-- Mercado Pago: cada negocio cobra la seña con su propia cuenta (pedido del dueño, 26/11)
--
--   1. El dueño conecta su cuenta desde el panel (Mi negocio → Mercado Pago). Mercado Pago le pide permiso y vuelve a
--      la función "mp" (supabase/functions/mp), que guarda las llaves de su cuenta en Vault, cifradas: ni la página ni
--      el panel las ven nunca. (OAuth con PKCE: mp_empezar_conexion, mp_tomar_estado, mp_guardar_cuenta.)
--   2. Un cliente reserva en un negocio conectado: el turno queda "pendiente" 20 minutos (también en la agenda del
--      negocio) y la función arma el cobro de la seña con la cuenta del negocio y la comisión de Bookea (mp_cobros).
--   3. Mercado Pago avisa que hubo un pago (aviso firmado). La función se lo pregunta a Mercado Pago (nunca le cree al
--      navegador) y, si se acreditó, el turno queda confirmado (mp_resultado): llegan los mails y la seña aparece en la
--      agenda. Si nadie paga a tiempo, el horario se libera solo (vencer_pendientes).
--   4. Si se cancela un turno pagado y la seña se devuelve, queda en la cola (mp_cobros.devolucion) y la función la
--      devuelve por Mercado Pago (también si alguien pagó un turno que ya no estaba esperando el pago).
-- La plata va directo a la cuenta del negocio: Mercado Pago le descuenta su costo y la comisión de Bookea, que llega a
-- la cuenta de Bookea. Todo esto lo usa solo la función, con la clave secreta (service_role); el panel usa solo
-- mi_mercado_pago, mp_desconectar y vencer_pendientes. La guía para ponerlo en marcha está en supabase/LEEME.md.
-- =====================================================================================

-- La comisión de Bookea: qué parte de cada seña cobrada se queda Bookea (en %). Para cambiarla, cambiá el número y
-- volvé a correr este archivo (vale para los cobros que se armen desde ese momento). No se muestra en la página.
-- 1 % de la seña (pedido del dueño, 27/11: "tendría que ser muy bajo, un 1 o 0,5"): en una seña de $ 12.500, $ 125.
create or replace function public.bookea_comision_pct() returns numeric language sql immutable as $$
  select 1::numeric
$$;
-- La comisión de una seña, en pesos: redondeada, hasta la mitad de la seña y nunca la seña entera
create or replace function public.comision_de(sena integer) returns integer
language sql immutable set search_path = '' as $$
  select greatest(0, least(coalesce(sena, 0) - 1,
           round(coalesce(sena, 0) * least(greatest(public.bookea_comision_pct(), 0), 50) / 100)::integer))
$$;
-- Adónde la base le avisa a la función que hay señas para devolver (la dirección del proyecto de Supabase es pública)
create or replace function public.bookea_url_funciones() returns text language sql immutable as $$
  select 'https://vpxzuutavdjwglglbvdt.supabase.co/functions/v1'
$$;

-- La cuenta de Mercado Pago de cada negocio. Las llaves (access token y refresh token) están en Vault, cifradas: acá
-- van solo sus ids. El access token dura 180 días; la función lo renueva antes de que venza.
create table if not exists public.mp_cuentas (
  negocio_id  uuid primary key references public.negocios (id) on delete cascade,
  mp_usuario  text not null check (mp_usuario ~ '^[0-9]{1,20}$'),       -- el número de cuenta de Mercado Pago
  llave_id    uuid,                                                     -- Vault: access token
  renovar_id  uuid,                                                     -- Vault: refresh token
  vence       timestamptz not null,                                     -- cuándo vence el access token
  real        boolean not null default true,                            -- false: una cuenta de prueba de Mercado Pago
  reconectar  boolean not null default false,                           -- no se pudo renovar: hay que conectarla de nuevo
  quien       uuid references auth.users (id) on delete set null,       -- quién la conectó
  conectado   timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
-- Los pedidos de conexión en curso: cada uno sirve una sola vez y por 15 minutos. "estado" viaja a Mercado Pago y vuelve
-- (así nadie puede colarle otra cuenta al negocio); "verificador" es el de PKCE y no sale nunca de la base y la función.
create table if not exists public.mp_estados (
  estado      text primary key check (estado ~ '^[0-9a-f]{64}$'),
  negocio_id  uuid not null references public.negocios (id) on delete cascade,
  quien       uuid not null references auth.users (id) on delete cascade,
  verificador text not null check (verificador ~ '^[0-9a-f]{64}$'),
  creado      timestamptz not null default now()
);
-- Cada cobro de una seña (una "orden" de Mercado Pago). Un turno puede tener más de uno (si volvió a intentar).
-- Queda aunque se borre el turno o el negocio: es el registro de la plata.
create table if not exists public.mp_cobros (
  orden       text primary key check (orden ~ '^[A-Za-z0-9_-]{1,64}$'),
  turno_id    uuid references public.turnos (id) on delete set null,
  negocio_id  uuid references public.negocios (id) on delete set null,
  monto       integer not null check (monto > 0),
  comision    integer not null default 0 check (comision >= 0),
  url         text not null default '' check (char_length(url) <= 500),   -- adónde va el cliente a pagar
  estado      text not null default 'creado' check (estado in ('creado', 'aprobado', 'rechazado', 'devuelto')),
  devolucion  text not null default '' check (devolucion in ('', 'pendiente', 'hecha', 'fallo')),
  intentos    smallint not null default 0,                                -- veces que se intentó devolver
  detalle     text not null default '' check (char_length(detalle) <= 200),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists mp_cobros_por_turno on public.mp_cobros (turno_id);
create index if not exists mp_cobros_por_negocio on public.mp_cobros (negocio_id);
create index if not exists mp_cobros_a_devolver on public.mp_cobros (actualizado) where devolucion = 'pendiente';
alter table public.mp_cuentas enable row level security;
alter table public.mp_estados enable row level security;
alter table public.mp_cobros enable row level security;
-- Sin políticas: desde la página y el panel no se leen ni se tocan (solo con las funciones de abajo)
revoke all on public.mp_cuentas, public.mp_estados, public.mp_cobros from anon, authenticated;

-- ¿Ya cobra la seña con Mercado Pago? Conectó su cuenta y la conexión sigue andando.
create or replace function public.tiene_mercado_pago(n uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.mp_cuentas c where c.negocio_id = n and not c.reconectar)
$$;
-- ¿Pide seña? El % de seña de su Mi negocio es más que 0. Sin seña (pregunta del dueño, 27/11: "un negocio que no
-- quiere cobrar seña"), el turno queda confirmado al reservar, sin pasar por Mercado Pago (reservar_turno).
create or replace function public.pide_sena(n uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select case when coalesce(x.ajustes ->> 'senaPct', '') ~ '^[0-9]{1,3}(\.[0-9]+)?$'
                               then (x.ajustes ->> 'senaPct')::numeric > 0 else false end
                     from public.negocios x where x.id = n), false)
$$;
-- ¿Aparece en la lista de la página? Con Mercado Pago o sin él (pedido del dueño, 27/11: "si no conectan con Mercado
-- Pago deben aparecer de igual forma"; sin Mercado Pago toma los turnos sin seña), si cargó en Mi negocio la ciudad y
-- el teléfono (WhatsApp, "sí o sí": al menos 8 números) y si el dueño no es del equipo de Bookea (sus cuentas son para
-- administrar o probar). Tampoco el que cobra la seña con una cuenta de prueba de Mercado Pago. Todos se abren igual
-- con su link (bookea.ar/su-link).
create or replace function public.lista_faltan(n uuid) returns text[]
language sql stable set search_path = '' as $$
  select array_remove(array[
    case when btrim(coalesce(x.ciudad, '')) = '' then 'ciudad' end,
    case when char_length(regexp_replace(coalesce(x.whatsapp, ''), '[^0-9]', '', 'g')) < 8 then 'telefono' end,
    case when exists (select 1 from public.miembros m join public.admins_bookea a on a.user_id = m.user_id
                      where m.negocio_id = x.id and m.rol = 'dueno') then 'equipo' end,
    case when public.pide_sena(x.id)
              and exists (select 1 from public.mp_cuentas c where c.negocio_id = x.id and not c.reconectar and not c.real)
         then 'prueba' end], null)
  from public.negocios x where x.id = n
$$;
create or replace function public.en_la_lista(n uuid) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(cardinality(public.lista_faltan(n)) = 0, false)
$$;

-- Los turnos que nadie pagó a tiempo: se cancelan y salen de la agenda del negocio (el horario queda libre).
-- Corre al reservar, cada minuto si está pg_cron (abajo) y cuando el panel abre la agenda.
create or replace function public.vencer_pendientes() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  x record;
  n integer := 0;
begin
  for x in select t.id, t.reserva_id from public.turnos t where t.estado = 'pendiente' and t.vence < now()
             for update skip locked loop
    update public.turnos t set estado = 'cancelado', cancelado = now(), cancelado_por = 'sin_pago', devuelta = false where t.id = x.id;
    delete from public.reservas r where r.id = x.reserva_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Conectar la cuenta (OAuth con PKCE) ----------
-- 1. El dueño toca "Conectar Mercado Pago": la función (que ya comprobó quién es) pide un pedido de conexión.
create or replace function public.mp_empezar_conexion(n uuid, quien uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e text := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
  v text := encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
begin
  if not exists (select 1 from public.miembros m join public.negocios x on x.id = m.negocio_id
                  where m.negocio_id = n and m.user_id = quien and m.rol = 'dueno' and x.estado = 'aprobado') then
    raise exception 'Solo el dueño puede conectar Mercado Pago' using errcode = '42501';
  end if;
  delete from public.mp_estados x where x.creado < now() - interval '1 day' or x.negocio_id = n;
  insert into public.mp_estados (estado, negocio_id, quien, verificador) values (e, n, quien, v);
  -- el desafío PKCE (S256): base64url del sha256 del verificador
  return jsonb_build_object('estado', e, 'desafio', translate(rtrim(encode(sha256(convert_to(v, 'UTF8')), 'base64'), '='), '+/', '-_'));
end $$;
-- 2. Mercado Pago vuelve con el código y el estado: la función toma el pedido (una sola vez, dentro de los 15 minutos)
create or replace function public.mp_tomar_estado(e text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare x public.mp_estados%rowtype;
begin
  delete from public.mp_estados s where s.estado = e returning * into x;
  if not found or x.creado < now() - interval '15 minutes' then return null; end if;
  return jsonb_build_object('negocio', x.negocio_id, 'quien', x.quien, 'verificador', x.verificador);
end $$;
-- 3. Con las llaves que dio Mercado Pago (al conectar o al renovarlas): se guardan en Vault y el negocio queda conectado.
--    "d" es la respuesta de Mercado Pago: access_token, refresh_token, user_id, expires_in y live_mode.
--    "quien" va vacío cuando la función solo las renueva.
create or replace function public.mp_guardar_cuenta(n uuid, quien uuid, d jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c   public.mp_cuentas%rowtype;
  acc text := d ->> 'access_token';
  ren text := d ->> 'refresh_token';
  usu text := d ->> 'user_id';
  seg integer := case when coalesce(d ->> 'expires_in', '') ~ '^[0-9]{1,9}$' then (d ->> 'expires_in')::integer else 15552000 end;
  la  uuid;
  lr  uuid;
begin
  if coalesce(acc, '') !~ '^[A-Za-z0-9_-]+$' or char_length(acc) not between 20 and 400
     or coalesce(ren, '') !~ '^[A-Za-z0-9_-]+$' or char_length(ren) not between 10 and 400 or coalesce(usu, '') !~ '^[0-9]{1,20}$' then
    raise exception 'Mercado Pago no devolvió una cuenta válida' using errcode = '22023';
  end if;
  if not exists (select 1 from public.negocios x where x.id = n) then raise exception 'No existe ese negocio' using errcode = 'P0002'; end if;
  select * into c from public.mp_cuentas x where x.negocio_id = n for update;
  if found and c.llave_id is not null and c.renovar_id is not null then
    perform vault.update_secret(c.llave_id, acc);
    perform vault.update_secret(c.renovar_id, ren);
    update public.mp_cuentas x set mp_usuario = usu, vence = now() + make_interval(secs => seg),
           real = coalesce(d ->> 'live_mode', 'true') <> 'false', reconectar = false, actualizado = now(),
           quien = coalesce(mp_guardar_cuenta.quien, x.quien),
           conectado = case when mp_guardar_cuenta.quien is not null then now() else x.conectado end
     where x.negocio_id = n;
  else
    delete from vault.secrets s where s.name in ('mercadopago_llave_' || n, 'mercadopago_renovar_' || n);
    la := vault.create_secret(acc, 'mercadopago_llave_' || n);
    lr := vault.create_secret(ren, 'mercadopago_renovar_' || n);
    insert into public.mp_cuentas as x (negocio_id, mp_usuario, llave_id, renovar_id, vence, real, quien)
      values (n, usu, la, lr, now() + make_interval(secs => seg), coalesce(d ->> 'live_mode', 'true') <> 'false', mp_guardar_cuenta.quien)
      on conflict (negocio_id) do update set mp_usuario = excluded.mp_usuario, llave_id = excluded.llave_id, renovar_id = excluded.renovar_id,
         vence = excluded.vence, real = excluded.real, reconectar = false, quien = excluded.quien, conectado = now(), actualizado = now();
  end if;
  return jsonb_build_object('conectado', true, 'cuenta', usu);
end $$;
-- Las llaves de un negocio, para la función (cobrar, consultar un pago, devolver, renovar)
create or replace function public.mp_llaves(n uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('negocio', c.negocio_id, 'usuario', c.mp_usuario, 'vence', c.vence, 'reconectar', c.reconectar,
           'llave', (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.llave_id),
           'renovar', (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.renovar_id))
    from public.mp_cuentas c where c.negocio_id = n
$$;
-- No se pudo renovar (el dueño quitó el permiso desde Mercado Pago, por ejemplo): hay que conectarla de nuevo.
-- Mientras tanto el negocio toma los turnos sin seña.
create or replace function public.mp_marcar_reconectar(n uuid) returns void
language sql security definer set search_path = '' as $$
  update public.mp_cuentas set reconectar = true, actualizado = now() where negocio_id = n
$$;
-- Las cuentas cuya llave vence en menos de 30 días (la función las renueva una vez por día; ver pg_cron, abajo)
create or replace function public.mp_por_renovar() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(c.negocio_id), '[]'::jsonb) from public.mp_cuentas c
   where not c.reconectar and c.vence < now() + interval '30 days'
$$;
create or replace function public.mp_borrar_llaves(a uuid, b uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from vault.secrets s where s.id in (a, b);
exception when others then
  raise warning 'Bookea: no se pudieron borrar las llaves de Mercado Pago: %', sqlerrm;
end $$;

-- ---------- Panel: cómo está la conexión, y desconectarla ----------
-- Lo ve cualquiera del equipo (sin las llaves). "sin_devolver": señas que Mercado Pago no dejó devolver (por ejemplo,
-- sin saldo en la cuenta): el negocio las tiene que devolver desde Mercado Pago.
create or replace function public.mi_mercado_pago(n uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c public.mp_cuentas%rowtype;
begin
  if not public.es_miembro_activo(n) then raise exception 'sin permiso para ver este negocio' using errcode = '42501'; end if;
  select * into c from public.mp_cuentas x where x.negocio_id = n;
  return jsonb_build_object('conectado', c.negocio_id is not null, 'cuenta', c.mp_usuario, 'real', c.real,
    'reconectar', coalesce(c.reconectar, false), 'desde', c.conectado, 'dueno', public.es_dueno(n),
    'cobradas', (select count(*) from public.mp_cobros k where k.negocio_id = n and k.estado = 'aprobado'),
    'sin_devolver', (select count(*) from public.mp_cobros k where k.negocio_id = n and k.devolucion = 'fallo'));
end $$;
-- El dueño la desconecta: los turnos se toman sin seña. No se puede mientras alguien está pagando
-- una seña o hay una por devolver (las dos cosas necesitan la cuenta).
create or replace function public.mp_desconectar(n uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare c public.mp_cuentas%rowtype;
begin
  if not public.es_dueno(n) then raise exception 'Solo el dueño puede desconectar Mercado Pago' using errcode = '42501'; end if;
  if exists (select 1 from public.turnos t where t.negocio_id = n and t.estado = 'pendiente' and t.vence > now())
     or exists (select 1 from public.mp_cobros k where k.negocio_id = n and k.devolucion = 'pendiente') then
    raise exception 'Hay un cobro en curso: probá de nuevo en unos minutos' using errcode = '55006';
  end if;
  delete from public.mp_cuentas x where x.negocio_id = n returning * into c;
  if c.negocio_id is null then return false; end if;
  perform public.mp_borrar_llaves(c.llave_id, c.renovar_id);
  return true;
end $$;

-- ---------- Cobrar la seña ----------
-- Lo que la función necesita para cobrar la seña de un turno (solo el cliente del turno). Trae también los cobros
-- abiertos de ese turno: la función los consulta (y usa el mismo si sigue abierto, así no se arman dos).
create or replace function public.mp_datos_cobro(turno uuid, quien uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.turnos%rowtype;
  c public.clientes%rowtype;
begin
  perform public.vencer_pendientes(); -- si ya se le pasó el tiempo, el turno dice "cancelado" (y un pago tardío se devuelve)
  select * into t from public.turnos x where x.id = turno and x.cliente_id = quien;
  if not found then raise exception 'No existe ese turno' using errcode = 'P0002'; end if;
  select * into c from public.clientes x where x.id = quien;
  return jsonb_build_object('turno', t.id, 'estado', t.estado, 'pago', t.pago, 'negocio', t.negocio_id, 'codigo', t.codigo,
    'monto', t.sena, 'comision', t.comision,
    -- el mail del cliente, para que Mercado Pago lo complete; con una cuenta de prueba de Mercado Pago, no: en modo
    -- prueba rechaza el pago si una de las partes tiene un mail real (probado el 27/11)
    'email', case when exists (select 1 from public.mp_cuentas k where k.negocio_id = t.negocio_id and k.real) then c.email else '' end,
    'titulo', left('Seña · ' || t.lugar || ' · ' || to_char(t.fecha, 'DD/MM') || ' ' || to_char(t.hora, 'HH24:MI') || ' · ' || t.cancha, 120),
    -- minutos que le quedan para pagar (el cobro de Mercado Pago vence un poco antes que el turno guardado)
    'minutos', case when t.estado = 'pendiente' then floor(extract(epoch from (t.vence - now())) / 60)::integer else 0 end,
    'cobra', t.negocio_id is not null and public.tiene_mercado_pago(t.negocio_id),
    'intento', (select count(*) from public.mp_cobros k where k.turno_id = t.id),
    'abiertos', (select coalesce(jsonb_agg(jsonb_build_object('orden', k.orden, 'url', k.url) order by k.creado desc), '[]'::jsonb)
                   from public.mp_cobros k where k.turno_id = t.id and k.estado = 'creado'));
end $$;
-- La función armó el cobro en Mercado Pago: se anota (para encontrarlo cuando Mercado Pago avise)
create or replace function public.mp_cobro_creado(turno uuid, orden text, url text, monto integer, comision integer) returns void
language sql security definer set search_path = '' as $$
  insert into public.mp_cobros (orden, turno_id, negocio_id, monto, comision, url)
    select mp_cobro_creado.orden, t.id, t.negocio_id, mp_cobro_creado.monto, mp_cobro_creado.comision,
           left(coalesce(mp_cobro_creado.url, ''), 500)
      from public.turnos t where t.id = mp_cobro_creado.turno
  on conflict (orden) do update set url = excluded.url, actualizado = now()
$$;
-- Un cobro, por su orden (para el aviso de Mercado Pago: de qué negocio es, así se consulta con sus llaves)
create or replace function public.mp_cobro(orden text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('orden', k.orden, 'negocio', k.negocio_id, 'turno', k.turno_id, 'estado', k.estado, 'monto', k.monto)
    from public.mp_cobros k where k.orden = mp_cobro.orden
$$;
-- Lo que dice Mercado Pago de un cobro (la función se lo pregunta a Mercado Pago con las llaves del negocio):
-- su estado y su detalle ("processed" y "accredited" = se acreditó) y lo que se pagó.
-- Devuelve qué pasó: "confirmado" (el turno quedó confirmado), "devolver" (se pagó un turno que ya no esperaba el pago:
-- queda en la cola para devolverlo), "devuelto", "rechazado" o "nada" (sigue en curso, o ya se sabía).
create or replace function public.mp_resultado(orden text, estado text, detalle text, pagado numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k  public.mp_cobros%rowtype;
  t  public.turnos%rowtype;
  st text := coalesce(mp_resultado.estado, '');
  de text := coalesce(mp_resultado.detalle, '');
begin
  select * into k from public.mp_cobros x where x.orden = mp_resultado.orden for update;
  if not found then return jsonb_build_object('accion', 'desconocido'); end if;
  update public.mp_cobros x set detalle = left(st || ' / ' || de, 200), actualizado = now() where x.orden = k.orden;
  if k.turno_id is not null then select * into t from public.turnos x where x.id = k.turno_id for update; end if;
  -- Se devolvió entero (desde Bookea o desde Mercado Pago)
  if st = 'refunded' then
    update public.mp_cobros x set estado = 'devuelto', devolucion = case when x.devolucion = '' then '' else 'hecha' end
     where x.orden = k.orden;
    update public.turnos x set pago = 'devuelto' where x.id = t.id and x.pago = 'aprobado' and x.estado = 'cancelado';
    return jsonb_build_object('accion', 'devuelto', 'turno', t.id, 'estado', t.estado);
  end if;
  if st = 'processed' and de = 'accredited' then
    if k.estado <> 'creado' then return jsonb_build_object('accion', 'nada', 'turno', t.id, 'estado', t.estado); end if;
    if coalesce(mp_resultado.pagado, k.monto) < k.monto then
      raise exception 'Mercado Pago dice que se pagó menos que la seña' using errcode = '22023';
    end if;
    update public.mp_cobros x set estado = 'aprobado' where x.orden = k.orden;
    if t.id is not null and t.estado = 'pendiente' then
      update public.turnos x set estado = 'confirmado', pago = 'aprobado', pagado = now(), vence = null where x.id = t.id;
      update public.reservas r set sena = t.sena,
             nota = left('Reservó en bookea.ar · código ' || t.codigo || ' · Seña de $ ' || t.sena || ' pagada con Mercado Pago.', 500)
       where r.id = t.reserva_id;
      return jsonb_build_object('accion', 'confirmado', 'turno', t.id, 'estado', 'confirmado');
    end if;
    -- Se pagó un turno que ya no esperaba el pago (venció, se canceló, o ya estaba pago con otro cobro): se devuelve
    update public.mp_cobros x set devolucion = 'pendiente' where x.orden = k.orden;
    perform public.mp_avisar_devolucion();
    return jsonb_build_object('accion', 'devolver', 'turno', t.id, 'estado', t.estado);
  end if;
  if st in ('canceled', 'failed') then
    update public.mp_cobros x set estado = 'rechazado' where x.orden = k.orden and x.estado = 'creado';
    return jsonb_build_object('accion', 'rechazado', 'turno', t.id, 'estado', t.estado);
  end if;
  return jsonb_build_object('accion', 'nada', 'turno', t.id, 'estado', t.estado);  -- created, processing, action_required…
end $$;

-- ---------- Devolver la seña ----------
-- Turno pagado que se cancela y cuya seña se devuelve (lo canceló el cliente con tiempo, o el negocio sin quedarse con
-- la seña): su cobro queda en la cola y se le avisa a la función.
create or replace function public.turno_a_devolver() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.mp_cobros k set devolucion = 'pendiente', actualizado = now()
   where k.turno_id = new.id and k.estado = 'aprobado' and k.devolucion = '';
  if found then perform public.mp_avisar_devolucion(); end if;
  return new;
end $$;
drop trigger if exists turno_a_devolver on public.turnos;
create trigger turno_a_devolver after update of estado on public.turnos
  for each row when (new.estado = 'cancelado' and old.estado = 'confirmado' and new.pago = 'aprobado' and new.devuelta is true)
  execute function public.turno_a_devolver();
-- El aviso a la función (con pg_net, el mismo de los mails). No lleva nada: la función mira la cola en la base. Si
-- pg_net no está o el aviso falla, la cancelación sigue igual y la devolución sale en la próxima vuelta (pg_cron).
create or replace function public.mp_avisar_devolucion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regnamespace('net') is null then return; end if;  -- sin pg_net: lo toma pg_cron o el próximo aviso
  perform net.http_post(url := public.bookea_url_funciones() || '/mp/devolver', body := '{}'::jsonb,
                        headers := '{"Content-Type": "application/json"}'::jsonb);
exception when others then
  raise warning 'Bookea: no se pudo avisar que hay una seña para devolver: %', sqlerrm;
end $$;
-- La cola, para la función: los cobros a devolver, de a 20
create or replace function public.mp_por_devolver() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('orden', k.orden, 'negocio', k.negocio_id, 'monto', k.monto, 'intentos', k.intentos)
                            order by k.actualizado), '[]'::jsonb)
    from (select * from public.mp_cobros x where x.devolucion = 'pendiente' order by x.actualizado limit 20) k
$$;
-- La función devolvió la seña (o no pudo: se vuelve a intentar en la próxima vuelta, hasta 48 veces)
create or replace function public.mp_devolucion(orden text, hecha boolean, detalle text) returns void
language plpgsql security definer set search_path = '' as $$
declare k public.mp_cobros%rowtype;
begin
  update public.mp_cobros x
     set devolucion = case when hecha then 'hecha' when x.intentos + 1 >= 48 then 'fallo' else 'pendiente' end,
         estado = case when hecha then 'devuelto' else x.estado end, intentos = x.intentos + 1,
         detalle = left(coalesce(mp_devolucion.detalle, ''), 200), actualizado = now()
   where x.orden = mp_devolucion.orden and x.devolucion = 'pendiente'
   returning * into k;
  if hecha and k.turno_id is not null then
    update public.turnos t set pago = 'devuelto' where t.id = k.turno_id and t.pago = 'aprobado' and t.estado = 'cancelado';
  end if;
end $$;

-- Cada minuto, los turnos que nadie pagó; cada 15 minutos, las devoluciones que quedaron sin hacer; y una vez por día,
-- renovar las llaves que están por vencer. Hacen falta las extensiones pg_cron y pg_net (Supabase → Database →
-- Extensions); sin pg_cron, los turnos vencidos igual se liberan al reservar y al abrir la agenda, y las llaves se
-- renuevan al cobrar.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('bookea-vencer-pendientes', '* * * * *', 'select public.vencer_pendientes()');
    perform cron.schedule('bookea-devoluciones', '*/15 * * * *',
      'select public.mp_avisar_devolucion() where exists (select 1 from public.mp_cobros where devolucion = ''pendiente'')');
    perform cron.schedule('bookea-renovar-mercado-pago', '17 6 * * *',
      'select net.http_post(url := public.bookea_url_funciones() || ''/mp/renovar'', body := ''{}''::jsonb, headers := ''{"Content-Type": "application/json"}''::jsonb)'
      || ' where exists (select 1 from public.mp_cuentas where not reconectar and vence < now() + interval ''30 days'')');
  end if;
exception when others then
  raise warning 'Bookea: no se pudieron programar las tareas de pg_cron: %', sqlerrm;
end $$;

revoke all on function public.bookea_comision_pct() from public, anon, authenticated;
revoke all on function public.comision_de(integer) from public, anon, authenticated;
revoke all on function public.bookea_url_funciones() from public, anon, authenticated;
revoke all on function public.tiene_mercado_pago(uuid) from public, anon, authenticated;
revoke all on function public.pide_sena(uuid) from public, anon, authenticated;
revoke all on function public.lista_faltan(uuid) from public, anon, authenticated;
revoke all on function public.en_la_lista(uuid) from public, anon, authenticated;
revoke all on function public.vencer_pendientes() from public, anon;
grant execute on function public.vencer_pendientes() to authenticated;  -- el panel, al abrir la agenda
revoke all on function public.mp_borrar_llaves(uuid, uuid) from public, anon, authenticated;
revoke all on function public.turno_a_devolver() from public, anon, authenticated;
revoke all on function public.mp_avisar_devolucion() from public, anon, authenticated;
revoke all on function public.mi_mercado_pago(uuid) from public, anon;
grant execute on function public.mi_mercado_pago(uuid) to authenticated;
revoke all on function public.mp_desconectar(uuid) from public, anon;
grant execute on function public.mp_desconectar(uuid) to authenticated;
-- Solo la función (con la clave secreta)
do $$
declare f text;
begin
  foreach f in array array['mp_empezar_conexion(uuid, uuid)', 'mp_tomar_estado(text)', 'mp_guardar_cuenta(uuid, uuid, jsonb)',
    'mp_llaves(uuid)', 'mp_marcar_reconectar(uuid)', 'mp_datos_cobro(uuid, uuid)', 'mp_cobro_creado(uuid, text, text, integer, integer)',
    'mp_cobro(text)', 'mp_resultado(text, text, text, numeric)', 'mp_por_devolver()', 'mp_devolucion(text, boolean, text)',
    'mp_por_renovar()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- =====================================================================================
-- Negocios en la página (bookea.ar)
--
-- La página muestra cada negocio aprobado con lo que cargó en Mi negocio: nombre, rubro, ciudad, dirección, foto,
-- descripción, canchas, duración del turno, horarios, precios, seña y cancelación. Y los horarios ocupados de su
-- agenda, sin decir de quién son. Nada más: ni el email del dueño, ni su WhatsApp, ni sus clientes.
--
-- Cuáles aparecen:
--   · En la lista de la página (inicio y resultados): los aprobados que ya tengan canchas, horarios, ciudad y teléfono,
--     con Mercado Pago o sin él (sin él, sin seña); no los del equipo de Bookea ni el que cobra con una cuenta de prueba
--     de Mercado Pago (en_la_lista, arriba).
--   · Con su link (bookea.ar/su-link): cualquiera aprobado que ya tenga canchas y horarios, para que el dueño se vea
--     y lo pruebe.
-- Los turnos: reservar_turno los pone también en la agenda del negocio (reservas). Si el cliente cancela, el horario
-- se libera en la agenda; si el negocio cancela desde el panel, se cancela también el del cliente y le llega el mail.
-- =====================================================================================

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
    and not exists (select 1 from public.turnos t where t.reserva_id = r.id and t.estado = 'pendiente' and t.vence < now())
    and r.fecha between public.ahora_mendoza()::date - 1 and public.ahora_mendoza()::date + 8
$$;

-- Una foto de su página: solo si está en su carpeta de Storage (negocios/<id>/...); cualquier otra dirección no se muestra
create or replace function public.foto_publica(n uuid, u text) returns text
language sql immutable set search_path = '' as $$
  select case when coalesce(u, '') ~* ('^https?://[^/]+/storage/v1/object/public/negocios/' || n::text || '/[a-z0-9._-]+$') then u end
$$;
-- Una lista de fotos de la página (las de una tarjeta): solo las de su carpeta, y hasta "tope"
create or replace function public.fotos_publicas(n uuid, lista jsonb, tope integer) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(u order by i), '[]'::jsonb) from (
    select public.foto_publica(n, g) as u, i
      from jsonb_array_elements_text(case when jsonb_typeof(lista) = 'array' then lista else '[]'::jsonb end) with ordinality as e(g, i)) s
   where u is not null and i <= tope
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
    -- la seña que de verdad se cobra: sin Mercado Pago conectado, ninguna (el turno va sin seña)
    'senaPct', case when public.tiene_mercado_pago(x.id) and coalesce(x.ajustes ->> 'senaPct', '') ~ '^[0-9]{1,3}(\.[0-9]+)?$'
                    then least((x.ajustes ->> 'senaPct')::numeric, 100) else 0 end,
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
      -- las fotos de sus tres tarjetas (el lugar, servicios, dónde estamos): hasta dos en cada una (26/11)
      'tarjetas', jsonb_build_object(
        'lugar', public.fotos_publicas(x.id, x.pagina #> '{tarjetas,lugar}', 2),
        'serv', public.fotos_publicas(x.id, x.pagina #> '{tarjetas,serv}', 2),
        'ubi', public.fotos_publicas(x.id, x.pagina #> '{tarjetas,ubi}', 2)),
      'whatsapp', case when x.pagina ->> 'mostrar_whatsapp' = 'true' then x.whatsapp else '' end),
    'publicado', public.en_la_lista(x.id),
    'cobra', public.tiene_mercado_pago(x.id) and public.pide_sena(x.id),  -- la seña se paga con Mercado Pago (si no, va sin seña)
    'ocupados', public.ocupados_de(x.id))
$$;

-- Para la página (también sin cuenta): los negocios de la lista y, si se pide, el de un link (bookea.ar/su-link)
create or replace function public.lugares_publicos(incluir text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.lugar_publico(x) order by x.nombre), '[]'::jsonb)
  from public.negocios x
  where x.estado = 'aprobado' and public.lugar_listo(x.ajustes)
    and (public.en_la_lista(x.id) or x.slug = lower(btrim(coalesce(incluir, ''))))
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
    update public.turnos t set estado = 'cancelado', cancelado = now(), cancelado_por = 'negocio', devuelta = t.estado = 'confirmado'
     where t.reserva_id = old.id and t.estado in ('pendiente', 'confirmado');
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
  update public.turnos t set estado = 'cancelado', cancelado = now(), cancelado_por = 'negocio',
         devuelta = t.estado = 'confirmado' and not new.retenida
   where t.reserva_id = new.id and t.estado in ('pendiente', 'confirmado');
  return new;
end $$;
drop trigger if exists reserva_web_cancelada on public.reservas;
create trigger reserva_web_cancelada after update of estado on public.reservas
  for each row when (new.estado = 'cancelada' and old.estado <> 'cancelada')
  execute function public.reserva_web_cancelada();

-- ---------- Las fotos de la página (Supabase Storage) ----------
-- Un bucket público, "negocios": cada negocio sube sus fotos a su carpeta (negocios/<id del negocio>/...) y solo puede
-- solo el equipo de Bookea, que arma la página de cada negocio como un servicio (pedido del dueño, 25/11: "lo voy a
-- cargar yo"; el negocio no la toca). Las ve cualquiera: son las de su página.
create or replace function public.puede_subir_foto(objeto text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when split_part(coalesce(objeto, ''), '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.es_admin_bookea() else false end
$$;
revoke all on function public.puede_subir_foto(text) from public, anon;
grant execute on function public.puede_subir_foto(text) to authenticated;

-- La página de un negocio, guardada por el equipo de Bookea (desde Solicitudes → "Editar su página"). Cambia solo la
-- página (fotos, frase, historia, servicios, redes): nada más del negocio. El negocio no la puede cambiar.
create or replace function public.guardar_pagina(n uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin_bookea() then
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

revoke all on function public.foto_publica(uuid, text) from public, anon, authenticated;
revoke all on function public.fotos_publicas(uuid, jsonb, integer) from public, anon, authenticated;
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
