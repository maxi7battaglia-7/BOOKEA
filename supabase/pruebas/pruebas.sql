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

-- =============== Equipo: el dueño suma personas con permisos ===============
-- Dani tiene un negocio aprobado con un turno; Ana (de otro negocio) y Caro (sin negocio) ya existen
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'dani@prueba.com', '{"nombre":"Dani","negocio":"Cancha Dani","rubro":"Fútbol"}');
update public.negocios set estado = 'aprobado' where slug = 'canchadani';
select set_config('prueba.neg_d', (select id::text from public.negocios where slug = 'canchadani'), false) \g /dev/null
insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, precio, estado)
  values (current_setting('prueba.neg_d')::uuid, 'r1', '2026-11-21', 1200, 'Cliente de Dani', 40000, 'confirmada');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false) \g /dev/null
set role authenticated;
do $$
declare t1 text; t2 text; p text[]; m text; nm text;
begin
  select email, nombre into m, nm from public.miembros where user_id = auth.uid();
  assert m = 'dani@prueba.com' and nm = 'Dani', 'el dueño queda en el equipo con su nombre y email: ' || coalesce(m, 'nada');
  t1 := public.crear_invitacion(current_setting('prueba.neg_d')::uuid, ' Emi@Prueba.com ', 'Emi', array['agenda', 'finanzas']);
  t2 := public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'fede@prueba.com', 'Fede', array['turnos', 'inventado']);
  perform set_config('prueba.t_emi', t1, false);
  perform set_config('prueba.t_fede', t2, false);
  assert char_length(t1) = 64 and t1 <> t2, 'token: ' || t1;
  select permisos into p from public.invitaciones where email = 'fede@prueba.com';
  assert p = array['agenda', 'turnos'], 'permisos de Fede: ' || p::text;
  assert (select count(*) from public.invitaciones) = 2, 'el dueño ve sus 2 invitaciones';
  raise notice 'OK  el dueño invita: email en minúsculas, permisos limpios (cargar turnos incluye ver la agenda)';
  begin
    perform public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'no-es-un-email', 'X', array['agenda']);
    raise exception 'FALLA: aceptó un email inválido';
  exception when invalid_parameter_value then raise notice 'OK  no se puede invitar a un email inválido';
  end;
  begin
    perform public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'dani@prueba.com', 'Yo', array['agenda']);
    raise exception 'FALLA: se invitó a alguien que ya está en el equipo';
  exception when unique_violation then raise notice 'OK  no se puede invitar a alguien que ya está en el equipo';
  end;
end $$;
reset role;

-- Ana, dueña de otro negocio, no puede invitar al negocio de Dani ni ver sus invitaciones
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
set role authenticated;
do $$ begin
  begin
    perform public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'intruso@prueba.com', 'X', array['negocio']);
    raise exception 'FALLA: Ana invitó gente al negocio de Dani';
  exception when insufficient_privilege then raise notice 'OK  solo el dueño puede invitar a su negocio';
  end;
  assert (select count(*) from public.invitaciones) = 0, 'Ana ve invitaciones ajenas';
  raise notice 'OK  las invitaciones de un negocio no las ve nadie más';
end $$;
reset role;

-- Quien abre el link, todavía sin cuenta
set role anon;
do $$
declare j jsonb;
begin
  j := public.ver_invitacion(current_setting('prueba.t_emi'));
  assert j ->> 'negocio' = 'Cancha Dani' and j ->> 'email' = 'emi@prueba.com' and (j ->> 'valida')::boolean, 'invitación: ' || coalesce(j::text, 'nada');
  assert public.ver_invitacion('inventado') is null and public.ver_invitacion(repeat('0', 64)) is null, 'un link inventado mostró algo';
  raise notice 'OK  el link muestra de qué negocio es, sin cuenta; un link inventado no muestra nada';
end $$;
reset role;

