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

-- Turno en un negocio de verdad (Cancha Eva): solo si está aprobado. El turno sale de su Mi negocio (cancha, horario,
-- precio, seña y cancelación), entra en su agenda, y la agenda y el turno del cliente quedan siempre de acuerdo.
insert into auth.users (email, raw_user_meta_data) values ('eva@prueba.com', '{"nombre":"Eva","negocio":"Cancha Eva","rubro":"Fútbol 5"}');
select set_config('prueba.neg_eva', (select id::text from public.negocios where email_dueno = 'eva@prueba.com'), false) \g /dev/null
select set_config('prueba.eva', (select id::text from auth.users where email = 'eva@prueba.com'), false) \g /dev/null
-- un día que no sea domingo (los domingos Cancha Eva cierra)
select set_config('prueba.dia_eva', (select (current_date + 4 + case when extract(dow from current_date + 4) = 0 then 1 else 0 end)::text), false) \g /dev/null
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1',
      'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1260));
    raise exception 'FALLA: se reservó en un negocio pendiente';
  exception when no_data_found then raise notice 'OK  no se reserva en un negocio que todavía no está aprobado';
  end;
end $$;
reset role;
update public.negocios set estado = 'aprobado', ciudad = 'San Carlos', direccion = 'Ruta 40 km 3', whatsapp = '2622 44 5566' where id = current_setting('prueba.neg_eva')::uuid;

-- Sin canchas ni horarios todavía: no aparece ni con su link
set role anon;
do $$ begin
  assert public.lugares_publicos('canchaeva') = '[]'::jsonb, 'apareció un negocio sin canchas ni horarios';
end $$;
reset role;
update public.negocios set ajustes = jsonb_build_object(
  'recursos', jsonb_build_array(jsonb_build_object('id', 'r1', 'nombre', 'Cancha 1', 'detalle', ''),
                                jsonb_build_object('id', 'r2', 'nombre', 'Cancha 2', 'detalle', 'Techada')),
  'duracion', 60,
  'horario', (select jsonb_agg(jsonb_build_object('abre', '18:00', 'cierra', '01:00', 'cerrado', d = 0) order by d) from generate_series(0, 6) d),
  'franjas', jsonb_build_array(jsonb_build_object('desde', '18:00', 'hasta', '20:00', 'precio', 40000),
                               jsonb_build_object('desde', '20:00', 'hasta', '01:00', 'precio', 50000)),
  'senaPct', 25, 'cancelarHoras', 12, 'devolverSena', true)
 where id = current_setting('prueba.neg_eva')::uuid;
-- Eva carga un turno a mano a las 19:00 en la cancha 1
insert into public.reservas (negocio_id, recurso, fecha, hora, cliente, wa, precio, estado, origen)
  values (current_setting('prueba.neg_eva')::uuid, 'r1', current_setting('prueba.dia_eva')::date, 1140, 'Pepe Mano', '2622 11 1111', 40000, 'confirmada', 'telefono');

-- La página, sin cuenta: lo ve con su link, no en la lista (todavía no cobra con Mercado Pago), y sin datos de nadie
set role anon;
do $$
declare l jsonb; o jsonb;
begin
  -- sin Mercado Pago también está en la lista (pedido del dueño, 27/11), con la seña en 0: no hay cómo cobrarla
  assert jsonb_array_length(public.lugares_publicos()) = 1, 'un negocio aprobado sin Mercado Pago no apareció en la lista';
  l := public.lugares_publicos('CanchaEva ');
  assert jsonb_array_length(l) = 1 and l -> 0 ->> 'nombre' = 'Cancha Eva' and l -> 0 ->> 'ciudad' = 'San Carlos'
     and l -> 0 ->> 'direccion' = 'Ruta 40 km 3' and (l -> 0 ->> 'duracion')::int = 60 and jsonb_array_length(l -> 0 -> 'recursos') = 2
     and (l -> 0 -> 'franjas' -> 1 ->> 'precio')::int = 50000 and (l -> 0 ->> 'senaPct')::numeric = 0 and (l -> 0 ->> 'publicado')::boolean
     and not (l -> 0 ->> 'cobra')::boolean
     and (l -> 0 -> 'horario' -> 0 ->> 'cerrado')::boolean and not (l -> 0 -> 'horario' -> 1 ->> 'cerrado')::boolean, 'lugar: ' || l::text;
  assert l::text not like '%eva@prueba.com%' and l::text not like '%2622 44 5566%' and l::text not like '%Pepe%' and l::text not like '%2622 11 1111%',
    'la página ve datos que no son para el público: ' || l::text;
  assert l -> 0 -> 'ocupados' @> jsonb_build_array(jsonb_build_array('r1', current_setting('prueba.dia_eva'), 1140)), 'falta el turno cargado a mano: ' || l::text;
  o := public.horarios_ocupados('canchaeva');
  assert o = l -> 0 -> 'ocupados', 'horarios_ocupados: ' || o::text;
  assert public.horarios_ocupados('noexiste') = '[]'::jsonb, 'un link que no existe trajo horarios';
  begin
    perform public.lugar_publico(x) from public.negocios x;
    raise exception 'FALLA: sin cuenta se leyó un negocio por fuera de lugares_publicos';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la página ve el negocio en la lista y con su link (sin Mercado Pago, sin seña), con sus horarios ocupados y sin datos de nadie';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb; r public.reservas%rowtype; d date := current_setting('prueba.dia_eva')::date;
