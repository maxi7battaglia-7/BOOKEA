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
--   · miembros  → qué cuenta administra qué negocio (así una cuenta queda atada a su
--                 negocio, y más adelante un negocio puede sumar encargados).
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
    return new; -- cuenta sin negocio propio (por ejemplo, un encargado invitado más adelante)
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
  insert into public.miembros (negocio_id, user_id, rol) values (nid, new.id, 'dueno');
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

-- Sin sesión (anon) no se ve nada. Con sesión, solo lo propio (las reglas de abajo).
revoke all on public.negocios, public.miembros, public.reservas, public.admins_bookea from anon;
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

drop policy if exists "negocios: ver los propios" on public.negocios;
create policy "negocios: ver los propios" on public.negocios
  for select to authenticated using (public.es_miembro(id) or public.es_admin_bookea());
drop policy if exists "negocios: cambiar los propios" on public.negocios;
create policy "negocios: cambiar los propios" on public.negocios
  for update to authenticated using (public.es_miembro_activo(id)) with check (public.es_miembro_activo(id));

drop policy if exists "miembros: ver los de mis negocios" on public.miembros;
create policy "miembros: ver los de mis negocios" on public.miembros
  for select to authenticated using (user_id = auth.uid() or public.es_miembro(negocio_id));

drop policy if exists "reservas: ver las de mis negocios" on public.reservas;
create policy "reservas: ver las de mis negocios" on public.reservas
  for select to authenticated using (public.es_miembro_activo(negocio_id));
drop policy if exists "reservas: cargar en mis negocios" on public.reservas;
create policy "reservas: cargar en mis negocios" on public.reservas
  for insert to authenticated with check (public.es_miembro_activo(negocio_id));
drop policy if exists "reservas: cambiar las de mis negocios" on public.reservas;
create policy "reservas: cambiar las de mis negocios" on public.reservas
  for update to authenticated using (public.es_miembro_activo(negocio_id)) with check (public.es_miembro_activo(negocio_id));
drop policy if exists "reservas: borrar las de mis negocios" on public.reservas;
create policy "reservas: borrar las de mis negocios" on public.reservas
  for delete to authenticated using (public.es_miembro_activo(negocio_id));

drop policy if exists "admins: verse a sí mismo" on public.admins_bookea;
create policy "admins: verse a sí mismo" on public.admins_bookea
  for select to authenticated using (user_id = auth.uid());