-- Altas con el link: con otro email no entra; con el suyo, entra con sus permisos
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d9', 'otro@prueba.com', jsonb_build_object('nombre', 'Otro', 'invitacion', current_setting('prueba.t_fede'))),
  ('00000000-0000-0000-0000-0000000000d2', 'emi@prueba.com',  jsonb_build_object('nombre', 'Emilia', 'invitacion', current_setting('prueba.t_emi'))),
  ('00000000-0000-0000-0000-0000000000d3', 'fede@prueba.com', jsonb_build_object('nombre', 'Fede', 'invitacion', current_setting('prueba.t_fede')));
do $$
declare r text; p text[]; nm text;
begin
  assert not exists (select 1 from public.miembros where user_id = '00000000-0000-0000-0000-0000000000d9'), 'entró con el link de otro email';
  raise notice 'OK  con el link de otra persona, la cuenta se crea pero no entra al equipo';
  select rol, permisos, nombre into r, p, nm from public.miembros where user_id = '00000000-0000-0000-0000-0000000000d2';
  assert r = 'encargado' and p = array['agenda', 'finanzas'] and nm = 'Emilia', 'Emi: ' || coalesce(r, 'nada') || ' ' || coalesce(p::text, '');
  assert (select usada_por from public.invitaciones where email = 'emi@prueba.com') = '00000000-0000-0000-0000-0000000000d2';
  assert not (public.ver_invitacion(current_setting('prueba.t_emi')) ->> 'valida')::boolean, 'el link usado sigue sirviendo';
  raise notice 'OK  con su link y su email, entra al equipo con los permisos elegidos, y el link deja de servir';
end $$;

-- Emi puede ver la agenda y finanzas, pero no cargar turnos ni tocar el negocio ni el equipo
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false) \g /dev/null
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.reservas;
  assert n = 1, 'Emi ve ' || n || ' turnos';
  raise notice 'OK  alguien del equipo ve los turnos de su negocio';
  begin
    insert into public.reservas (negocio_id, recurso, fecha, hora, estado)
      values (current_setting('prueba.neg_d')::uuid, 'r1', '2026-11-22', 600, 'confirmada');
    raise exception 'FALLA: Emi cargó un turno sin permiso';
  exception when insufficient_privilege then raise notice 'OK  sin el permiso "turnos" no puede cargar turnos';
  end;
  update public.reservas set cliente = 'Cambiado';
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Emi cambió un turno';
  delete from public.reservas;
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Emi borró un turno';
  raise notice 'OK  sin el permiso "turnos" no puede cambiar ni borrar turnos';
  update public.negocios set nombre = 'Cambio';
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Emi cambió el negocio';
  raise notice 'OK  sin el permiso "negocio" no puede cambiar Mi negocio';
  select count(*) into n from public.miembros;
  assert n = 1, 'Emi ve ' || n || ' miembros';
  raise notice 'OK  alguien del equipo no ve al resto del equipo (solo el dueño)';
  begin
    perform public.cambiar_permisos(current_setting('prueba.neg_d')::uuid, auth.uid(), array['negocio']);
    raise exception 'FALLA: Emi se dio permisos sola';
  exception when insufficient_privilege then raise notice 'OK  nadie se puede dar permisos solo';
  end;
  begin
    perform public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'amigo@prueba.com', 'Amigo', array['negocio']);
    raise exception 'FALLA: Emi invitó a alguien';
  exception when insufficient_privilege then raise notice 'OK  solo el dueño suma gente al equipo';
  end;
  begin
    update public.miembros set permisos = array['negocio'] where user_id = auth.uid();
    raise exception 'FALLA: Emi cambió su fila de miembros';
  exception when insufficient_privilege then raise notice 'OK  nadie puede cambiar su permiso tocando la tabla';
  end;
end $$;
reset role;