begin
  -- lo que mande la página (precio, nombre, cancha) no cuenta: sale de la base
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2', 'fecha_agenda', d, 'minuto', 1260,
    'lugar_id', 'inventado', 'lugar', 'Nombre inventado', 'zona', 'Otra', 'cancha', 'Cancha 9', 'precio', 1, 'sena', 0, 'cancelar_horas', 0));
  assert t ->> 'lugar' = 'Cancha Eva' and t ->> 'zona' = 'San Carlos' and t ->> 'lugar_id' = 'canchaeva' and t ->> 'negocio_id' = current_setting('prueba.neg_eva')
     and t ->> 'cancha' = 'Cancha 2 · techada' and (t ->> 'fecha')::date = d and t ->> 'hora' = '21:00:00' and t ->> 'fin' = '22:00:00'
     and (t ->> 'precio')::int = 50000 and (t ->> 'sena')::int = 0 and (t ->> 'cancelar_horas')::int = 12 and (t ->> 'devuelve_sena')::boolean
     and t ->> 'servicio' = 'Turno de 60 min' and t ->> 'rubro' = 'Fútbol 5', 'el turno no salió de Mi negocio: ' || t::text;
  perform set_config('prueba.turno_eva', t ->> 'id', false);
  raise notice 'OK  en un negocio de verdad, la cancha, el horario, el precio y la cancelación salen de su Mi negocio (sin Mercado Pago, sin seña)';
  -- en la agenda del negocio, como un turno por el link, con el nombre y el celular del cliente
  reset role;
  select * into r from public.reservas where id = (t ->> 'reserva_id')::uuid;
  assert r.negocio_id = current_setting('prueba.neg_eva')::uuid and r.recurso = 'r2' and r.fecha = d and r.hora = 1260
     and r.cliente = 'Julieta Paz' and r.wa = '261 555 9999' and r.precio = 50000 and r.sena = 0 and r.estado = 'confirmada'
     and r.origen = 'link' and r.nota like '%' || (t ->> 'codigo') || '%' and r.nota not like '%prueba%', 'agenda: ' || to_jsonb(r)::text;
  raise notice 'OK  el turno entra en la agenda del negocio con el nombre y el celular del cliente (sin Mercado Pago, sin seña)';
  set role authenticated;
  -- un horario ocupado en la agenda (por el link o cargado a mano) no se reserva
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2', 'fecha_agenda', d, 'minuto', 1260));
    raise exception 'FALLA: se reservó dos veces el mismo horario de un negocio';
  exception when unique_violation then null;
  end;
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1', 'fecha_agenda', d, 'minuto', 1140));
    raise exception 'FALLA: se reservó un horario que el negocio ya tenía cargado a mano';
  exception when unique_violation then null;
  end;
  raise notice 'OK  un horario ocupado en la agenda del negocio (por la página o a mano) no se reserva';
  -- horarios que el negocio no tiene
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1', 'fecha_agenda', d, 'minuto', 1270));
    raise exception 'FALLA: se reservó a una hora que no es de las del negocio';
  exception when no_data_found then null;
  end;
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r9', 'fecha_agenda', d, 'minuto', 1260));
    raise exception 'FALLA: se reservó una cancha que no existe';
  exception when no_data_found then null;
  end;
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1', 'fecha_agenda', d, 'minuto', 1500));
    raise exception 'FALLA: se reservó un turno que termina después del cierre';
  exception when no_data_found then null;
  end;
  begin
    perform public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1',
      'fecha_agenda', d + (7 - extract(dow from d)::int) % 7, 'minuto', 1260));
    raise exception 'FALLA: se reservó un domingo, que el negocio cierra';
  exception when no_data_found then null;
  end;
  raise notice 'OK  no se reserva fuera de los horarios del negocio, en una cancha que no existe ni un día que cierra';
  -- el turno de las 00:00 que sigue a la noche es del día siguiente para el cliente, y de la noche anterior en la agenda
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1', 'fecha_agenda', d, 'minuto', 1440));
  assert (t ->> 'fecha')::date = d + 1 and t ->> 'hora' = '00:00:00' and t ->> 'fin' = '01:00:00' and (t ->> 'precio')::int = 50000, 'medianoche: ' || t::text;
  perform set_config('prueba.turno_eva_noche', t ->> 'id', false);
  reset role;
  assert exists (select 1 from public.reservas where id = (t ->> 'reserva_id')::uuid and fecha = d and hora = 1440), 'el turno de medianoche no quedó en la noche de la agenda';
  raise notice 'OK  el turno de las 00:00 queda en la noche de la agenda y en el día siguiente para el cliente';
end $$;
reset role;

-- Eva cancela desde el panel el turno de Juli: también se cancela el de Juli (y la seña se devuelve)
select set_config('prueba.reserva_eva', (select reserva_id::text from public.turnos where id = current_setting('prueba.turno_eva')::uuid), false) \g /dev/null
select set_config('request.jwt.claim.sub', current_setting('prueba.eva'), false) \g /dev/null
set role authenticated;
do $$ begin
  assert (select count(*) from public.turnos) = 0, 'el negocio ve los turnos de los clientes en su tabla';
  update public.reservas set estado = 'cancelada', retenida = false where id = current_setting('prueba.reserva_eva')::uuid;
  assert found, 'Eva no pudo cancelar el turno de su agenda';
  -- y aunque un panel abierto desde antes lo vuelva a poner confirmado, queda cancelado
  update public.reservas set estado = 'confirmada' where id = current_setting('prueba.reserva_eva')::uuid;
end $$;
reset role;
do $$
declare t public.turnos%rowtype;
begin
  select * into t from public.turnos where id = current_setting('prueba.turno_eva')::uuid;
  assert t.estado = 'cancelado' and t.cancelado_por = 'negocio' and t.devuelta, 'el negocio canceló y el turno del cliente: ' || to_jsonb(t)::text;
  assert (select estado from public.reservas where id = t.reserva_id) = 'cancelada', 'un turno cancelado volvió a la agenda';
  raise notice 'OK  si el negocio cancela desde el panel, se cancela también el turno del cliente (y no vuelve a la agenda)';
end $$;

-- Juli cancela el de medianoche: se libera en la agenda
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare r jsonb;
begin
  r := public.cancelar_turno(current_setting('prueba.turno_eva_noche')::uuid);
  assert r ->> 'estado' = 'cancelado' and r ->> 'cancelado_por' = 'cliente' and (r ->> 'devuelve')::boolean, 'cancelar: ' || r::text;
end $$;
reset role;
do $$ begin
  assert (select r.estado from public.reservas r join public.turnos t on t.reserva_id = r.id where t.id = current_setting('prueba.turno_eva_noche')::uuid) = 'cancelada',
    'el turno que canceló el cliente sigue ocupando la agenda';
  raise notice 'OK  si el cliente cancela, el horario se libera en la agenda del negocio';
end $$;

