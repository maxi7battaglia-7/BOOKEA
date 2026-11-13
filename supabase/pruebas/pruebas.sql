-- Pruebas del esquema: cada cuenta queda atada a su negocio y no puede ver ni tocar los de otro.
-- Se corre con supabase/pruebas/correr.sh sobre una base vacía. Si algo falla, corta con error.
\set ON_ERROR_STOP on
\set QUIET on

-- Dos dueños con negocios del mismo nombre, y una cuenta sin negocio
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@prueba.com',  '{"nombre":"Ana","negocio":"Los Álamos Pádel","rubro":"Pádel"}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@prueba.com', '{"nombre":"Beto","negocio":"Los Álamos Pádel","rubro":"Fútbol 5"}'),
  ('00000000-0000-0000-0000-00000000000c', 'caro@prueba.com', '{"nombre":"Caro"}');

do $$
declare a text; b text; n int;
begin
  select n.slug into a from public.negocios n join public.miembros m on m.negocio_id = n.id
    where m.user_id = '00000000-0000-0000-0000-00000000000a' and m.rol = 'dueno';
  select n.slug into b from public.negocios n join public.miembros m on m.negocio_id = n.id
    where m.user_id = '00000000-0000-0000-0000-00000000000b';
  assert a = 'losalamospadel', 'slug de Ana: ' || coalesce(a, 'nada');
  assert b = 'losalamospadel2', 'slug de Beto: ' || coalesce(b, 'nada');
  select count(*) into n from public.miembros where user_id = '00000000-0000-0000-0000-00000000000c';
  assert n = 0, 'la cuenta sin negocio no queda atada a ninguno';
  raise notice 'OK  al crear la cuenta se crea su negocio, con link propio (% y %)', a, b;
end $$;

-- ids de los dos negocios, para usarlos después con cualquier rol
select set_config('prueba.neg_a', (select id::text from public.negocios where slug = 'losalamospadel'), false) \g /dev/null
select set_config('prueba.neg_b', (select id::text from public.negocios where slug = 'losalamospadel2'), false) \g /dev/null
-- Beto tiene un turno cargado
insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, wa, precio, estado, origen)
  values (current_setting('prueba.neg_b')::uuid, 'r1', '2026-11-20', 1200, 'Cliente de Beto', '2622 000 000', 48000, 'confirmada', 'link');

-- =============== Recién registrada: el negocio de Ana está pendiente ===============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
set role authenticated;
do $$
declare e text; m text; n int;
begin
  select estado, email_dueno into e, m from public.negocios;
  assert e = 'pendiente' and m = 'ana@prueba.com', 'estado: ' || coalesce(e, 'nada') || ', email: ' || coalesce(m, 'nada');
  raise notice 'OK  un negocio nuevo queda pendiente (y guarda el email de la dueña para avisarle)';
  begin
    insert into public.reservas (negocio_id, recurso, fecha, hora, estado)
      values (current_setting('prueba.neg_a')::uuid, 'r1', '2026-11-19', 600, 'confirmada');
    raise exception 'FALLA: un negocio pendiente cargó un turno';
  exception when insufficient_privilege then raise notice 'OK  pendiente: no puede cargar turnos';
  end;
  update public.negocios set nombre = 'Cambio' where id = current_setting('prueba.neg_a')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: un negocio pendiente cambió sus datos';
  raise notice 'OK  pendiente: no puede cambiar los datos del negocio';
  begin
    update public.negocios set estado = 'aprobado' where id = current_setting('prueba.neg_a')::uuid;
    raise exception 'FALLA: Ana se aprobó sola cambiando el estado';
  exception when insufficient_privilege then raise notice 'OK  nadie puede aprobarse solo cambiando el estado';
  end;
  begin
    perform public.revisar_negocio(current_setting('prueba.neg_a')::uuid, true);
    raise exception 'FALLA: Ana se aprobó sola con revisar_negocio';
  exception when insufficient_privilege then raise notice 'OK  solo el equipo de Bookea puede aprobar';
  end;
end $$;
reset role;

-- =============== Caro es del equipo de Bookea y aprueba ===============
insert into public.admins_bookea (user_id) values ('00000000-0000-0000-0000-00000000000c');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.negocios where estado = 'pendiente';
  assert n = 2, 'Caro ve ' || n || ' solicitudes pendientes';
  select count(*) into n from public.reservas;
  assert n = 0, 'FALLA: el equipo de Bookea ve reservas de los negocios';
  raise notice 'OK  el equipo de Bookea ve las solicitudes, pero no las reservas de los negocios';
  assert public.revisar_negocio(current_setting('prueba.neg_a')::uuid, true) = 'aprobado';
  assert public.revisar_negocio(current_setting('prueba.neg_b')::uuid, true) = 'aprobado';
  raise notice 'OK  Caro aprueba los dos negocios';
end $$;
reset role;

-- =============== Como Ana ===============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
set role authenticated;

do $$
declare n int; s text;
begin
  select count(*), min(slug) into n, s from public.negocios;
  assert n = 1 and s = 'losalamospadel', 'Ana ve ' || n || ' negocios';
  select count(*) into n from public.reservas;
  assert n = 0, 'Ana ve ' || n || ' reservas que no son suyas';
  select count(*) into n from public.miembros;
  assert n = 1, 'Ana ve ' || n || ' membresías';
  raise notice 'OK  Ana ve solo su negocio, y ninguna reserva de Beto';