-- Fede, con "turnos", carga y cambia turnos, pero no toca el negocio
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', false) \g /dev/null
set role authenticated;
do $$
declare n int;
begin
  insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, estado)
    values (current_setting('prueba.neg_d')::uuid, 'r1', '2026-11-22', 600, 'Cargado por Fede', 'confirmada');
  update public.reservas set estado = 'jugada' where cliente = 'Cliente de Dani';
  get diagnostics n = row_count;
  assert n = 1, 'Fede no pudo marcar un turno';
  raise notice 'OK  con el permiso "turnos" carga turnos y marca si pagaron';
  update public.negocios set nombre = 'Cambio';
  get diagnostics n = row_count;
  assert n = 0, 'FALLA: Fede cambió el negocio';
  raise notice 'OK  pero sin el permiso "negocio" no cambia Mi negocio';
end $$;
reset role;

-- Dani ve a su equipo, le cambia permisos a Emi y saca a Fede
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false) \g /dev/null
set role authenticated;
do $$
declare n int; p text[];
begin
  select count(*) into n from public.miembros;
  assert n = 3, 'Dani ve ' || n || ' miembros';
  raise notice 'OK  el dueño ve a todo su equipo';
  p := public.cambiar_permisos(current_setting('prueba.neg_d')::uuid, '00000000-0000-0000-0000-0000000000d2', array['negocio', 'clientes']);
  assert p = array['clientes', 'negocio'], 'permisos nuevos: ' || p::text;
  perform public.quitar_miembro(current_setting('prueba.neg_d')::uuid, '00000000-0000-0000-0000-0000000000d3');
  begin
    perform public.quitar_miembro(current_setting('prueba.neg_d')::uuid, auth.uid());
    raise exception 'FALLA: el dueño se sacó a sí mismo';
  exception when no_data_found then raise notice 'OK  el dueño cambia permisos y saca gente, pero no se puede sacar a sí mismo';
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false) \g /dev/null
set role authenticated;
do $$
declare n int;
begin
  update public.negocios set ciudad = 'Tunuyán';
  get diagnostics n = row_count;
  assert n = 1, 'Emi no pudo cambiar el negocio con el permiso nuevo';
  raise notice 'OK  el permiso nuevo vale enseguida';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', false) \g /dev/null
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.reservas;
  assert n = 0, 'Fede, sacado del equipo, ve ' || n || ' turnos';
  begin
    insert into public.reservas (negocio_id, recurso, fecha, hora, estado)
      values (current_setting('prueba.neg_d')::uuid, 'r1', '2026-11-23', 600, 'confirmada');
    raise exception 'FALLA: Fede cargó un turno después de que lo sacaron';
  exception when insufficient_privilege then raise notice 'OK  a quien sacan del equipo ya no ve ni toca nada';
  end;
end $$;
reset role;

-- Una cuenta que ya existía sin negocio (Caro) acepta una invitación; un link anulado deja de servir
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false) \g /dev/null
set role authenticated;
do $$
declare t text; t2 text;
begin
  t := public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'caro@prueba.com', 'Caro', array['clientes']);
  perform set_config('prueba.t_caro', t, false);
  t2 := public.crear_invitacion(current_setting('prueba.neg_d')::uuid, 'gabi@prueba.com', 'Gabi', array['agenda']);
  perform set_config('prueba.t_gabi', t2, false);
  perform public.anular_invitacion((select id from public.invitaciones where token = t2));
  assert public.ver_invitacion(t2) is null, 'el link anulado sigue existiendo';
  raise notice 'OK  el dueño anula una invitación y el link deja de servir';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
set role authenticated;
do $$ begin
  perform public.aceptar_invitacion(current_setting('prueba.t_caro'));
  assert (select permisos from public.miembros where user_id = auth.uid()) = array['clientes'];
  begin
    perform public.aceptar_invitacion(current_setting('prueba.t_caro'));
    raise exception 'FALLA: el mismo link sirvió dos veces';
  exception when no_data_found then raise notice 'OK  una cuenta que ya existía acepta su invitación, una sola vez';
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
set role authenticated;
do $$ begin
  begin
    perform public.aceptar_invitacion(current_setting('prueba.t_emi'));
    raise exception 'FALLA: Ana usó el link de Emi';
  exception when no_data_found then raise notice 'OK  nadie puede usar el link de otra persona';
  end;
