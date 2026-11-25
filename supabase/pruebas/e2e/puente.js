// Servidor de prueba: sirve la carpeta de Bookea y responde como un "Supabase de juguete"
// sobre el Postgres local. Cada consulta corre con el rol "authenticated" y el id de la cuenta,
// así las reglas de permisos (RLS) de supabase/esquema.sql se aplican de verdad.
// Solo para pruebas: no usa contraseñas reales ni JWT.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const RAIZ = path.resolve(__dirname, '../../..');
const BASE = process.env.BASE || 'bookea_e2e';
const PUERTO = +process.env.PUERTO || 8787;
let CONFIRMAR = false; // si es true, crear cuenta no abre sesión (como Supabase con "Confirm email")
const recuperos = [];
const archivos = new Map(); // las fotos subidas (Storage de juguete): "bucket/ruta" → { tipo, datos }

const psql = (sql) => new Promise((ok) => {
  execFile('su', ['postgres', '-c', `psql -X -q -At -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -d ${BASE} -f -`], { maxBuffer: 64 << 20 }, (err, stdout, stderr) => {
    if (err) {
      const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(stderr || '');
      return ok({ error: { code: m ? m[1] : 'XX000', message: m ? m[2] : String(stderr || err).slice(0, 300) } });
    }
    ok({ data: stdout.trim() }); // con -q solo sale el resultado de la última consulta
  }).stdin.end('\\set VERBOSITY verbose\n' + sql);
});

const lit = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('número'); return String(v); }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  // una lista de textos va como text[] (así la convierte Supabase para las funciones, por ejemplo los permisos)
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.length ? `array[${v.map(lit).join(', ')}]::text[]` : `'{}'::text[]`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const id = (c) => { if (!/^[a-z_]+$/.test(c)) throw new Error('columna'); return `"${c}"`; };
const TABLAS = new Set(['negocios', 'miembros', 'reservas', 'admins_bookea', 'invitaciones', 'clientes', 'turnos']);

const comoCuenta = (uid, consulta) => `
begin;
select set_config('request.jwt.claim.sub', ${lit(uid || '')}, true) \\g /dev/null
set local role ${uid ? 'authenticated' : 'anon'};
${consulta};
commit;`;

const filtros = (fs_) => {
  if (!fs_.length) return '';
  return ' where ' + fs_.map(([op, c, v]) => {
    if (op === 'eq') return `${id(c)} = ${lit(v)}`;
    if (op === 'gte') return `${id(c)} >= ${lit(v)}`;
    if (op === 'in') return `${id(c)} in (${v.length ? v.map(lit).join(',') : 'null'})`;
    throw new Error('filtro');
  }).join(' and ');
};

const FUNCIONES = new Set(['revisar_negocio', 'guardar_pagina', 'crear_invitacion', 'ver_invitacion', 'aceptar_invitacion', 'anular_invitacion', 'cambiar_permisos', 'quitar_miembro',
  'guardar_mis_datos', 'reservar_turno', 'cancelar_turno', 'borrar_mi_cuenta', // las de los clientes de bookea.ar (cuenta.js)
  'lugares_publicos', 'horarios_ocupados']); // las que la página pide sin cuenta (los negocios de verdad y sus horarios ocupados)