end $$;

do $$ begin
  insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, precio, sena, estado, origen)
    values (current_setting('prueba.neg_a')::uuid, 'r1', '2026-11-20', 1080, 'Juan P.', 30000, 7500, 'confirmada', 'telefono');
  raise notice 'OK  Ana carga un turno en su negocio';
end $$;

do $$ begin
  insert into public.reservas (negocio_id, recurso, fecha, hora, estado)
    values (current_setting('prueba.neg_a')::uuid, 'r1', '2026-11-20', 1080, 'confirmada');
  raise exception 'FALLA: dejó reservar dos veces el mismo horario';
exception when unique_violation then raise notice 'OK  el mismo horario de la misma cancha no se reserva dos veces';
end $$;

do $$ begin
  update public.reservas set estado = 'cancelada' where fecha = '2026-11-20' and hora = 1080;
  insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, estado)
    values (current_setting('prueba.neg_a')::uuid, 'r1', '2026-11-20', 1080, 'Sofi L.', 'confirmada');
  raise notice 'OK  un turno cancelado libera el horario';
end $$;

do $$ begin
  insert into public.reservas (negocio_id, recurso, fecha, hora, estado)
    values (current_setting('prueba.neg_b')::uuid, 'r2', '2026-11-21', 600, 'confirmada');
  raise exception 'FALLA: Ana pudo cargar un turno en el negocio de Beto';
exception when insufficient_privilege then raise notice 'OK  Ana no puede cargar turnos en otro negocio';
end $$;

do $$
declare n int;
begin
  update public.negocios set nombre = 'Hackeado' where id = current_setting('prueba.neg_b')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Ana cambió el negocio de Beto';
  delete from public.reservas where negocio_id = current_setting('prueba.neg_b')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Ana borró reservas de Beto';
  update public.reservas set estado = 'cancelada' where negocio_id = current_setting('prueba.neg_b')::uuid;
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Ana cambió reservas de Beto';
  raise notice 'OK  Ana no puede cambiar ni borrar nada del negocio de Beto';
end $$;

do $$ begin
  update public.reservas set negocio_id = current_setting('prueba.neg_b')::uuid where cliente = 'Sofi L.';
  raise exception 'FALLA: Ana pasó un turno suyo al negocio de Beto';
exception when insufficient_privilege then raise notice 'OK  Ana no puede mover un turno a otro negocio';
end $$;

do $$ begin
  insert into public.miembros (negocio_id, user_id) values (current_setting('prueba.neg_b')::uuid, auth.uid());
  raise exception 'FALLA: Ana se sumó sola al negocio de Beto';
exception when insufficient_privilege then raise notice 'OK  Ana no puede sumarse a otro negocio';
end $$;

do $$ begin
  update public.negocios set slug = 'losalamospadel2' where id = current_setting('prueba.neg_a')::uuid;
  raise exception 'FALLA: dos negocios con el mismo link';
exception when unique_violation then raise notice 'OK  dos negocios no pueden tener el mismo link';
end $$;

do $$
declare n int;
begin
  update public.negocios set nombre = 'Los Álamos Pádel Club', ajustes = '{"duracion":90}' where id = current_setting('prueba.neg_a')::uuid;
  get diagnostics n = row_count;
  assert n = 1, 'Ana no pudo cambiar su negocio';
  raise notice 'OK  Ana cambia los datos de su negocio';
end $$;

reset role;

-- =============== Sin sesión (anon) ===============
set role anon;
do $$ begin
  perform 1 from public.negocios;
  raise exception 'FALLA: sin sesión se ven los negocios';
exception when insufficient_privilege then raise notice 'OK  sin sesión no se ve ningún negocio';
end $$;
do $$ begin
  perform 1 from public.reservas;
  raise exception 'FALLA: sin sesión se ven las reservas';
exception when insufficient_privilege then raise notice 'OK  sin sesión no se ve ninguna reserva';
end $$;
reset role;

-- =============== Como Beto ===============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false) \g /dev/null
set role authenticated;
do $$
declare n int; c text;
begin
  select count(*), min(cliente) into n, c from public.reservas;
  assert n = 1 and c = 'Cliente de Beto', 'Beto ve ' || n || ' reservas';
  raise notice 'OK  Beto ve solo su turno, no los de Ana';
end $$;
reset role;

-- =============== Borrar una cuenta ===============
do $$
declare n int;
begin
  delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
  select count(*) into n from public.miembros where user_id = '00000000-0000-0000-0000-00000000000b';
  assert n = 0, 'quedaron membresías de una cuenta borrada';
  raise notice 'OK  al borrar una cuenta se borra su membresía';
end $$;
-- =============== Un negocio rechazado deja de poder usar el panel ===============
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
set role authenticated;
do $$ begin
  assert public.revisar_negocio(current_setting('prueba.neg_a')::uuid, false) = 'rechazado';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
set role authenticated;
do $$
declare n int; e text;
begin
  select count(*) into n from public.reservas;
  select estado into e from public.negocios;
  assert n = 0 and e = 'rechazado', 'Ana rechazada ve ' || n || ' reservas';
  raise notice 'OK  rechazado: ve que fue rechazado, pero ya no ve ni toca sus turnos';
end $$;
reset role;
\echo 'Todas las pruebas del esquema pasaron.'