end $$;
reset role;

-- Cambiar el nombre en Cuenta lo actualiza en el equipo
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"nombre":"Emilia R."}' where id = '00000000-0000-0000-0000-0000000000d2';
do $$ begin
  assert (select nombre from public.miembros where user_id = '00000000-0000-0000-0000-0000000000d2') = 'Emilia R.';
  raise notice 'OK  si alguien cambia su nombre, el dueño lo ve actualizado';
end $$;

-- =============== Clientes de la página de reservas ===============
-- Dos clientes se registran desde bookea.ar (con "cliente": true, como manda cuenta.js)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'Juli@Prueba.com', '{"nombre":"Juli Paz","celular":"261 555 1234","promos":true,"cliente":true}'),
  ('00000000-0000-0000-0000-0000000000e2', 'nico@prueba.com', '{"nombre":"Nico","celular":"261 444 0000","cliente":true}');
do $$
declare c public.clientes%rowtype;
begin
  select * into c from public.clientes where id = '00000000-0000-0000-0000-0000000000e1';
  assert c.nombre = 'Juli Paz' and c.email = 'juli@prueba.com' and c.celular = '261 555 1234' and c.promos, 'datos de Juli: ' || coalesce(to_jsonb(c)::text, 'nada');
  assert not (select promos from public.clientes where id = '00000000-0000-0000-0000-0000000000e2'), 'Nico no pidió promociones';
  assert not exists (select 1 from public.miembros where user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2')), 'un cliente quedó en un negocio';
  assert not exists (select 1 from public.negocios where email_dueno in ('juli@prueba.com', 'Juli@Prueba.com', 'nico@prueba.com')), 'un cliente creó un negocio';
  raise notice 'OK  cliente nuevo: se guardan su nombre, email, celular y si quiere promociones, sin crear ningún negocio';
end $$;

-- Sin sesión no se ve ni se reserva nada
set role anon;
do $$ begin
  begin
    perform 1 from public.clientes;
    raise exception 'FALLA: sin sesión se ven los clientes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reservar_turno('{}'::jsonb);
    raise exception 'FALLA: sin sesión se reservó';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  sin sesión no se ven clientes ni turnos, y no se puede reservar';
end $$;
reset role;

-- Juli reserva
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb; d date := current_date + 2;
begin
  t := public.reservar_turno(jsonb_build_object('lugar_id', 'losalamos', 'lugar', 'Los Álamos', 'zona', 'Tupungato', 'rubro', 'Pádel',
    'servicio_id', 'turno', 'servicio', 'Turno de 90 min', 'cancha', 'Cancha 2', 'fecha', d, 'hora', '20:00', 'fin', '21:30',
    'precio', 34000, 'sena', 8500, 'cancelar_horas', 6));
  assert t ->> 'codigo' ~ '^BK-[A-Z0-9]{5}$' and t ->> 'estado' = 'confirmado' and (t ->> 'cliente_id')::uuid = auth.uid(), 'turno: ' || t::text;
  perform set_config('prueba.turno_juli', t ->> 'id', false);
  assert (select count(*) from public.turnos) = 1, 'Juli no ve su turno';
  raise notice 'OK  el cliente reserva: queda a su nombre, con código, y lo ve en Mis turnos';
  begin
    perform public.reservar_turno(jsonb_build_object('lugar_id', 'losalamos', 'lugar', 'Los Álamos', 'cancha', 'Cancha 1',
      'fecha', current_date - 1, 'hora', '20:00', 'fin', '21:30', 'precio', 34000, 'sena', 8500));
    raise exception 'FALLA: se reservó un horario que ya pasó';
  exception when check_violation then raise notice 'OK  no se reserva un horario que ya pasó';
  end;
  begin
    insert into public.turnos (cliente_id, lugar_id, lugar, cancha, fecha, hora, fin, precio, sena)
      values (auth.uid(), 'losalamos', 'Los Álamos', 'Cancha 3', current_date + 3, '18:00', '19:30', 0, 0);
    raise exception 'FALLA: se cargó un turno sin pasar por reservar_turno (sin seña)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.turnos set estado = 'cancelado';
    raise exception 'FALLA: se cambió un turno tocando la tabla';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.clientes set email = 'otro@prueba.com';
    raise exception 'FALLA: se cambió el email tocando la tabla';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la tabla no se toca a mano: turnos y datos cambian solo con las funciones';
end $$;
reset role;

-- Nico: no ve lo de Juli, no le cancela el turno y no le gana el mismo horario
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \g /dev/null
set role authenticated;
do $$ begin
  assert (select count(*) from public.turnos) = 0 and (select count(*) from public.clientes) = 1, 'Nico ve datos de otro cliente';
  raise notice 'OK  cada cliente ve solo sus datos y sus turnos';
  begin
    perform public.cancelar_turno(current_setting('prueba.turno_juli')::uuid);
    raise exception 'FALLA: Nico canceló el turno de Juli';
  exception when no_data_found then raise notice 'OK  nadie cancela el turno de otro';
  end;
  begin
    perform public.reservar_turno(jsonb_build_object('lugar_id', 'losalamos', 'lugar', 'Los Álamos', 'cancha', 'Cancha 2',
      'fecha', current_date + 2, 'hora', '20:00', 'fin', '21:30', 'precio', 34000, 'sena', 8500));
    raise exception 'FALLA: el mismo horario se reservó dos veces';
  exception when unique_violation then raise notice 'OK  un horario de una cancha no se reserva dos veces';
  end;
end $$;
reset role;

-- Juli cancela con tiempo: la seña se devuelve y el horario queda libre para Nico
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.cancelar_turno(current_setting('prueba.turno_juli')::uuid);
  assert r ->> 'estado' = 'cancelado' and (r ->> 'devuelve')::boolean, 'cancelar: ' || r::text;
  r := public.cancelar_turno(current_setting('prueba.turno_juli')::uuid);
  assert r ->> 'estado' = 'cancelado', 'cancelar dos veces: ' || r::text;
  raise notice 'OK  cancelar con tiempo: la seña se devuelve (y cancelar dos veces no rompe nada)';
  -- corregir sus datos
  r := public.guardar_mis_datos('Julieta Paz', '261 555 9999', false);
  assert r ->> 'nombre' = 'Julieta Paz' and r ->> 'celular' = '261 555 9999' and not (r ->> 'promos')::boolean and r ->> 'email' = 'juli@prueba.com', 'datos: ' || r::text;
  begin
    perform public.guardar_mis_datos('Julieta', '12', true);
    raise exception 'FALLA: se guardó un celular sin números';
  exception when check_violation then null;
  end;
  raise notice 'OK  el cliente corrige su nombre, su celular y las promociones (el email no cambia)';
end $$;
reset role;

-- Turno en un negocio real: solo si está aprobado, y con el nombre y la ciudad que tiene en la base
insert into auth.users (email, raw_user_meta_data) values ('eva@prueba.com', '{"nombre":"Eva","negocio":"Cancha Eva","rubro":"Fútbol 5"}');
select set_config('prueba.neg_eva', (select id::text from public.negocios where email_dueno = 'eva@prueba.com'), false) \g /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'lugar_id', 'x', 'lugar', 'x', 'cancha', 'Cancha 1',
      'fecha', current_date + 4, 'hora', '21:00', 'fin', '22:00', 'precio', 40000, 'sena', 10000));
    raise exception 'FALLA: se reservó en un negocio pendiente';
  exception when no_data_found then raise notice 'OK  no se reserva en un negocio que todavía no está aprobado';
  end;
