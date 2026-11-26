// Para las pruebas: un Mercado Pago "de juguete" y la función "mp" (supabase/functions/mp/index.ts) corriendo adentro de
// puente.js, contra el Postgres local. Así se prueba el cobro de la seña de punta a punta sin Mercado Pago ni Supabase:
// nada sale de esta compu. Las llaves y la clave de la aplicación son inventadas (PRUEBA_…).
//   · /functions/v1/mp/…  → la función, tal cual se publica (con Deno simulado)
//   · /auth/v1/user       → quién es la sesión (como Supabase Auth: acá el token es el id de la cuenta)
//   · /rest/v1/rpc/mp_…   → las funciones de la base con la clave secreta (rol service_role)
//   · /mp-auth/authorization, /mp-api/oauth/token, /mp-api/v1/orders… → Mercado Pago (permiso con PKCE, cobros, devoluciones)
//   · /api/mp…            → para que la prueba mire y maneje el Mercado Pago de juguete (pagar, romper, etc.)
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

const CLAVE_SECRETA = 'clave-secreta-de-prueba';
const FIRMA_AVISOS = 'firma-de-prueba';
const APP = { id: '1234567890', secreto: 'secreto-inventado-de-la-app' };
const USUARIO_MP = '4242';

module.exports = function montar({ psql, lit, puerto, raiz }) {
  const base = `http://localhost:${puerto}`;
  const vueltaOAuth = `${base}/functions/v1/mp/oauth`;
  const ENV = {
    SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: CLAVE_SECRETA, MP_API_URL: `${base}/mp-api`, MP_AUTH_URL: `${base}/mp-auth`,
    BOOKEA_SITIO: base, BOOKEA_ORIGENES: base, MP_CLIENT_ID: APP.id, MP_CLIENT_SECRET: APP.secreto, MP_WEBHOOK_SECRET: FIRMA_AVISOS,
  };
  globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: () => {} };
  const funcion = import(pathToFileURL(path.join(raiz, 'supabase/functions/mp/index.ts')).href);

  const MP = { codigos: new Map(), llaves: new Set(), renovar: new Set(), ordenes: new Map(), idem: new Map(), pedidos: [], avisos: [],
    romperRenovar: false, sinSaldo: false, negar: false, n: 0 };
  const nuevoId = () => 'ORDTST01' + crypto.randomBytes(9).toString('hex').toUpperCase();
  const llaves = () => {
    MP.n++;
    const d = { access_token: `PRUEBA_LLAVE_${MP.n}_${crypto.randomBytes(6).toString('hex')}`, refresh_token: `PRUEBA_RENOVAR_${MP.n}`,
      user_id: +USUARIO_MP, expires_in: 15552000, live_mode: true, token_type: 'bearer', scope: 'offline_access read write' };
    MP.llaves.add(d.access_token); MP.renovar.add(d.refresh_token);
    return d;
  };
  const b64url = (b) => b.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const firmar = (id, rid, ts) => crypto.createHmac('sha256', FIRMA_AVISOS).update(`id:${id.toLowerCase()};request-id:${rid};ts:${ts};`).digest('hex');

  const leerCuerpo = async (req) => { const p = []; for await (const c of req) p.push(c); return Buffer.concat(p); };
  const enviar = (res, st, o, h = {}) => { res.writeHead(st, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
  const llaveDe = (req) => { const m = /^Bearer (\S+)$/.exec(req.headers.authorization || ''); return m && MP.llaves.has(m[1]) ? m[1] : null; };

  // Mandar el aviso de Mercado Pago a la función (firmado como lo hace Mercado Pago, o mal firmado si se pide)
  const avisar = async (id, firma = 'buena') => {
    const ts = String(Date.now()), rid = crypto.randomUUID();
    const v1 = firma === 'buena' ? firmar(id, rid, ts) : 'f'.repeat(64);
    const r = await fetch(`${base}/functions/v1/mp/avisos?data.id=${encodeURIComponent(id)}&type=order`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
      body: JSON.stringify({ action: 'order.processed', api_version: 'v1', data: { id }, type: 'order', user_id: USUARIO_MP, live_mode: false }),
    });
    const res = { estado: r.status, cuerpo: await r.json().catch(() => null) };
    MP.avisos.push({ id, firma, ...res });
    return res;
  };

  return async function manejar(req, res, url) {
    const ruta = url.pathname;
    // ---------- La función ----------
    if (ruta.startsWith('/functions/v1/mp/') || ruta === '/functions/v1/mp') {
      const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? undefined : await leerCuerpo(req);
      const h = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') h.set(k, v);
      const r = await (await funcion).atender(new Request(base + req.url, { method: req.method, headers: h, body: cuerpo && cuerpo.length ? cuerpo : undefined }));
      const sale = {};
      r.headers.forEach((v, k) => { sale[k] = v; });
      res.writeHead(r.status, sale);
      res.end(Buffer.from(await r.arrayBuffer()));
      return true;
    }
    // ---------- Supabase Auth: quién es la sesión ----------
    if (ruta === '/auth/v1/user') {
      const m = /^Bearer ([0-9a-f-]{36})$/.exec(req.headers.authorization || '');
      if (!m || !req.headers.apikey) { enviar(res, 401, { message: 'invalid JWT' }); return true; }
      const r = await psql(`select row_to_json(u) from (select id, email from auth.users where id::text = ${lit(m[1])}) u`);
      if (r.error || !r.data) { enviar(res, 401, { message: 'invalid JWT' }); return true; }
      enviar(res, 200, JSON.parse(r.data));
      return true;
    }
    // ---------- La base con la clave secreta (solo las funciones de Mercado Pago) ----------
    if (ruta.startsWith('/rest/v1/rpc/') && req.headers.apikey === CLAVE_SECRETA) {
      const fn = ruta.slice('/rest/v1/rpc/'.length);
      if (!/^mp_[a-z_]+$/.test(fn)) { enviar(res, 404, { code: 'PGRST202', message: 'función' }); return true; }
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      let args;
      try { args = Object.entries(b).map(([k, v]) => `"${k.replace(/[^a-z_]/g, '')}" => ${lit(v)}`).join(', '); } catch (e) { enviar(res, 400, { code: '22000', message: e.message }); return true; }
      const r = await psql(`begin;\nset local role service_role;\nselect to_json(public.${fn}(${args}));\ncommit;`);
      if (r.error) { enviar(res, r.error.code === '42501' ? 403 : 400, r.error); return true; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(r.data || 'null');
      return true;
    }
    // ---------- Mercado Pago: el permiso (el dueño dice que sí, o que no) ----------
    if (ruta === '/mp-auth/authorization') {
      const q = url.searchParams;
      if (q.get('client_id') !== APP.id || q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256'
          || !/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') || '') || q.get('redirect_uri') !== vueltaOAuth || !q.get('state')) {
        enviar(res, 400, { error: 'invalid_request' });
        return true;
      }
      let destino;
      if (MP.negar) destino = `${vueltaOAuth}?error=access_denied&state=${encodeURIComponent(q.get('state'))}`;
      else {
        const code = `TG-codigo-${crypto.randomBytes(8).toString('hex')}`;
        MP.codigos.set(code, { desafio: q.get('code_challenge'), usado: false });
        destino = `${vueltaOAuth}?code=${code}&state=${encodeURIComponent(q.get('state'))}`;
      }
      res.writeHead(302, { location: destino });
      res.end();
      return true;
    }
    if (ruta === '/mp-api/oauth/token' && req.method === 'POST') {
      const f = new URLSearchParams((await leerCuerpo(req)).toString());
      MP.pedidos.push({ ruta, grant: f.get('grant_type') });
      if (f.get('client_id') !== APP.id || f.get('client_secret') !== APP.secreto) { enviar(res, 401, { error: 'invalid_client' }); return true; }
      if (f.get('grant_type') === 'authorization_code') {
        const c = MP.codigos.get(f.get('code') || '');
        const pkce = c && b64url(crypto.createHash('sha256').update(f.get('code_verifier') || '').digest()) === c.desafio;
        if (!c || c.usado || !pkce || f.get('redirect_uri') !== vueltaOAuth) { enviar(res, 400, { error: 'invalid_grant', message: pkce === false ? 'PKCE' : 'code' }); return true; }
        c.usado = true;
        enviar(res, 200, llaves());
        return true;
      }
      if (f.get('grant_type') === 'refresh_token') {
        if (MP.romperRenovar || !MP.renovar.has(f.get('refresh_token') || '')) { enviar(res, 400, { error: 'invalid_grant' }); return true; }
        MP.renovar.delete(f.get('refresh_token'));
        enviar(res, 200, llaves());
        return true;
      }
      enviar(res, 400, { error: 'unsupported_grant_type' });
      return true;
    }
    // ---------- Mercado Pago: los cobros (API de Orders) ----------
    const mo = /^\/mp-api\/v1\/orders(?:\/([A-Za-z0-9_-]+))?(\/refund)?$/.exec(ruta);
    if (mo) {
      const llave = llaveDe(req);
      if (!llave) { enviar(res, 401, { message: 'invalid access token' }); return true; }
      const idem = req.headers['x-idempotency-key'] || '';
      if (!mo[1] && req.method === 'POST') { // crear el cobro
        const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
        MP.pedidos.push({ ruta, cuerpo: b, idem, llave });
        if (!idem) { enviar(res, 400, { message: 'X-Idempotency-Key requerido' }); return true; }
        if (MP.idem.has(idem)) { enviar(res, 201, MP.ordenes.get(MP.idem.get(idem))); return true; }
        const total = +b.total_amount, items = (b.items || []).reduce((s, i) => s + +i.unit_price * i.quantity, 0);
        if (b.type !== 'online' || b.processing_mode !== 'manual' || !/^\d+\.\d{2}$/.test(b.total_amount || '') || total !== items
            || (b.marketplace_fee !== undefined && !(+b.marketplace_fee < total))) {
          enviar(res, 400, { message: 'pedido inválido' });
          return true;
        }
        const o = { id: nuevoId(), type: 'online', processing_mode: 'manual', status: 'created', status_detail: 'created', total_amount: b.total_amount,
          total_paid_amount: '0.00', external_reference: b.external_reference, marketplace_fee: b.marketplace_fee, config: b.config,
          expiration_time: b.expiration_time, user_id: USUARIO_MP, items: b.items, payer: b.payer };
        o.checkout_url = `https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=${o.id}`;
        MP.ordenes.set(o.id, o); MP.idem.set(idem, o.id);
        enviar(res, 201, o);
        return true;
      }
      const o = MP.ordenes.get(mo[1]);
      if (!o) { enviar(res, 404, { message: 'order not found' }); return true; }
      if (!mo[2] && req.method === 'GET') { enviar(res, 200, o); return true; }
      if (mo[2] && req.method === 'POST') { // devolver
        MP.pedidos.push({ ruta, idem, llave });
        if (MP.sinSaldo) { enviar(res, 400, { message: 'insufficient balance' }); return true; }
        if (o.status !== 'processed' && o.status !== 'refunded') { enviar(res, 400, { message: 'order not processed' }); return true; }
        o.status = 'refunded'; o.status_detail = 'refunded';
        enviar(res, 201, o);
        return true;
      }
      enviar(res, 405, { message: 'método' });
      return true;
    }
    // ---------- Para la prueba ----------
    if (ruta === '/api/mp' && req.method === 'GET') {
      enviar(res, 200, { ordenes: [...MP.ordenes.values()], pedidos: MP.pedidos, avisos: MP.avisos });
      return true;
    }
    if (ruta === '/api/mp/ajustes' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      for (const k of ['romperRenovar', 'sinSaldo', 'negar']) if (k in b) MP[k] = !!b[k];
      enviar(res, 200, { ok: true });
      return true;
    }
    // El cliente paga en el Mercado Pago de juguete: el cobro queda como dice la prueba y llega el aviso firmado
    if (ruta === '/api/mp/pagar' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      const o = MP.ordenes.get(b.orden);
      if (!o) { enviar(res, 404, { error: 'orden' }); return true; }
      o.status = b.estado || 'processed'; o.status_detail = b.detalle || 'accredited';
      o.total_paid_amount = b.pagado !== undefined ? String(b.pagado) : o.total_amount;
      enviar(res, 200, b.avisar === false ? { ok: true } : await avisar(o.id, b.firma || 'buena'));
      return true;
    }
    if (ruta === '/api/mp/avisar' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      enviar(res, 200, await avisar(b.orden, b.firma || 'buena'));
      return true;
    }
    return false;
  };
};