-- Si el negocio borra la fila de la agenda, el turno del cliente se cancela; y si el negocio no devuelve la seña, al cancelar no vuelve
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
select set_config('prueba.turno_eva_b', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1',
  'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1200)) ->> 'id'), false) \g /dev/null
reset role;
delete from public.reservas where id = (select reserva_id from public.turnos where id = current_setting('prueba.turno_eva_b')::uuid);
update public.negocios set ajustes = ajustes || '{"devolverSena": false}' where id = current_setting('prueba.neg_eva')::uuid;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb; r jsonb;
begin
  assert (select estado from public.turnos where id = current_setting('prueba.turno_eva_b')::uuid) = 'cancelado', 'se borró la fila de la agenda y el turno siguió';
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1',
    'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1200));
  assert not (t ->> 'devuelve_sena')::boolean, 'devolverSena: ' || t::text;
  r := public.cancelar_turno((t ->> 'id')::uuid);
  assert not (r ->> 'devuelve')::boolean, 'en un lugar que no devuelve la seña, se devolvió: ' || r::text;
  raise notice 'OK  si el negocio borra el turno de la agenda se cancela el del cliente, y si no devuelve la seña, no se devuelve';
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
-- La página del negocio (bookea.ar/nombre) la carga solo el equipo de Bookea (25/11: "la voy a vender como un servicio")
select set_config('request.jwt.claim.sub', current_setting('prueba.eva'), false) \g /dev/null
set role authenticated;
do $$
declare n text := current_setting('prueba.neg_eva');
begin
  begin
    update public.negocios set pagina = '{"frase": "La cambio yo"}' where id = n::uuid;
    raise exception 'FALLA: el negocio cambió su página';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.guardar_pagina(n::uuid, '{"frase": "La cambio yo"}'::jsonb);
    raise exception 'FALLA: el negocio guardó su página con guardar_pagina';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('negocios', n || '/mia.webp');
    raise exception 'FALLA: el negocio subió una foto a su carpeta';
  exception when insufficient_privilege then null;
  end;
  -- y Mi negocio sigue andando
  update public.negocios set descripcion = 'Fútbol 5 en Tunuyán' where id = n::uuid;
  assert found, 'Eva no pudo cambiar Mi negocio';
  raise notice 'OK  la página la carga el equipo de Bookea: el negocio no la cambia ni sube fotos (Mi negocio sí)';
end $$;
reset role;
-- su frase, su historia, solo sus propias fotos, sus redes y su WhatsApp si lo elige (la carga Caro, del equipo de Bookea)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
set role authenticated;
do $$
declare n text := current_setting('prueba.neg_eva');
begin
  perform public.guardar_pagina(n::uuid, jsonb_build_object(
    'frase', 'Fútbol con amigos desde 1998', 'historia', 'Empezamos con una cancha.' || chr(10) || 'Hoy tenemos dos.',
    'logo', 'https://x.supabase.co/storage/v1/object/public/negocios/' || n || '/logo-1.webp',
    'portada', 'https://otro-sitio.com/foto.jpg',
    'galeria', jsonb_build_array('https://x.supabase.co/storage/v1/object/public/negocios/' || n || '/g1.webp',
                                 'https://x.supabase.co/storage/v1/object/public/negocios/00000000-0000-0000-0000-000000000000/ajena.webp'),
    'instagram', 'https://www.instagram.com/canchaeva/?hl=es', 'tiktok', '@canchaeva', 'facebook', 'Cancha Eva', 'mostrar_whatsapp', false,
    'servicios', jsonb_build_array('vest', 'est', '<script>', 5, 'Parrilla con espacios'),
    'tarjetas', jsonb_build_object(
      'lugar', jsonb_build_array('https://x.supabase.co/storage/v1/object/public/negocios/' || n || '/t1.webp',
                                 'https://x.supabase.co/storage/v1/object/public/negocios/' || n || '/t2.webp',
                                 'https://x.supabase.co/storage/v1/object/public/negocios/' || n || '/t3.webp'),
      'serv', jsonb_build_array('https://otro-sitio.com/foto.jpg'),
      'ubi', 'no es una lista')));
  -- las fotos: a la carpeta de un negocio sí; sueltas, no
  insert into storage.objects (bucket_id, name) values ('negocios', n || '/logo-1.webp');
  begin
    insert into storage.objects (bucket_id, name) values ('negocios', 'suelta.webp');
    raise exception 'FALLA: se subió una foto fuera de la carpeta de un negocio';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  fotos de la página: el equipo de Bookea sube a la carpeta de un negocio, y nada suelto';
end $$;
reset role;
set role anon;
do $$
declare pg jsonb := public.lugares_publicos('canchaeva') -> 0 -> 'pagina';
begin
  assert pg ->> 'frase' = 'Fútbol con amigos desde 1998' and pg ->> 'historia' like 'Empezamos con una cancha.%Hoy tenemos dos.', 'página: ' || coalesce(pg::text, 'nada');
  assert pg ->> 'logo' like '%/negocios/' || current_setting('prueba.neg_eva') || '/logo-1.webp' and pg -> 'portada' = 'null'::jsonb
     and jsonb_array_length(pg -> 'galeria') = 1, 'fotos de la página (solo las de su carpeta): ' || pg::text;
  assert pg ->> 'instagram' = 'canchaeva' and pg ->> 'tiktok' = 'canchaeva' and pg ->> 'facebook' = 'CanchaEva' and pg ->> 'whatsapp' = '', 'redes: ' || pg::text;
  assert pg -> 'servicios' = '["vest", "est"]'::jsonb, 'servicios (solo claves cortas): ' || coalesce(pg -> 'servicios', 'null'::jsonb)::text;
  assert jsonb_array_length(pg #> '{tarjetas,lugar}') = 2 and pg #>> '{tarjetas,lugar,1}' like '%/t2.webp'
     and pg #> '{tarjetas,serv}' = '[]'::jsonb and pg #> '{tarjetas,ubi}' = '[]'::jsonb,
     'fotos de las tarjetas (hasta dos, solo de su carpeta): ' || coalesce(pg -> 'tarjetas', 'null'::jsonb)::text;
  begin
    insert into storage.objects (bucket_id, name) values ('negocios', current_setting('prueba.neg_eva') || '/sin-cuenta.webp');
    raise exception 'FALLA: sin cuenta se subió una foto';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la página del negocio: su frase, su historia, solo sus propias fotos (también las de sus tarjetas, hasta dos), sus servicios y sus redes (sin su WhatsApp si no lo eligió)';
end $$;
reset role;
update public.negocios set pagina = pagina || '{"mostrar_whatsapp": true}' where id = current_setting('prueba.neg_eva')::uuid;
set role anon;
do $$ begin
  assert public.lugares_publicos('canchaeva') -> 0 -> 'pagina' ->> 'whatsapp' = '2622 44 5566', 'el WhatsApp que eligió mostrar no aparece';
  raise notice 'OK  si elige mostrar su WhatsApp, aparece en su página';
end $$;
reset role;

-- El equipo de Bookea arma la página de cualquier negocio (25/11: "lo voy a cargar yo"); otro negocio no puede
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false) \g /dev/null
set role authenticated;
do $$
declare n uuid := current_setting('prueba.neg_eva')::uuid;
begin
  perform public.guardar_pagina(n, jsonb_build_object('frase', 'Cargada por Bookea', 'servicios', jsonb_build_array('pileta', 'quincho')));
  insert into storage.objects (bucket_id, name) values ('negocios', n::text || '/portada-bookea.webp');
  raise notice 'OK  el equipo de Bookea guarda la página de cualquier negocio y sube fotos a su carpeta';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false) \g /dev/null