end $$;
reset role;
update public.negocios set estado = 'aprobado', ciudad = 'San Carlos' where id = current_setting('prueba.neg_eva')::uuid;
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'lugar_id', 'inventado', 'lugar', 'Nombre inventado',
    'zona', 'Otra', 'cancha', 'Cancha 1', 'fecha', current_date + 4, 'hora', '21:00', 'fin', '22:00', 'precio', 40000, 'sena', 10000));
  assert t ->> 'lugar' = 'Cancha Eva' and t ->> 'zona' = 'San Carlos' and t ->> 'lugar_id' = 'canchaeva' and t ->> 'negocio_id' = current_setting('prueba.neg_eva'),
    'el turno no tomó los datos del negocio: ' || t::text;
  raise notice 'OK  en un negocio aprobado, el turno queda atado a él, con su nombre y su ciudad de la base';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \g /dev/null
set role authenticated;
do $$
declare i int;
begin
  perform public.reservar_turno(jsonb_build_object('lugar_id', 'losalamos', 'lugar', 'Los Álamos', 'cancha', 'Cancha 2',
    'fecha', current_date + 2, 'hora', '20:00', 'fin', '21:30', 'precio', 34000, 'sena', 8500));
  raise notice 'OK  el horario cancelado se puede volver a reservar';
  for i in 1..9 loop
    perform public.reservar_turno(jsonb_build_object('lugar_id', 'parque', 'lugar', 'Tenis Club Parque', 'cancha', 'Cancha 1',
      'fecha', current_date + 3, 'hora', make_time(8 + i, 0, 0), 'fin', make_time(9 + i, 0, 0), 'precio', 12000, 'sena', 3000));
  end loop;
  begin
    perform public.reservar_turno(jsonb_build_object('lugar_id', 'parque', 'lugar', 'Tenis Club Parque', 'cancha', 'Cancha 2',
      'fecha', current_date + 3, 'hora', '09:00', 'fin', '10:00', 'precio', 12000, 'sena', 3000));
    raise exception 'FALLA: una cuenta reservó más de 10 turnos por delante';
  exception when check_violation then raise notice 'OK  hasta 10 turnos por delante por cuenta';
  end;
