// Para las pruebas: un Mercado Pago "de juguete" y la función "mp" (supabase/functions/mp/index.ts) corriendo adentro de
// puente.js, contra el Postgres local. Así se prueba el cobro de la seña de punta a punta sin Mercado Pago ni Supabase:
// nada sale de esta compu. Las llaves y la clave de la aplicación son inventadas (PRUEBA_…).
//   · /functions/v1/mp/…  → la función, tal cual se publica (con Deno simulado)
//   · /auth/v1/user       → quién es la sesión (como Supabase Auth: acá el token es el id de la cuenta)
//   · /rest/v1/rpc/mp_…   → las funciones de la base con la clave secreta (rol service_role)
//   · /mp-auth/authorization, /mp-api/oauth/token, /mp-api/checkout/preferences, /mp-api/v1/payments… → Mercado Pago
//     (permiso con PKCE, el link para pagar, los pagos, buscarlos por su referencia y devolverlos)
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

  const MP = { codigos: new Map(), llaves: new Set(), renovar: new Set(), prefs: new Map(), pagos: new Map(), idem: new Map(), pedidos: [], avisos: [],
    romperRenovar: false, sinSaldo: false, negar: false, sinBusqueda: false, n: 0, np: 0 };
  const nuevaPref = () => `${USUARIO_MP}-${crypto.randomUUID()}`;
  const FECHA = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}-03:00$/;
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

  // Mandar el aviso de Mercado Pago a la función (evento "Pagos", firmado como lo hace Mercado Pago, o mal firmado si se pide)
  const avisar = async (id, firma = 'buena', usuario = USUARIO_MP, tipo = 'payment') => {
    id = String(id);
    const ts = String(Date.now()), rid = crypto.randomUUID();
    const v1 = firma === 'buena' ? firmar(id, rid, ts) : 'f'.repeat(64);
    const r = await fetch(`${base}/functions/v1/mp/avisos?data.id=${encodeURIComponent(id)}&type=${tipo}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid },
      body: JSON.stringify({ action: `${tipo}.created`, api_version: 'v1', data: { id }, date_created: new Date().toISOString(), id: Date.now(),
        live_mode: true, type: tipo, user_id: +usuario }),
    });
    const res = { estado: r.status, cuerpo: await r.json().catch(() => null) };
    MP.avisos.push({ id, firma, ...res });
    return res;
  };
  // Adónde vuelve el cliente, con lo que agrega Mercado Pago a la dirección
  const vuelta = (pref, pago) => {
    const u = new URL(pago.status === 'approved' ? pref.back_urls.success : pref.back_urls.failure);
    for (const [k, v] of Object.entries({ collection_id: pago.id, collection_status: pago.status, payment_id: pago.id, status: pago.status,
      external_reference: pref.external_reference, payment_type: 'credit_card', merchant_order_id: '99' + pago.id, preference_id: pref.id,
      site_id: 'MLA', processing_mode: 'aggregator', merchant_account_id: 'null' })) u.searchParams.set(k, String(v));
    return u.href;
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
    // ---------- Mercado Pago: el link para pagar (preferencias de Checkout Pro), los pagos y las devoluciones ----------
    if (ruta === '/mp-api/checkout/preferences' && req.method === 'POST') {
      const llave = llaveDe(req);
      if (!llave) { enviar(res, 401, { message: 'invalid access token' }); return true; }
      const idem = req.headers['x-idempotency-key'] || '';
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      MP.pedidos.push({ ruta, cuerpo: b, idem, llave });
      if (idem && MP.idem.has(idem)) { enviar(res, 201, MP.prefs.get(MP.idem.get(idem))); return true; }
      const it = Array.isArray(b.items) ? b.items : [];
      const total = it.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      // como Mercado Pago: números (no textos), las fechas con su zona, la comisión menor que el total y nada de "marketplace"
      // (con las llaves de un vendedor conectado por OAuth, Mercado Pago lo completa solo: MP-MKT-<aplicación>)
      if (!it.length || it.some((i) => typeof i.unit_price !== 'number' || i.quantity !== 1 || i.currency_id !== 'ARS' || !i.title)
          || !b.external_reference || !b.back_urls || !b.back_urls.success || b.auto_return !== 'approved' || b.binary_mode !== true
          || b.expires !== true || !FECHA.test(b.expiration_date_from || '') || !FECHA.test(b.expiration_date_to || '')
          || (b.marketplace_fee !== undefined && !(typeof b.marketplace_fee === 'number' && b.marketplace_fee < total)) || b.marketplace !== undefined) {
        enviar(res, 400, { message: 'preferencia inválida', status: 400 });
        return true;
      }
      const id = nuevaPref();
      const p = { ...b, id, collector_id: +USUARIO_MP, marketplace: `MP-MKT-${APP.id}`, marketplace_fee: b.marketplace_fee || 0, operation_type: 'regular_payment',
        init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
        sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`, total, llave };
      MP.prefs.set(id, p);
      if (idem) MP.idem.set(idem, id);
      enviar(res, 201, p);
      return true;
    }
    if (ruta === '/mp-api/v1/payments/search' && req.method === 'GET') {
      if (!llaveDe(req)) { enviar(res, 401, { message: 'invalid access token' }); return true; }
      const ref = url.searchParams.get('external_reference') || '';
      const lista = MP.sinBusqueda ? [] : [...MP.pagos.values()].filter((p) => p.external_reference === ref);
      if (url.searchParams.get('criteria') === 'desc') lista.reverse();
      enviar(res, 200, { paging: { total: lista.length, limit: 30, offset: 0 }, results: lista });
      return true;
    }
    const mpg = /^\/mp-api\/v1\/payments\/([0-9]+)(\/refunds)?$/.exec(ruta);
    if (mpg) {
      const llave = llaveDe(req);
      if (!llave) { enviar(res, 401, { message: 'invalid access token' }); return true; }
      const pg = MP.pagos.get(mpg[1]);
      if (!pg) { enviar(res, 404, { message: 'Payment not found', status: 404 }); return true; }
      if (!mpg[2] && req.method === 'GET') { enviar(res, 200, pg); return true; }
      if (mpg[2] && req.method === 'POST') { // devolver el pago entero
        const idem = req.headers['x-idempotency-key'] || '';
        MP.pedidos.push({ ruta, idem, llave });
        if (!idem) { enviar(res, 400, { message: "Header X-Idempotency-Key can't be null" }); return true; }
        if (MP.sinSaldo) { enviar(res, 400, { message: 'insufficient balance' }); return true; }
        if (pg.status !== 'approved') { enviar(res, 400, { message: 'The action requested is not valid for the current payment state' }); return true; }
        pg.status = 'refunded'; pg.status_detail = 'refunded'; pg.transaction_amount_refunded = pg.transaction_amount;
        enviar(res, 201, { id: 5000 + MP.np, payment_id: +pg.id, amount: pg.transaction_amount, status: 'approved', refund_mode: 'standard' });
        return true;
      }
      enviar(res, 405, { message: 'método' });
      return true;
    }
    // ---------- Para la prueba ----------
    if (ruta === '/api/mp' && req.method === 'GET') {
      enviar(res, 200, { prefs: [...MP.prefs.values()], pagos: [...MP.pagos.values()], pedidos: MP.pedidos, avisos: MP.avisos });
      return true;
    }
    if (ruta === '/api/mp/ajustes' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      for (const k of ['romperRenovar', 'sinSaldo', 'negar', 'sinBusqueda']) if (k in b) MP[k] = !!b[k];
      enviar(res, 200, { ok: true });
      return true;
    }
    // El cliente paga en el Mercado Pago de juguete: queda un pago (acreditado, o rechazado si se pide), llega el aviso
    // firmado (si no se pide que no) y se devuelve adónde vuelve el cliente, con lo que agrega Mercado Pago a la dirección
    if (ruta === '/api/mp/pagar' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      const pref = MP.prefs.get(b.pref);
      if (!pref) { enviar(res, 404, { error: 'preferencia' }); return true; }
      MP.np++;
      const pg = { id: 1000000000 + MP.np, status: b.rechazo ? 'rejected' : b.estado || 'approved', status_detail: b.rechazo || b.detalle || 'accredited',
        external_reference: pref.external_reference, transaction_amount: b.pagado !== undefined ? +b.pagado : pref.total, currency_id: 'ARS',
        payment_method_id: 'master', payment_type_id: 'credit_card', collector_id: +USUARIO_MP, marketplace_owner: +APP.id,
        fee_details: pref.marketplace_fee ? [{ type: 'application_fee', amount: pref.marketplace_fee, fee_payer: 'collector' }] : [],
        date_created: new Date().toISOString(), payer: { email: 'comprador@prueba.com' } };
      MP.pagos.set(String(pg.id), pg);
      const aviso = b.avisar === false ? null : await avisar(pg.id, b.firma || 'buena');
      enviar(res, 200, { pago: String(pg.id), vuelta: vuelta(pref, pg), ...(aviso || {}) });
      return true;
    }
    if (ruta === '/api/mp/avisar' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      enviar(res, 200, await avisar(b.pago, b.firma || 'buena', b.usuario || USUARIO_MP, b.tipo || 'payment'));
      return true;
    }
    // El negocio devuelve un pago desde su Mercado Pago (sin pasar por Bookea)
    if (ruta === '/api/mp/devolver-en-mp' && req.method === 'POST') {
      const b = JSON.parse((await leerCuerpo(req)).toString() || '{}');
      const pg = MP.pagos.get(String(b.pago));
      if (pg) { pg.status = 'refunded'; pg.status_detail = 'refunded'; }
      enviar(res, pg ? 200 : 404, { ok: !!pg });
      return true;
    }
    return false;
  };
};