set role authenticated;
do $$
declare n uuid := current_setting('prueba.neg_eva')::uuid;
begin
  begin
    perform public.guardar_pagina(n, '{"frase": "Hackeada"}'::jsonb);
    raise exception 'FALLA: otro negocio cambió una página que no es suya';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('negocios', n::text || '/intrusa.webp');
    raise exception 'FALLA: otro negocio subió una foto a una carpeta que no es suya';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  un negocio no puede cambiar la página de otro ni subir fotos a su carpeta';
end $$;
reset role;
set role anon;
do $$
declare pg jsonb := public.lugares_publicos('canchaeva') -> 0 -> 'pagina';
begin
  assert pg ->> 'frase' = 'Cargada por Bookea' and pg -> 'servicios' = '["pileta", "quincho"]'::jsonb, 'la página que cargó Bookea: ' || pg::text;
  begin
    perform public.guardar_pagina(current_setting('prueba.neg_eva')::uuid, '{}'::jsonb);
    raise exception 'FALLA: sin cuenta se cambió una página';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  la página que cargó Bookea se ve en la página del negocio (y sin cuenta no se puede cambiar)';
end $$;
reset role;

-- =============== Mercado Pago: el negocio cobra la seña con su cuenta (26/11) ===============
-- (las llaves de estas pruebas son inventadas: PRUEBA_LLAVE_… y PRUEBA_RENOVAR_…)
-- Lo de Mercado Pago lo usa solo la función (service_role): desde la página o el panel no se toca
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare f text;
begin
  foreach f in array array['mp_empezar_conexion(''' || current_setting('prueba.neg_eva') || '''::uuid, auth.uid())',
      'mp_tomar_estado(''x'')', 'mp_llaves(''' || current_setting('prueba.neg_eva') || '''::uuid)', 'mp_por_devolver()',
      'mp_resultado(''ORD1'', ''processed'', ''accredited'', 1)', 'mp_guardar_cuenta(''' || current_setting('prueba.neg_eva') || '''::uuid, null, ''{}''::jsonb)'] loop
    begin
      execute 'select public.' || f;
      raise exception 'FALLA: un cliente usó public.%', f;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform 1 from public.mp_cuentas;
    raise exception 'FALLA: un cliente leyó las cuentas de Mercado Pago';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.mi_mercado_pago(current_setting('prueba.neg_eva')::uuid);
    raise exception 'FALLA: un cliente vio la conexión de Mercado Pago de un negocio';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK  Mercado Pago: las llaves, los cobros y la conexión no se tocan desde la página ni con la cuenta de un cliente';
end $$;
reset role;

-- Conectar: solo el dueño; el pedido sirve una vez, por 15 minutos, y el desafío PKCE sale del verificador
set role service_role;
do $$
declare r jsonb; x public.mp_estados%rowtype; t jsonb;
begin
  begin
    perform public.mp_empezar_conexion(current_setting('prueba.neg_eva')::uuid, '00000000-0000-0000-0000-0000000000e1');
    raise exception 'FALLA: alguien que no es el dueño empezó a conectar Mercado Pago';
  exception when insufficient_privilege then null;
  end;
  r := public.mp_empezar_conexion(current_setting('prueba.neg_eva')::uuid, current_setting('prueba.eva')::uuid);
  assert r ->> 'estado' ~ '^[0-9a-f]{64}$' and r ->> 'desafio' ~ '^[A-Za-z0-9_-]{43}$', 'pedido de conexión: ' || r::text;
  reset role;
  select * into x from public.mp_estados where estado = r ->> 'estado';
  assert translate(rtrim(encode(sha256(convert_to(x.verificador, 'UTF8')), 'base64'), '='), '+/', '-_') = r ->> 'desafio'
     and x.verificador <> x.estado, 'el desafío no sale del verificador';
  set role service_role;
  t := public.mp_tomar_estado(r ->> 'estado');
  assert t ->> 'negocio' = current_setting('prueba.neg_eva') and t ->> 'quien' = current_setting('prueba.eva') and t ->> 'verificador' = x.verificador, 'tomar: ' || coalesce(t::text, 'nada');
  assert public.mp_tomar_estado(r ->> 'estado') is null, 'el pedido de conexión sirvió dos veces';
  -- uno de hace más de 15 minutos ya no sirve
  r := public.mp_empezar_conexion(current_setting('prueba.neg_eva')::uuid, current_setting('prueba.eva')::uuid);
  reset role;
  update public.mp_estados set creado = now() - interval '16 minutes' where estado = r ->> 'estado';
  set role service_role;
  assert public.mp_tomar_estado(r ->> 'estado') is null, 'sirvió un pedido de conexión vencido';
  raise notice 'OK  conectar Mercado Pago: solo el dueño, el pedido sirve una vez y por 15 minutos, y el desafío PKCE sale del verificador';
end $$;
reset role;

-- Las llaves quedan en Vault (no en la tabla); al renovarlas se pisan las mismas
set role service_role;
do $$
declare r jsonb; ll jsonb;
begin
  begin
    perform public.mp_guardar_cuenta(current_setting('prueba.neg_eva')::uuid, current_setting('prueba.eva')::uuid, '{"access_token": "x"}');
    raise exception 'FALLA: se guardó una cuenta sin llaves';
  exception when invalid_parameter_value then null;
  end;
  r := public.mp_guardar_cuenta(current_setting('prueba.neg_eva')::uuid, current_setting('prueba.eva')::uuid,
    '{"access_token": "PRUEBA_LLAVE_uno_0123456789", "refresh_token": "PRUEBA_RENOVAR_uno",
      "user_id": 555, "expires_in": 15552000, "live_mode": true}');
  assert (r ->> 'conectado')::boolean and r ->> 'cuenta' = '555', 'guardar: ' || r::text;
  ll := public.mp_llaves(current_setting('prueba.neg_eva')::uuid);
  assert ll ->> 'llave' = 'PRUEBA_LLAVE_uno_0123456789' and ll ->> 'renovar' = 'PRUEBA_RENOVAR_uno' and ll ->> 'usuario' = '555'
     and (ll ->> 'vence')::timestamptz > now() + interval '179 days', 'llaves: ' || ll::text;
end $$;
reset role;
do $$
declare n int;
begin
  assert (select to_jsonb(c)::text from public.mp_cuentas c where negocio_id = current_setting('prueba.neg_eva')::uuid) not like '%PRUEBA_%',
    'las llaves quedaron en la tabla y no en Vault';
  select count(*) into n from vault.secrets;
  perform set_config('prueba.secretos', n::text, false);
  assert public.tiene_mercado_pago(current_setting('prueba.neg_eva')::uuid) and public.en_la_lista(current_setting('prueba.neg_eva')::uuid), 'no quedó conectado';
end $$;
set role service_role;
select public.mp_guardar_cuenta(current_setting('prueba.neg_eva')::uuid, null,
  '{"access_token": "PRUEBA_LLAVE_dos_0123456789", "refresh_token": "PRUEBA_RENOVAR_dos", "user_id": "555", "expires_in": 100}') \g /dev/null
reset role;
do $$ begin
  assert (select count(*) from vault.secrets) = current_setting('prueba.secretos')::int, 'al renovar se crearon llaves nuevas en Vault';
  assert (select decrypted_secret from vault.decrypted_secrets d join public.mp_cuentas c on c.llave_id = d.id
           where c.negocio_id = current_setting('prueba.neg_eva')::uuid) = 'PRUEBA_LLAVE_dos_0123456789', 'no se renovó la llave';
  assert (select quien from public.mp_cuentas where negocio_id = current_setting('prueba.neg_eva')::uuid) = current_setting('prueba.eva')::uuid,
    'al renovar se perdió quién la conectó';
  raise notice 'OK  las llaves de Mercado Pago quedan en Vault, cifradas, y al renovarlas se pisan las mismas';
end $$;

-- Conectado: aparece en la lista y la página sabe que la seña se cobra. Con una cuenta de prueba de Mercado Pago, solo por su link.
update public.negocios set ajustes = ajustes || '{"devolverSena": true}' where id = current_setting('prueba.neg_eva')::uuid;
set role anon;
do $$
declare l jsonb := public.lugares_publicos();
begin
  assert jsonb_array_length(l) = 1 and l -> 0 ->> 'slug' = 'canchaeva' and (l -> 0 ->> 'publicado')::boolean and (l -> 0 ->> 'cobra')::boolean, 'lista: ' || l::text;
  assert l::text not like '%PRUEBA_%', 'la página ve las llaves';
end $$;
reset role;
update public.mp_cuentas set real = false where negocio_id = current_setting('prueba.neg_eva')::uuid;
set role anon;
do $$ begin
  assert public.lugares_publicos() = '[]'::jsonb and (public.lugares_publicos('canchaeva') -> 0 ->> 'cobra')::boolean, 'cuenta de prueba de Mercado Pago';
  raise notice 'OK  con Mercado Pago conectado aparece en la lista y cobra la seña (con una cuenta de prueba de Mercado Pago, solo por su link)';
end $$;
reset role;
update public.mp_cuentas set real = true where negocio_id = current_setting('prueba.neg_eva')::uuid;

-- La comisión de Bookea sale de la seña (acá, con 10 %)
create or replace function public.bookea_comision_pct() returns numeric language sql immutable as $$ select 10::numeric $$;
do $$ begin
  assert public.comision_de(12500) = 1250 and public.comision_de(0) = 0 and public.comision_de(1) = 0, 'comisión';
end $$;

-- Juli reserva: el turno queda esperando el pago 20 minutos, también en la agenda, con la seña en 0
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2',
    'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1320));
  assert t ->> 'estado' = 'pendiente' and t ->> 'pago' = 'pendiente' and (t ->> 'sena')::int = 12500 and (t ->> 'comision')::int = 1250
     and (t ->> 'vence')::timestamptz between now() + interval '19 minutes' and now() + interval '21 minutes', 'pendiente: ' || t::text;
  perform set_config('prueba.mp_turno', t ->> 'id', false);
  -- nadie le gana el horario mientras paga
  assert public.horarios_ocupados('canchaeva') @> jsonb_build_array(jsonb_build_array('r2', current_setting('prueba.dia_eva'), 1320)), 'el que espera el pago no ocupa el horario';
end $$;
reset role;
do $$
declare r public.reservas%rowtype;
begin
  select * into r from public.reservas where id = (select reserva_id from public.turnos where id = current_setting('prueba.mp_turno')::uuid);
  assert r.sena = 0 and r.estado = 'confirmada' and r.nota like '%Esperando que pague la seña de $ 12500 con Mercado Pago%', 'agenda: ' || to_jsonb(r)::text;
  raise notice 'OK  con Mercado Pago, el turno queda esperando el pago 20 minutos: ocupa el horario y está en la agenda con la seña en 0';
end $$;

-- La función pide los datos del cobro (solo el cliente del turno) y anota el cobro que armó
set role service_role;
do $$
declare d jsonb;
begin
  begin
    perform public.mp_datos_cobro(current_setting('prueba.mp_turno')::uuid, '00000000-0000-0000-0000-00000000000c');
    raise exception 'FALLA: otra cuenta pidió cobrar el turno de Juli';
  exception when no_data_found then null;
  end;
  d := public.mp_datos_cobro(current_setting('prueba.mp_turno')::uuid, '00000000-0000-0000-0000-0000000000e1');
  assert d ->> 'estado' = 'pendiente' and (d ->> 'monto')::int = 12500 and (d ->> 'comision')::int = 1250 and d ->> 'email' = 'juli@prueba.com'
     and (d ->> 'cobra')::boolean and (d ->> 'minutos')::int between 18 and 20 and d -> 'abiertos' = '[]'::jsonb
     and d ->> 'titulo' like 'Seña · Cancha Eva · %22:00 · Cancha 2 · techada', 'datos del cobro: ' || d::text;
  perform public.mp_cobro_creado(current_setting('prueba.mp_turno')::uuid, 'ORDTST01', 'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=ORDTST01', 12500, 1250);
  d := public.mp_datos_cobro(current_setting('prueba.mp_turno')::uuid, '00000000-0000-0000-0000-0000000000e1');
  assert d -> 'abiertos' -> 0 ->> 'orden' = 'ORDTST01' and (d ->> 'intento')::int = 1, 'cobro abierto: ' || d::text;
  -- con una cuenta de prueba de Mercado Pago no va el mail del cliente (en modo prueba, Mercado Pago rechaza un mail real)
  reset role;
  update public.mp_cuentas set real = false where negocio_id = current_setting('prueba.neg_eva')::uuid;
  set role service_role;
  assert public.mp_datos_cobro(current_setting('prueba.mp_turno')::uuid, '00000000-0000-0000-0000-0000000000e1') ->> 'email' = '',
    'con una cuenta de prueba fue el mail del cliente';
  reset role;
  update public.mp_cuentas set real = true where negocio_id = current_setting('prueba.neg_eva')::uuid;
  set role service_role;
  assert public.mp_cobro('ORDTST01') ->> 'negocio' = current_setting('prueba.neg_eva'), 'cobro: ' || public.mp_cobro('ORDTST01')::text;
  -- mientras no se acredite, nada cambia; si dice que se pagó menos que la seña, no se confirma
  assert public.mp_resultado('ORDTST01', 'action_required', 'waiting_payment', 0) ->> 'accion' = 'nada', 'en curso';
  begin
    perform public.mp_resultado('ORDTST01', 'processed', 'accredited', 100);
    raise exception 'FALLA: se confirmó un pago menor que la seña';
  exception when invalid_parameter_value then null;
  end;
  assert public.mp_resultado('ORDTST99', 'processed', 'accredited', 12500) ->> 'accion' = 'desconocido', 'una orden que no es de Bookea';
  raise notice 'OK  la función cobra solo el turno del cliente, con la seña y la comisión de la base, y anota el cobro';
end $$;
reset role;

-- Se acredita: el turno queda confirmado y la seña aparece en la agenda. Si avisa dos veces, no pasa nada más.
set role service_role;
do $$
declare r jsonb;
begin
  r := public.mp_resultado('ORDTST01', 'processed', 'accredited', 12500);
  assert r ->> 'accion' = 'confirmado' and r ->> 'turno' = current_setting('prueba.mp_turno'), 'resultado: ' || r::text;
  assert public.mp_resultado('ORDTST01', 'processed', 'accredited', 12500) ->> 'accion' = 'nada', 'el mismo pago se procesó dos veces';
end $$;
reset role;
do $$
declare t public.turnos%rowtype; r public.reservas%rowtype;
begin
  select * into t from public.turnos where id = current_setting('prueba.mp_turno')::uuid;
  select * into r from public.reservas where id = t.reserva_id;
  assert t.estado = 'confirmado' and t.pago = 'aprobado' and t.pagado is not null and t.vence is null, 'turno pagado: ' || to_jsonb(t)::text;
  assert r.sena = 12500 and r.nota like '%Seña de $ 12500 pagada con Mercado Pago%', 'agenda pagada: ' || to_jsonb(r)::text;
  assert (select estado from public.mp_cobros where orden = 'ORDTST01') = 'aprobado', 'el cobro no quedó aprobado';
  raise notice 'OK  al acreditarse la seña el turno queda confirmado y la seña aparece en la agenda (una sola vez)';
end $$;

-- Si alguien paga dos veces el mismo turno, el segundo pago se devuelve
set role service_role;
select public.mp_cobro_creado(current_setting('prueba.mp_turno')::uuid, 'ORDTST02', 'https://x', 12500, 1250) \g /dev/null
do $$ begin
  assert public.mp_resultado('ORDTST02', 'processed', 'accredited', 12500) ->> 'accion' = 'devolver', 'doble pago';
  assert public.mp_por_devolver() @> '[{"orden": "ORDTST02"}]'::jsonb, 'el doble pago no quedó para devolver: ' || public.mp_por_devolver()::text;
  raise notice 'OK  si se paga dos veces el mismo turno, el segundo pago queda para devolver';
end $$;
reset role;

-- Juli cancela con tiempo: la seña queda para devolver; la función la devuelve (o reintenta si Mercado Pago no deja)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$ begin
  assert (public.cancelar_turno(current_setting('prueba.mp_turno')::uuid) ->> 'devuelve')::boolean, 'cancelar con tiempo';
end $$;
reset role;
set role service_role;
do $$
declare p jsonb := public.mp_por_devolver();
begin
  assert p @> '[{"orden": "ORDTST01"}, {"orden": "ORDTST02"}]'::jsonb and p -> 0 ->> 'negocio' = current_setting('prueba.neg_eva'), 'cola: ' || p::text;
  perform public.mp_devolucion('ORDTST01', true, 'refunded');
  perform public.mp_devolucion('ORDTST02', false, 'sin saldo');
  p := public.mp_por_devolver();
  assert not p @> '[{"orden": "ORDTST01"}]'::jsonb and p @> '[{"orden": "ORDTST02", "intentos": 1}]'::jsonb, 'cola después: ' || p::text;
end $$;
reset role;
do $$ begin
  assert (select pago from public.turnos where id = current_setting('prueba.mp_turno')::uuid) = 'devuelto', 'el turno no dice que se devolvió';
  assert (select estado || devolucion from public.mp_cobros where orden = 'ORDTST01') = 'devueltohecha', 'el cobro no dice que se devolvió';
  update public.mp_cobros set intentos = 47 where orden = 'ORDTST02';
end $$;
set role service_role;
select public.mp_devolucion('ORDTST02', false, 'sin saldo') \g /dev/null
reset role;
do $$ begin
  assert (select devolucion from public.mp_cobros where orden = 'ORDTST02') = 'fallo', 'después de 48 intentos sigue en la cola';
  update public.mp_cobros set devolucion = 'hecha' where orden = 'ORDTST02';
  raise notice 'OK  al cancelar con tiempo la seña queda para devolver; la función la devuelve o reintenta (48 veces y queda para el negocio)';
end $$;

-- Si nadie paga a tiempo, el horario se libera solo y sale de la agenda; si el pago llega igual, se devuelve
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
select set_config('prueba.mp_vence', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2',
  'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1380)) ->> 'id'), false) \g /dev/null
reset role;
set role service_role;
select public.mp_cobro_creado(current_setting('prueba.mp_vence')::uuid, 'ORDTST03', 'https://x', 12500, 1250) \g /dev/null
reset role;
update public.turnos set vence = now() - interval '1 minute' where id = current_setting('prueba.mp_vence')::uuid;
select set_config('prueba.mp_vence_r', (select reserva_id::text from public.turnos where id = current_setting('prueba.mp_vence')::uuid), false) \g /dev/null
set role anon;
do $$ begin
  assert not public.horarios_ocupados('canchaeva') @> jsonb_build_array(jsonb_build_array('r2', current_setting('prueba.dia_eva'), 1380)),
    'un turno vencido sin pagar sigue ocupando el horario en la página';
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.eva'), false) \g /dev/null
set role authenticated;
do $$ begin
  assert public.vencer_pendientes() = 1, 'el panel no liberó el turno vencido';
end $$;
reset role;
do $$
declare t public.turnos%rowtype;
begin
  select * into t from public.turnos where id = current_setting('prueba.mp_vence')::uuid;
  assert t.estado = 'cancelado' and t.cancelado_por = 'sin_pago' and not exists (select 1 from public.reservas where id = current_setting('prueba.mp_vence_r')::uuid),
    'vencido: ' || to_jsonb(t)::text;
end $$;
set role service_role;
do $$ begin
  assert public.mp_resultado('ORDTST03', 'processed', 'accredited', 12500) ->> 'accion' = 'devolver', 'pago tardío';
  raise notice 'OK  si nadie paga a tiempo, el horario se libera solo (y sale de la agenda); si el pago llega igual, se devuelve';
end $$;
reset role;
update public.mp_cobros set devolucion = 'hecha' where orden = 'ORDTST03';

-- Cancelar uno que espera el pago: sale de la agenda y no hay nada que devolver. El negocio también puede sacarlo.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb; r jsonb;
begin
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2',
    'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1380));
  r := public.cancelar_turno((t ->> 'id')::uuid);
  assert r ->> 'estado' = 'cancelado' and not (r ->> 'devuelve')::boolean, 'cancelar pendiente: ' || r::text;
  perform set_config('prueba.mp_r1', t ->> 'reserva_id', false);
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2',
    'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1380));
  perform set_config('prueba.mp_t2', t ->> 'id', false);
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.reservas where id = current_setting('prueba.mp_r1')::uuid), 'el pendiente cancelado sigue en la agenda';
  delete from public.reservas where id = (select reserva_id from public.turnos where id = current_setting('prueba.mp_t2')::uuid);
  assert (select estado || cancelado_por || devuelta::text from public.turnos where id = current_setting('prueba.mp_t2')::uuid) = 'canceladonegociofalse',
    'el negocio sacó de la agenda uno que esperaba el pago';
  raise notice 'OK  cancelar uno que espera el pago lo saca de la agenda (también si lo saca el negocio), sin nada que devolver';
end $$;

-- El panel ve cómo está la conexión; solo el dueño la desconecta, y no mientras alguien está pagando
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
select set_config('prueba.mp_t3', (public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1',
  'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1320)) ->> 'id'), false) \g /dev/null
do $$ begin
  begin
    perform public.mp_desconectar(current_setting('prueba.neg_eva')::uuid);
    raise exception 'FALLA: un cliente desconectó el Mercado Pago de un negocio';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', current_setting('prueba.eva'), false) \g /dev/null
set role authenticated;
do $$
declare m jsonb := public.mi_mercado_pago(current_setting('prueba.neg_eva')::uuid);
begin
  assert (m ->> 'conectado')::boolean and m ->> 'cuenta' = '555' and (m ->> 'dueno')::boolean and (m ->> 'real')::boolean
     and (m ->> 'sin_devolver')::int = 0 and m::text not like '%PRUEBA_%', 'mi_mercado_pago: ' || m::text;
  begin
    perform public.mp_desconectar(current_setting('prueba.neg_eva')::uuid);
    raise exception 'FALLA: se desconectó con un cliente pagando';
  exception when object_in_use then null;
  end;
end $$;
reset role;
update public.turnos set vence = now() - interval '1 minute' where id = current_setting('prueba.mp_t3')::uuid;
set role authenticated;
do $$ begin
  assert public.mp_desconectar(current_setting('prueba.neg_eva')::uuid), 'no se pudo desconectar';
  assert not (public.mi_mercado_pago(current_setting('prueba.neg_eva')::uuid) ->> 'conectado')::boolean, 'sigue conectado';
end $$;
reset role;
do $$ begin
  assert (select count(*) from vault.secrets where name like 'mercadopago_%') = 0, 'al desconectar quedaron las llaves en Vault';
  assert not public.tiene_mercado_pago(current_setting('prueba.neg_eva')::uuid) and public.en_la_lista(current_setting('prueba.neg_eva')::uuid)
     and (public.lugares_publicos() -> 0 ->> 'senaPct')::numeric = 0, 'desconectado sigue cobrando (o salió de la lista)';
  raise notice 'OK  el panel ve la conexión sin las llaves; solo el dueño la desconecta (no con alguien pagando) y se borran las llaves';
end $$;

-- Sin Mercado Pago, el turno se confirma enseguida y no se cobra (como antes)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r1',
    'fecha_agenda', current_setting('prueba.dia_eva'), 'minuto', 1380));
  assert t ->> 'estado' = 'confirmado' and t ->> 'pago' = '' and t ->> 'vence' is null and (t ->> 'comision')::int = 0 and (t ->> 'sena')::int = 0, 'sin Mercado Pago: ' || t::text;
  raise notice 'OK  sin Mercado Pago el turno se confirma enseguida y va sin seña';
end $$;
reset role;

-- Sin seña (pregunta del dueño, 27/11): con la seña en 0 %, el turno se confirma enseguida aunque el negocio tenga
-- Mercado Pago (no va a pagar nada), sin nota de "en prueba"; y el negocio está en la lista sin conectar Mercado Pago
set role anon;
do $$ begin
  assert (public.lugares_publicos() -> 0 ->> 'publicado')::boolean and (public.lugares_publicos() -> 0 ->> 'senaPct')::numeric = 0,
    'un negocio que pide seña sin Mercado Pago no está en la lista sin seña';
end $$;
reset role;
update public.negocios set ajustes = ajustes || '{"senaPct": 0}' where id = current_setting('prueba.neg_eva')::uuid;
set role anon;
do $$
declare l jsonb := public.lugares_publicos();
begin
  assert jsonb_array_length(l) = 1 and l -> 0 ->> 'id' = current_setting('prueba.neg_eva') and (l -> 0 ->> 'publicado')::boolean
     and not (l -> 0 ->> 'cobra')::boolean and (l -> 0 ->> 'senaPct')::numeric = 0, 'sin seña, en la lista: ' || l::text;
end $$;
reset role;
set role service_role;
select public.mp_guardar_cuenta(current_setting('prueba.neg_eva')::uuid, current_setting('prueba.eva')::uuid,
  '{"access_token": "PRUEBA_LLAVE_tres_0123456789", "refresh_token": "PRUEBA_RENOVAR_tres", "user_id": 555, "expires_in": 15552000, "live_mode": true}') \g /dev/null
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare t jsonb;
begin
  t := public.reservar_turno(jsonb_build_object('negocio_id', current_setting('prueba.neg_eva'), 'recurso', 'r2',
    'fecha_agenda', (current_setting('prueba.dia_eva')::date + 7)::text, 'minuto', 1200));
  assert t ->> 'estado' = 'confirmado' and t ->> 'pago' = '' and (t ->> 'sena')::int = 0 and t ->> 'vence' is null
     and (t ->> 'comision')::int = 0 and (t ->> 'precio')::int = 50000, 'sin seña: ' || t::text;
  perform set_config('prueba.sin_sena', t ->> 'id', false);
end $$;
reset role;
do $$
declare r public.reservas%rowtype;
begin
  select * into r from public.reservas where id = (select reserva_id from public.turnos where id = current_setting('prueba.sin_sena')::uuid);
  assert r.sena = 0 and r.estado = 'confirmada' and r.nota not like '%prueba%' and r.nota not like '%Esperando%', 'agenda sin seña: ' || to_jsonb(r)::text;
  assert not exists (select 1 from public.mp_cobros where turno_id = current_setting('prueba.sin_sena')::uuid), 'sin seña se armó un cobro';
end $$;
set role service_role;
do $$
declare d jsonb := public.mp_datos_cobro(current_setting('prueba.sin_sena')::uuid, '00000000-0000-0000-0000-0000000000e1');
begin
  assert d ->> 'estado' = 'confirmado' and (d ->> 'monto')::int = 0, 'la función cobraría un turno sin seña: ' || d::text;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false) \g /dev/null
set role authenticated;
do $$
declare c jsonb := public.cancelar_turno(current_setting('prueba.sin_sena')::uuid);
begin
  assert not exists (select 1 from public.turnos where id = current_setting('prueba.sin_sena')::uuid and estado <> 'cancelado'), 'no se canceló';
  raise notice 'OK  sin seña (0 %%), el turno se confirma enseguida aunque haya Mercado Pago, sin cobro ni nota de prueba, y el negocio está en la lista';
end $$;
reset role;
-- vuelve como estaba: pide seña y sin Mercado Pago
update public.negocios set ajustes = ajustes || '{"senaPct": 25}' where id = current_setting('prueba.neg_eva')::uuid;
delete from public.mp_cuentas where negocio_id = current_setting('prueba.neg_eva')::uuid;
-- Para estar en la lista (pedido del dueño, 27/11): ciudad y teléfono "sí o sí", y no las cuentas del equipo de Bookea.
-- Con su link se abre igual.
do $$
declare n uuid := current_setting('prueba.neg_eva')::uuid; c text; w text;
begin
  select ciudad, whatsapp into c, w from public.negocios where id = n;
  assert public.en_la_lista(n) and public.lista_faltan(n) = '{}'::text[], 'con todo, debería estar en la lista: ' || public.lista_faltan(n)::text;
  update public.negocios set ciudad = '  ' where id = n;
  assert not public.en_la_lista(n) and public.lista_faltan(n) = array['ciudad'], 'sin ciudad: ' || public.lista_faltan(n)::text;
  update public.negocios set ciudad = c, whatsapp = '261 55-1' where id = n;
  assert not public.en_la_lista(n) and public.lista_faltan(n) = array['telefono'], 'teléfono corto: ' || public.lista_faltan(n)::text;
  update public.negocios set whatsapp = '' where id = n;
  assert not public.en_la_lista(n), 'sin teléfono estuvo en la lista';
  update public.negocios set whatsapp = w where id = n;
  insert into public.admins_bookea (user_id) values (current_setting('prueba.eva')::uuid);
  assert not public.en_la_lista(n) and public.lista_faltan(n) = array['equipo'], 'dueño del equipo de Bookea: ' || public.lista_faltan(n)::text;
  assert jsonb_array_length(public.lugares_publicos()) = 0 and jsonb_array_length(public.lugares_publicos('canchaeva')) = 1,
    'fuera de la lista tiene que abrirse igual con su link';
  delete from public.admins_bookea where user_id = current_setting('prueba.eva')::uuid;
  assert public.en_la_lista(n), 'no volvió a la lista';
  raise notice 'OK  la lista pide ciudad y teléfono (al menos 8 números) y deja afuera las cuentas del equipo de Bookea; con el link se abre igual';
end $$;
create or replace function public.bookea_comision_pct() returns numeric language sql immutable as $$ select 0::numeric $$;

\echo 'Todas las pruebas del esquema pasaron.'