end $$;
reset role;

-- Una cuenta que ya existía (Caro, del equipo de un negocio) reserva: primero completa sus datos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
set role authenticated;
do $$ begin
  begin
    perform public.reservar_turno(jsonb_build_object('lugar_id', 'potrero', 'lugar', 'El Potrero', 'cancha', 'Cancha 1',
      'fecha', current_date + 1, 'hora', '21:00', 'fin', '22:00', 'precio', 48000, 'sena', 12000));
    raise exception 'FALLA: reservó una cuenta sin datos de cliente';
  exception when insufficient_privilege then null;
  end;
  perform public.guardar_mis_datos('Caro', '261 333 2222', false);
  perform public.reservar_turno(jsonb_build_object('lugar_id', 'potrero', 'lugar', 'El Potrero', 'cancha', 'Cancha 1',
    'fecha', current_date + 1, 'hora', '21:00', 'fin', '22:00', 'precio', 48000, 'sena', 12000));
  raise notice 'OK  una cuenta que ya existía completa sus datos y reserva';
  begin
    perform public.borrar_mi_cuenta();
    raise exception 'FALLA: se borró desde la página una cuenta que maneja un negocio';
  exception when insufficient_privilege then raise notice 'OK  una cuenta que maneja un negocio no se borra desde la página';
  end;
end $$;
reset role;

-- Nico borra su cuenta: se van sus datos y sus turnos
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false) \g /dev/null
set role authenticated;
do $$ begin assert public.borrar_mi_cuenta(); end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000e2')
     and not exists (select 1 from public.clientes where id = '00000000-0000-0000-0000-0000000000e2')
     and not exists (select 1 from public.turnos where cliente_id = '00000000-0000-0000-0000-0000000000e2'), 'quedaron datos de Nico';
  assert exists (select 1 from public.clientes where id = '00000000-0000-0000-0000-0000000000e1'), 'se borró otro cliente';
  raise notice 'OK  el cliente borra su cuenta: se borran sus datos y sus turnos, y nada de los demás';
end $$;
\echo 'Todas las pruebas del esquema pasaron.'