const consulta = async (q) => {
  if (q.op === 'rpc') {
    if (!FUNCIONES.has(q.fn)) return { error: { code: 'PGRST202', message: 'función' } };
    let args;
    try { args = Object.entries(q.args || {}).map(([k, v]) => `${id(k)} => ${lit(v)}`).join(', '); } catch (e) { return { error: { code: '22000', message: e.message } }; }
    const r = await psql(comoCuenta(q.token, `select to_json(public.${q.fn}(${args}))`));
    if (r.error) return r;
    return { data: JSON.parse(r.data || 'null') };
  }
  if (!TABLAS.has(q.tabla)) return { error: { code: '42P01', message: 'tabla' } };
  const T = `public.${q.tabla}`;
  let sql;
  try {
    if (q.op === 'select') {
      const cols = q.cols === '*' ? '*' : q.cols.split(',').map((c) => id(c.trim())).join(', ');
      const orden = q.orden.length ? ' order by ' + q.orden.map(([c, asc]) => `${id(c)} ${asc ? 'asc' : 'desc'}`).join(', ') : '';
      const lim = q.rango ? ` limit ${q.rango[1] - q.rango[0] + 1} offset ${q.rango[0]}` : '';
      sql = `select coalesce(json_agg(t), '[]') from (select ${cols} from ${T}${filtros(q.filtros)}${orden}${lim}) t`;
    } else if (q.op === 'update') {
      const set = Object.entries(q.valores).map(([c, v]) => `${id(c)} = ${lit(v)}`).join(', ');
      sql = `with t as (update ${T} set ${set}${filtros(q.filtros)} returning *) select coalesce(json_agg(t), '[]') from t`;
    } else if (q.op === 'delete') {
      sql = `with t as (delete from ${T}${filtros(q.filtros)} returning *) select coalesce(json_agg(t), '[]') from t`;
    } else if (q.op === 'upsert') {
      const filas = q.valores;
      if (!filas.length) return { data: [] };
      const cols = Object.keys(filas[0]);
      const vals = filas.map((f) => `(${cols.map((c) => lit(f[c])).join(', ')})`).join(',\n');
      const upd = cols.filter((c) => c !== 'id').map((c) => `${id(c)} = excluded.${id(c)}`).join(', ');
      sql = `with t as (insert into ${T} (${cols.map(id).join(', ')}) values ${vals} on conflict (id) do update set ${upd} returning *) select coalesce(json_agg(t), '[]') from t`;
    } else return { error: { code: 'XX000', message: 'op' } };
  } catch (e) { return { error: { code: '22000', message: e.message } }; }
  const r = await psql(comoCuenta(q.token, sql));
  if (r.error) return r;
  let data = JSON.parse(r.data || '[]');
  if (q.single) {
    if (data.length !== 1) return { error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    data = data[0];
  }
  return { data };
};

const usuario = (f) => f && ({ id: f.id, email: f.email, user_metadata: f.raw_user_meta_data || {}, identities: [{ provider: 'email' }] });
const auth = async (ruta, b) => {
  if (ruta === 'signup') {
    const ya = await psql(`select coalesce(json_agg(u), '[]') from auth.users u where email = ${lit(b.email)}`);
    if (JSON.parse(ya.data).length) return { data: { user: { id: 'x', identities: [] }, session: null } };
    if ((b.password || '').length < 8) return { error: { message: 'Password should be at least 8 characters.', code: 'weak_password', status: 422 } };
    const r = await psql(`with u as (insert into auth.users (email, raw_user_meta_data, clave, confirmado)
      values (${lit(b.email)}, ${lit(b.data || {})}, crypt(${lit(b.password)}, gen_salt('bf')), ${CONFIRMAR ? 'false' : 'true'}) returning *) select row_to_json(u) from u`);
    if (r.error) return { error: { message: 'Database error saving new user', status: 500 } };
    const u = usuario(JSON.parse(r.data));
    return { data: { user: u, session: CONFIRMAR ? null : { access_token: u.id, user: u } } };
  }
  if (ruta === 'login') {
    const r = await psql(`select coalesce(json_agg(u), '[]') from auth.users u where email = ${lit(b.email)} and clave = crypt(${lit(b.password || '')}, clave)`);
    const f = JSON.parse(r.data)[0];
    if (!f) return { error: { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 } };
    if (!f.confirmado) return { error: { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 } };
    const u = usuario(f);
    return { data: { user: u, session: { access_token: u.id, user: u } } };
  }
  if (ruta === 'update') {
    if (!b.token) return { error: { message: 'Auth session missing!', status: 401 } };
    const sets = [];
    if (b.data) sets.push(`raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || ${lit(b.data)}`);
    if (b.password) {
      if (b.password.length < 8) return { error: { message: 'Password should be at least 8 characters.', code: 'weak_password', status: 422 } };
      sets.push(`clave = crypt(${lit(b.password)}, gen_salt('bf'))`);
    }
    const r = await psql(`with u as (update auth.users set ${sets.join(', ')} where id = ${lit(b.token)} returning *) select row_to_json(u) from u`);
    if (r.error || !r.data) return { error: { message: 'User not found', status: 404 } };
    return { data: { user: usuario(JSON.parse(r.data)) } };
  }
  if (ruta === 'token') {
    const r = await psql(`select row_to_json(u) from auth.users u where id::text = ${lit(b.id)}`);
    if (r.error || !r.data) return { error: { message: 'Invalid token', status: 401 } };
    const u = usuario(JSON.parse(r.data));
    return { data: { session: { access_token: u.id, user: u } } };
  }
  if (ruta === 'recover') { recuperos.push(b.email); return { data: {} }; }
  return { error: { message: 'ruta', status: 404 } };
};

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (o, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method === 'POST') {
    let cuerpo = ''; for await (const c of req) cuerpo += c;
    const b = JSON.parse(cuerpo || '{}');
    if (url.pathname === '/api/q') return json(await consulta(b));
    if (url.pathname.startsWith('/api/auth/')) return json(await auth(url.pathname.slice(10), b));
    if (url.pathname === '/api/confirmar') { CONFIRMAR = !!b.si; return json({ ok: true }); }
    if (url.pathname === '/api/sql') return json(await psql(b.sql)); // para que la prueba mire la base por dentro
    // Storage: la fila de storage.objects se crea como la cuenta (los permisos del bucket deciden) y la foto queda en memoria
    if (url.pathname === '/api/storage/subir') {
      const r = await psql(comoCuenta(b.token, `insert into storage.objects (bucket_id, name) values (${lit(b.bucket)}, ${lit(b.ruta)})`));
      if (r.error) return json({ error: { message: 'new row violates row-level security policy', statusCode: '403', code: '42501' } });
      archivos.set(`${b.bucket}/${b.ruta}`, { tipo: b.tipo || 'application/octet-stream', datos: Buffer.from(b.b64 || '', 'base64') });
      return json({ data: { path: b.ruta } });
    }
    if (url.pathname === '/api/storage/borrar') {
      for (const ruta of b.rutas || []) {
        const r = await psql(comoCuenta(b.token, `delete from storage.objects where bucket_id = ${lit(b.bucket)} and name = ${lit(ruta)}`));
        if (!r.error) archivos.delete(`${b.bucket}/${ruta}`);
      }
      return json({ data: b.rutas || [] });
    }
    // Como la API de Supabase (PostgREST): lo que cuenta.js pide directo con fetch, sin cuenta (rol anon)
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const r = await consulta({ op: 'rpc', fn: url.pathname.slice('/rest/v1/rpc/'.length), args: b });
      return r.error ? json(r.error, r.error.code === 'PGRST202' ? 404 : 400) : json(r.data);
    }
    return json({ error: 'ruta' }, 404);
  }
  if (url.pathname === '/api/recuperos') return json(recuperos);
  if (url.pathname.startsWith('/storage/v1/object/public/')) {
    const a = archivos.get(decodeURIComponent(url.pathname.slice('/storage/v1/object/public/'.length)));
    if (!a) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': a.tipo });
    return res.end(a.datos);
  }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    return res.end(`window.BOOKEA_CONFIG = { supabaseUrl: "http://localhost:${PUERTO}", supabaseAnonKey: "clave-publica-de-prueba" };`);
  }
  const archivo = path.join(RAIZ, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname)); // como GitHub Pages
  if (!archivo.startsWith(RAIZ) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    // como GitHub Pages: una dirección que no existe muestra 404.html (bookea.ar/su-link lleva a la ficha del negocio)
    res.writeHead(404, { 'content-type': 'text/html' });
    return fs.createReadStream(path.join(RAIZ, '404.html')).pipe(res);
  }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
  fs.createReadStream(archivo).pipe(res);
}).listen(PUERTO, () => console.log('puente en', PUERTO));
