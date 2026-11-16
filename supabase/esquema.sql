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
