// Prueba de punta a punta del cobro de señas con Mercado Pago: la función "mp" (supabase/functions/mp/index.ts) tal cual
// se publica, contra el Postgres local con supabase/esquema.sql y un Mercado Pago de juguete (mp-falso.js).
// Conectar la cuenta (PKCE), cobrar la seña con la comisión, el aviso firmado, pagos rechazados y tardíos,
// devoluciones (y sin saldo), renovar las llaves y reconectar. Uso: node supabase/pruebas/e2e/mp-e2e.js
const { spawn, execFileSync } = require('child_process');
const AQUI = __dirname, B = 'http://localhost:8787';
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALLA ') + m); if (!c) process.exitCode = 1; };

const sql = async (q) => { const r = await (await fetch(`${B}/api/sql`, { method: 'POST', body: JSON.stringify({ sql: q }) })).json(); if (r.error) throw new Error(r.error.message); return JSON.parse(r.data || 'null'); };
const rpc = async (token, fn, args) => (await fetch(`${B}/api/q`, { method: 'POST', body: JSON.stringify({ token, op: 'rpc', fn, args }) })).json();
const fn = async (ruta, { token, cuerpo, metodo = 'POST', origen } = {}) => {
  const h = { 'content-type': 'application/json', apikey: 'clave-publica-de-prueba' };
  if (token) h.authorization = `Bearer ${token}`;
  if (origen) h.origin = origen;
  const r = await fetch(`${B}/functions/v1/mp/${ruta}`, { method: metodo, headers: h, body: metodo === 'POST' ? JSON.stringify(cuerpo || {}) : undefined, redirect: 'manual' });
  return { estado: r.status, h: r.headers, d: await r.json().catch(() => null) };
};
const ir = async (u) => { const r = await fetch(u, { redirect: 'manual' }); return { estado: r.status, a: r.headers.get('location') || '' }; };
const mp = async (ruta = '', cuerpo) => (await fetch(`${B}/api/mp${ruta}`, cuerpo ? { method: 'POST', body: JSON.stringify(cuerpo) } : {})).json();
// Conectar de punta a punta: el panel pide la dirección, Mercado Pago da el permiso y vuelve a la función
const conectar = async (token, negocio, cambiar) => {
  const c = await fn('conectar', { token, cuerpo: { negocio } });
  if (c.estado !== 200) return { c };
  let u = c.d.url;
  if (cambiar) u = cambiar(u);
  const a = await ir(u);
  const v = a.a ? await ir(a.a) : { estado: 0, a: '' };
  return { c, a, v };
};

(async () => {
  execFileSync('bash', [AQUI + '/base.sh']);
  const srv = spawn('node', [AQUI + '/puente.js'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.once('data', r));
  try {
    // ---------- Un negocio aprobado (Ana) y una clienta (Juli) ----------
    await sql(`insert into auth.users (email, raw_user_meta_data) values
      ('ana@prueba.com', '{"nombre":"Ana","negocio":"Cancha Ana","rubro":"Fútbol 5"}'),
      ('juli@prueba.com', '{"nombre":"Juli Paz","celular":"261 555 1234","cliente":true}'),
      ('beto@prueba.com', '{"nombre":"Beto","negocio":"Otro Club","rubro":"Pádel"}')`);
    const ana = await sql(`select to_json(id) from auth.users where email = 'ana@prueba.com'`);
    const juli = await sql(`select to_json(id) from auth.users where email = 'juli@prueba.com'`);
    const beto = await sql(`select to_json(id) from auth.users where email = 'beto@prueba.com'`);
    const neg = await sql(`select to_json(id) from negocios where email_dueno = 'ana@prueba.com'`);
    await sql(`update negocios set estado = 'aprobado', ciudad = 'Tunuyán', ajustes = jsonb_build_object(
      'recursos', jsonb_build_array(jsonb_build_object('id', 'r1', 'nombre', 'Cancha 1', 'detalle', '')),
      'duracion', 60, 'horario', (select jsonb_agg(jsonb_build_object('abre', '08:00', 'cierra', '23:00', 'cerrado', false)) from generate_series(0, 6)),
      'franjas', jsonb_build_array(jsonb_build_object('desde', '08:00', 'hasta', '23:00', 'precio', 50000)),
      'senaPct', 25, 'cancelarHoras', 12, 'devolverSena', true) where email_dueno in ('ana@prueba.com', 'beto@prueba.com')`);
    await sql(`create or replace function public.bookea_comision_pct() returns numeric language sql immutable as $$ select 10::numeric $$`);
    const dia = new Date(Date.now() + 3 * 864e5 - 3 * 3600e3).toISOString().slice(0, 10); // en 3 días, hora de Mendoza
    const reservar = async (minuto) => (await rpc(juli, 'reservar_turno', { t: { negocio_id: neg, recurso: 'r1', fecha_agenda: dia, minuto } })).data;

    // ---------- Conectar la cuenta de Mercado Pago ----------
    ok((await fn('conectar', { cuerpo: { negocio: neg } })).estado === 401, 'conectar: sin sesión, no');
    ok((await fn('conectar', { token: juli, cuerpo: { negocio: neg } })).estado === 403, 'conectar: una clienta no conecta la cuenta de un negocio');
    ok((await fn('conectar', { token: beto, cuerpo: { negocio: neg } })).estado === 403, 'conectar: otro negocio no conecta la cuenta de Ana');
    const pre = await fn('conectar', { metodo: 'OPTIONS', origen: B });
    ok(pre.estado === 204 && pre.h.get('access-control-allow-origin') === B && /authorization/.test(pre.h.get('access-control-allow-headers') || ''), 'la página y el panel la pueden llamar desde bookea.ar (CORS)');
    ok(!(await fn('conectar', { metodo: 'OPTIONS', origen: 'https://otro-sitio.com' })).h.get('access-control-allow-origin'), 'desde otro sitio, no (CORS)');
    // alguien cambia el desafío PKCE en el camino: Mercado Pago no da las llaves
    const robo = await conectar(ana, neg, (u) => u.replace(/code_challenge=[^&]+/, 'code_challenge=' + 'A'.repeat(43)));
    ok(robo.v.estado === 302 && robo.v.a === `${B}/admin.html?mp=error` && (await sql(`select to_json(count(*)) from mp_cuentas`)) === 0,
      'si alguien cambia el desafío PKCE, Mercado Pago no da las llaves y no queda nada conectado');
    const con = await conectar(ana, neg);
    const q = new URL(con.c.d.url).searchParams;
    ok(con.c.d.url.startsWith(`${B}/mp-auth/authorization?`) && q.get('client_id') === '1234567890' && q.get('code_challenge_method') === 'S256'
      && q.get('redirect_uri') === `${B}/functions/v1/mp/oauth` && /^[0-9a-f]{64}$/.test(q.get('state')), 'conectar: la dirección de Mercado Pago lleva la aplicación, el estado y el desafío PKCE');
    ok(con.v.estado === 302 && con.v.a === `${B}/admin.html?mp=conectado`, 'Mercado Pago da el permiso y la función vuelve al panel: "conectado"');
    const cuenta = await sql(`select row_to_json(c) from mp_cuentas c`);
    ok(cuenta && cuenta.mp_usuario === '4242' && cuenta.quien === ana && !JSON.stringify(cuenta).includes('PRUEBA_')
      && (await sql(`select to_json(count(*)) from vault.secrets where name like 'mercadopago_%'`)) === 2, 'las llaves quedan en Vault y la cuenta, conectada');
    ok((await ir(con.a.a)).a === `${B}/admin.html?mp=vencido`, 'la vuelta de Mercado Pago sirve una sola vez');
    await mp('/ajustes', { negar: true });
    ok((await conectar(ana, neg)).v.a === `${B}/admin.html?mp=cancelado`, 'si el dueño dice que no en Mercado Pago, vuelve al panel: "cancelado"');
    await mp('/ajustes', { negar: false });
    const panel = await rpc(ana, 'mi_mercado_pago', { n: neg });
    ok(panel.data && panel.data.conectado && panel.data.cuenta === '4242' && !JSON.stringify(panel.data).includes('PRUEBA_'), 'el panel ve la cuenta conectada, sin las llaves');

    // ---------- Cobrar la seña ----------
    const t1 = await reservar(20 * 60);
    ok(t1 && t1.estado === 'pendiente' && t1.sena === 12500 && t1.comision === 1250, 'Juli reserva: el turno espera el pago (seña $ 12.500, comisión $ 1.250)');
    ok((await fn('cobrar', { cuerpo: { turno: t1.id } })).estado === 401, 'cobrar: sin sesión, no');
    ok((await fn('cobrar', { token: ana, cuerpo: { turno: t1.id } })).estado === 404, 'cobrar: nadie más que el cliente cobra su turno');
    const c1 = await fn('cobrar', { token: juli, cuerpo: { turno: t1.id } });
    let est = await mp();
    const o1 = est.ordenes[0], p1 = est.pedidos.find((p) => p.ruta === '/mp-api/v1/orders');
    ok(c1.estado === 200 && c1.d.url === o1.checkout_url && /^https:\/\/www\.mercadopago\.com\.ar\//.test(c1.d.url), 'cobrar: devuelve la dirección de Mercado Pago para pagar');
    ok(o1.total_amount === '12500.00' && o1.marketplace_fee === '1250.00' && o1.external_reference === t1.id && o1.items[0].unit_price === '12500.00'
      && /^Seña · Cancha Ana · /.test(o1.items[0].title) && o1.payer.email === 'juli@prueba.com', 'el cobro sale de la base: la seña, la comisión de Bookea y el turno');
    ok(/^PT1[5-8]M$/.test(o1.expiration_time) && o1.config.online.success_url === `${B}/?pago=ok&turno=${t1.id}` && o1.config.online.auto_return === 'approved'
      && o1.config.payment_method.not_allowed_types.join() === 'ticket,atm', 'el cobro vence antes que el turno, vuelve a la página y no acepta pagos en efectivo');
    ok(p1.idem === `bookea-${t1.id}-0` && p1.llave.startsWith('PRUEBA_LLAVE_1'), 'el cobro se arma con la cuenta del negocio y una clave para no repetirlo');
    const c1b = await fn('cobrar', { token: juli, cuerpo: { turno: t1.id } });
    ok(c1b.d.url === c1.d.url && (await mp()).ordenes.length === 1, 'si vuelve a tocar "Pagar", usa el mismo cobro (no arma dos)');
    ok((await fn('cobrar', { token: juli, cuerpo: { turno: t1.id, revisar: true } })).d.estado === 'pendiente', 'revisar antes de pagar: sigue esperando el pago');

    // ---------- El aviso de Mercado Pago ----------
    const mala = await mp('/pagar', { orden: o1.id, firma: 'mala' });
    ok(mala.estado === 401 && (await sql(`select to_json(estado) from turnos where id = '${t1.id}'`)) === 'pendiente', 'un aviso mal firmado no confirma nada');
    const buena = await mp('/avisar', { orden: o1.id });
    ok(buena.estado === 200 && buena.cuerpo.accion === 'confirmado', 'el aviso firmado: la función le pregunta a Mercado Pago y el turno queda confirmado');
    const r1 = await sql(`select row_to_json(r) from reservas r join turnos t on t.reserva_id = r.id where t.id = '${t1.id}'`);
    ok(r1.sena === 12500 && /pagada con Mercado Pago/.test(r1.nota) && (await sql(`select to_json(pago) from turnos where id = '${t1.id}'`)) === 'aprobado', 'la seña pagada aparece en la agenda del negocio');
    ok((await mp('/avisar', { orden: o1.id })).cuerpo.accion === 'nada', 'si Mercado Pago avisa dos veces, no pasa nada más');
    ok((await fn('cobrar', { token: juli, cuerpo: { turno: t1.id, revisar: true } })).d.estado === 'confirmado', 'al volver de Mercado Pago, la página ve el turno confirmado');
    ok((await fn('cobrar', { token: juli, cuerpo: { turno: t1.id } })).d.estado === 'confirmado' && (await mp()).ordenes.length === 1, 'un turno ya pagado no se vuelve a cobrar');
    ok((await mp('/avisar', { orden: 'ORDTST01NOESDEBOOKEA' })).cuerpo.ignorado, 'un aviso de un cobro que no es de Bookea se ignora');

    // Sin aviso (el webhook tarda): al volver, "revisar" le pregunta a Mercado Pago
    const t2 = await reservar(21 * 60);
    const c2 = await fn('cobrar', { token: juli, cuerpo: { turno: t2.id } });
    const o2 = (await mp()).ordenes.find((o) => o.external_reference === t2.id);
    await mp('/pagar', { orden: o2.id, avisar: false });
    ok(c2.estado === 200 && (await fn('cobrar', { token: juli, cuerpo: { turno: t2.id, revisar: true } })).d.estado === 'confirmado',
      'sin el aviso, al volver de Mercado Pago la función pregunta y el turno queda confirmado');

    // Pago rechazado: puede volver a intentar con otro cobro
    const t3 = await reservar(22 * 60);
    await fn('cobrar', { token: juli, cuerpo: { turno: t3.id } });
    const o3 = (await mp()).ordenes.find((o) => o.external_reference === t3.id);
    await mp('/pagar', { orden: o3.id, estado: 'failed', detalle: 'failed', avisar: false });
    const c3b = await fn('cobrar', { token: juli, cuerpo: { turno: t3.id } });
    const o3b = (await mp()).ordenes.filter((o) => o.external_reference === t3.id);
    ok(c3b.estado === 200 && o3b.length === 2 && c3b.d.url === o3b[1].checkout_url && (await sql(`select to_json(estado) from mp_cobros where orden = '${o3.id}'`)) === 'rechazado'
      && (await mp()).pedidos.some((p) => p.idem === `bookea-${t3.id}-1`), 'si el pago se rechaza, el cliente vuelve a intentar con un cobro nuevo');
    // Paga tarde (el turno ya se liberó): la seña se devuelve sola
    await sql(`update turnos set vence = now() - interval '1 minute' where id = '${t3.id}'; select public.vencer_pendientes()`);
    const tarde = await mp('/pagar', { orden: o3b[1].id });
    ok(tarde.cuerpo && tarde.cuerpo.accion === 'devolver' && (await mp()).ordenes.find((o) => o.id === o3b[1].id).status === 'refunded'
      && (await sql(`select to_json(devolucion) from mp_cobros where orden = '${o3b[1].id}'`)) === 'hecha', 'si paga cuando el turno ya se liberó, la seña se devuelve sola');

    // ---------- Devolver la seña al cancelar con tiempo ----------
    await rpc(juli, 'cancelar_turno', { turno: t1.id });
    ok((await sql(`select to_json(devolucion) from mp_cobros where orden = '${o1.id}'`)) === 'pendiente', 'Juli cancela con tiempo: la seña queda para devolver');
    const dv = await fn('devolver');
    ok(dv.estado === 200 && dv.d.devueltas === 1 && (await mp()).ordenes.find((o) => o.id === o1.id).status === 'refunded'
      && (await sql(`select to_json(pago) from turnos where id = '${t1.id}'`)) === 'devuelto'
      && (await mp()).pedidos.some((p) => p.idem === `bookea-devolver-${o1.id}`), 'la función devuelve la seña por Mercado Pago (una sola vez)');
    await mp('/ajustes', { sinSaldo: true });
    await rpc(juli, 'cancelar_turno', { turno: t2.id });
    const dv2 = await fn('devolver');
    ok(dv2.d.devueltas === 0 && (await sql(`select to_json(intentos) from mp_cobros where orden = '${o2.id}'`)) === 1
      && (await sql(`select to_json(devolucion) from mp_cobros where orden = '${o2.id}'`)) === 'pendiente', 'sin saldo en la cuenta del negocio: queda para volver a intentar');
    await mp('/ajustes', { sinSaldo: false });
    ok((await fn('devolver')).d.devueltas === 1 && (await sql(`select to_json(pago) from turnos where id = '${t2.id}'`)) === 'devuelto', 'en la próxima vuelta se devuelve');

    // ---------- Renovar las llaves y reconectar ----------
    await sql(`update mp_cuentas set vence = now() + interval '10 days'`);
    const rn = await fn('renovar');
    const ll = await sql(`select to_json(decrypted_secret) from vault.decrypted_secrets d join mp_cuentas c on c.llave_id = d.id`);
    ok(rn.d.renovadas === 1 && /^PRUEBA_LLAVE_[2-9]/.test(ll) && (await sql(`select to_json(vence > now() + interval '170 days') from mp_cuentas`)), 'las llaves que vencen en menos de 30 días se renuevan');
    await mp('/ajustes', { romperRenovar: true });
    await sql(`update mp_cuentas set vence = now() + interval '5 days'`);
    const t4 = await reservar(19 * 60);
    const c4 = await fn('cobrar', { token: juli, cuerpo: { turno: t4.id } });
    const p4 = await rpc(ana, 'mi_mercado_pago', { n: neg });
    ok(c4.estado === 409 && c4.d.error === 'reconectar' && p4.data.reconectar && !(await sql(`select to_json(public.tiene_mercado_pago('${neg}'))`)),
      'si Mercado Pago no deja renovar (el dueño quitó el permiso), el negocio deja de cobrar y el panel pide conectarla de nuevo');
    await mp('/ajustes', { romperRenovar: false });
    ok((await conectar(ana, neg)).v.a === `${B}/admin.html?mp=conectado` && !(await rpc(ana, 'mi_mercado_pago', { n: neg })).data.reconectar, 'al conectarla de nuevo, vuelve a cobrar');

    // ---------- Lo demás ----------
    ok((await fn('nada')).estado === 404 && (await fn('cobrar', { metodo: 'GET' })).estado === 405, 'rutas que no existen');
    ok((await rpc(beto, 'mp_desconectar', { n: neg })).error && (await rpc(ana, 'mp_desconectar', { n: neg })).error, 'nadie más desconecta la cuenta, y Ana tampoco con un cliente pagando');
    await sql(`update turnos set vence = now() - interval '1 minute' where estado = 'pendiente'`);
    ok((await rpc(ana, 'mp_desconectar', { n: neg })).data === true && !(await rpc(ana, 'mi_mercado_pago', { n: neg })).data.conectado, 'Ana desconecta la cuenta');

    // ================== En el navegador: el panel conecta la cuenta y la página cobra la seña ==================
    await sql(`update auth.users set clave = crypt('canchas2026', gen_salt('bf'))`);
    const { chromium } = require('playwright');
    const fs = require('fs'), out = AQUI + '/capturas';
    fs.mkdirSync(out, { recursive: true });
    const nav = await chromium.launch();
    const nueva = async (w = 1440, h = 900) => {
      const ctx = await nav.newContext({ viewport: { width: w, height: h } });
      await ctx.addInitScript({ path: AQUI + '/falso-supabase.js' });
      // el pago de Mercado Pago no se abre de verdad: su página es de juguete (la prueba "paga" con /api/mp/pagar)
      await ctx.route('https://www.mercadopago.com.ar/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Mercado Pago (de prueba)</title><h1>Mercado Pago de prueba</h1>' }));
      const p = await ctx.newPage();
      p.errs = [];
      p.on('pageerror', (e) => p.errs.push(e.message));
      p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
      return p;
    };
    try {
      // ---------- Panel: Mi negocio → Mercado Pago ----------
      const an = await nueva();
      await an.goto(`${B}/admin.html`); await an.waitForSelector('#f-ingresar:not([hidden])');
      await an.fill('#i-email', 'ana@prueba.com'); await an.fill('#i-clave', 'canchas2026'); await an.click('#f-ingresar button[type=submit]');
      await an.waitForSelector('#panel:not([hidden])'); await an.waitForFunction(() => !document.querySelector('.bienv')); await an.waitForTimeout(200);
      await an.click('.menu__i[data-vista="negocio"]'); await an.waitForSelector('#g-mp [data-mp="conectar"]');
      ok(/Sin conectar/.test(await an.textContent('#g-mp')) && /se toman sin seña/.test(await an.textContent('#g-mp')) && /Se cobra cuando conectes Mercado Pago/.test(await an.textContent('#g-sena-ayuda'))
        && /Sin seña/.test(await an.textContent('#g-prev')), 'panel: sin conectar, Mi negocio avisa que los turnos van sin seña (también en "Así te ven") y ofrece "Conectar Mercado Pago"');
      // Así te ven: si aparece en la lista de bookea.ar o qué le falta (pedido del dueño, 27/11: el teléfono "sí o sí")
      ok(/Para aparecer en la lista de bookea\.ar, cargá tu WhatsApp\./.test(await an.textContent('#g-lista')), 'panel: "Así te ven" dice qué le falta para aparecer en la lista (el WhatsApp)');
      await an.fill('#g-wa', '261 555 0000');
      ok(/Aparecés en la lista de bookea\.ar/.test(await an.textContent('#g-lista')), 'panel: con el WhatsApp cargado, "Aparecés en la lista de bookea.ar"');
      await an.locator('.ng-card--prev').scrollIntoViewIfNeeded(); await an.waitForTimeout(900);
      await an.locator('.ng-card--prev').screenshot({ path: `${out}/mp-panel-asi-te-ven.png` });
      await an.waitForTimeout(800); await an.locator('.ng-card--mp').screenshot({ path: `${out}/mp-panel-sin-conectar.png` });
      // Conectar: Mercado Pago se abre en otra pestaña, da el permiso y vuelve; el panel se actualiza solo
      const [pest] = await Promise.all([an.context().waitForEvent('page'), an.click('#g-mp [data-mp="conectar"]')]);
      await pest.waitForSelector('#mp-vuelta', { timeout: 10000 });
      ok(/Mercado Pago quedó conectado/.test(await pest.textContent('#mp-vuelta')) && !(await pest.isVisible('#f-ingresar')) && new URL(pest.url()).search === '',
        'la pestaña de Mercado Pago vuelve, dice "Mercado Pago quedó conectado" (sin pedir la contraseña) y limpia la dirección');
      await pest.waitForTimeout(900); await pest.screenshot({ path: `${out}/mp-vuelta.png` });
      await an.waitForFunction(() => /Conectada/.test(document.querySelector('#g-mp').textContent), null, { timeout: 8000 });
      ok(/Cuenta N° 4242/.test(await an.textContent('#g-mp')) && await an.isVisible('#g-mp [data-mp="desconectar"]'), 'panel: sin recargar, la tarjeta dice "Conectada", con la cuenta y "Desconectar"');
      await an.waitForTimeout(2200);
      ok(pest.isClosed(), 'la pestaña de Mercado Pago se cierra sola');
      await an.locator('.ng-card--mp').screenshot({ path: `${out}/mp-panel-conectada.png` });
      // Desconectar (con confirmación) y volver a conectar
      await an.click('#g-mp [data-mp="desconectar"]');
      ok(/¿Desconectarla\?/.test(await an.textContent('#g-mp')), 'desconectar pide confirmación');
      await an.click('#g-mp [data-mp="desconectar-si"]'); await an.waitForSelector('#g-mp [data-mp="conectar"]');
      ok(/Sin conectar/.test(await an.textContent('#g-mp')) && !(await sql(`select to_json(public.tiene_mercado_pago('${neg}'))`)), 'panel: Ana desconecta la cuenta desde Mi negocio');
      const [pest2] = await Promise.all([an.context().waitForEvent('page'), an.click('#g-mp [data-mp="conectar"]')]);
      await pest2.waitForSelector('#mp-vuelta', { timeout: 10000 });
      await an.waitForFunction(() => /Conectada/.test(document.querySelector('#g-mp').textContent), null, { timeout: 8000 });

      // ---------- Página: Juli paga la seña en Mercado Pago ----------
      const fr = await nueva();
      const F = `${B}/index.html`;
      const frenteListo = (p) => p.waitForFunction(() => document.documentElement.classList.contains('is-ready') && !document.querySelector('.splash'), null, { timeout: 8000 }).then(() => p.waitForTimeout(500));
      await fr.goto(F + '#mis-turnos'); await frenteListo(fr);
      await fr.fill('#cu-email', 'juli@prueba.com'); await fr.fill('#cu-clave', 'canchas2026'); await fr.click('#f-cuenta button[type=submit]');
      await fr.waitForSelector('.micuenta', { timeout: 8000 });
      const elegir = async (hora) => {
        await fr.goto(F + '?lugar=canchaana'); await frenteListo(fr);
        await fr.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 });
        await fr.click('.cupo[data-i="1"]'); await fr.click(`.slot[data-t="${hora}"]`); await fr.waitForTimeout(300);
        await fr.click('#ir-pagar [data-act="reservar"]'); await fr.waitForSelector('#pago-root .chk__turno');
      };
      await elegir('20:00');
      ok(/Pagás la seña en Mercado Pago/.test(await fr.textContent('#pago-root')) && !/Bookea está en prueba/.test(await fr.textContent('#pago-root')), 'página: con Mercado Pago conectado, avisa que la seña se paga en Mercado Pago');
      await Promise.all([fr.waitForURL(/mercadopago\.com\.ar\/checkout/, { timeout: 10000 }), fr.click('.chk__side [data-act="pay"]')]);
      const orden = new URL(fr.url()).searchParams.get('order_id');
      const o = (await mp()).ordenes.find((x) => x.id === orden);
      const tp = await sql(`select row_to_json(t) from turnos t where t.id = '${o && o.external_reference}'`);
      ok(o && tp && tp.estado === 'pendiente' && o.total_amount === `${tp.sena}.00`, 'página: "Pagar seña" lleva a Mercado Pago con el cobro de la seña; el turno espera el pago');
      // En la agenda de Ana: "Esperando la seña"
      await an.click('.menu__i[data-vista="agenda"]'); await an.waitForTimeout(300);
      await an.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await an.waitForTimeout(800);
      await an.click('[data-mover="1"]'); await an.waitForTimeout(400);
      ok(/Esperando la seña/.test(await an.textContent('#vista')), 'panel: en la agenda, el turno que se está pagando dice "Esperando la seña"');
      // Mercado Pago cobra, avisa y vuelve a la página
      await mp('/pagar', { orden });
      await fr.goto(o.config.online.success_url);
      await fr.waitForSelector('#page-turnos:not([hidden]) .okban:not(.okban--espera)', { timeout: 15000 });
      ok(/Listo, tu turno está confirmado/.test(await fr.textContent('.okban')) && /Confirmado/.test(await fr.textContent('.tcard.is-new')) && !(await fr.isVisible('.tcard--espera')),
        'página: al volver de Mercado Pago, el turno está confirmado en Mis turnos');
      ok(new URL(fr.url()).search === '', 'al volver, la dirección queda limpia');
      await fr.screenshot({ path: `${out}/mp-pagado.png` });

      // Si el pago no sale: vuelve y el turno sigue esperando, con "Pagar seña" (usa el mismo cobro)
      await elegir('21:00');
      await Promise.all([fr.waitForURL(/mercadopago\.com\.ar\/checkout/, { timeout: 10000 }), fr.click('.chk__side [data-act="pay"]')]);
      const orden2 = new URL(fr.url()).searchParams.get('order_id');
      const o2 = (await mp()).ordenes.find((x) => x.id === orden2);
      await mp('/pagar', { orden: orden2, rechazo: 'high_risk' }); // Mercado Pago rechaza la tarjeta: el cobro sigue abierto
      await fr.goto(o2.config.online.failure_url);
      await fr.waitForSelector('.okban--espera', { timeout: 15000 });
      ok((await sql(`select to_json(pagos -> 0 ->> 'detalle') from mp_cobros where orden = '${orden2}'`)) === 'high_risk',
        'el motivo del pago rechazado (lo que "No pudimos procesar tu pago" no dice) queda anotado en mp_cobros.pagos');
      ok(/La seña todavía no se pagó/.test(await fr.textContent('.okban--espera')) && /Esperando el pago/.test(await fr.textContent('.tcard--espera'))
        && await fr.isVisible('.tcard--espera [data-act="mp-pagar"]'), 'página: si el pago no sale, el turno sigue esperando en Mis turnos, con "Pagar seña"');
      await fr.screenshot({ path: `${out}/mp-espera.png` });
      const cel = await nueva(390, 844);
      await cel.goto(F + '#mis-turnos'); await frenteListo(cel);
      await cel.fill('#cu-email', 'juli@prueba.com'); await cel.fill('#cu-clave', 'canchas2026'); await cel.click('#f-cuenta button[type=submit]');
      await cel.waitForSelector('.tcard--espera', { timeout: 8000 });
      ok(await cel.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'en el celular, Mis turnos con uno esperando el pago entra a lo ancho');
      await cel.locator('.tcard--espera').screenshot({ path: `${out}/mp-espera-celu.png` });
      await Promise.all([fr.waitForURL(/mercadopago\.com\.ar\/checkout/, { timeout: 10000 }), fr.click('.tcard--espera [data-act="mp-pagar"]')]);
      ok(new URL(fr.url()).searchParams.get('order_id') === orden2, 'página: "Pagar seña" vuelve al mismo cobro de Mercado Pago');
      await mp('/pagar', { orden: orden2 });
      await fr.goto(o2.config.online.success_url);
      await fr.waitForSelector('#page-turnos:not([hidden]) .okban:not(.okban--espera)', { timeout: 15000 });
      ok((await fr.locator('.tcard--espera').count()) === 0, 'después de pagar, ya no queda ninguno esperando');
      // ---------- Sin seña (pregunta del dueño, 27/11): con la seña en 0 %, el turno se confirma sin pasar por Mercado Pago ----------
      await an.click('.menu__i[data-vista="negocio"]'); await an.waitForSelector('#g-sena');
      await an.fill('#g-sena', '0');
      ok(/En 0 %, sin seña/.test(await an.textContent('#g-sena-ayuda')) && /tu seña está en 0 %/.test(await an.textContent('#g-mp')) && /Conectada/.test(await an.textContent('#g-mp')),
        'panel: con la seña en 0 %, la ayuda y la tarjeta de Mercado Pago dicen que los turnos se confirman sin cobrar nada');
      for (let i = 0; i < 40 && (await sql(`select to_json(ajustes ->> 'senaPct') from negocios where id = '${neg}'`)) !== '0'; i++) await an.waitForTimeout(250);
      ok((await sql(`select to_json(ajustes ->> 'senaPct') from negocios where id = '${neg}'`)) === '0', 'panel: la seña en 0 % queda guardada');
      await an.locator('.ng-card--mp').screenshot({ path: `${out}/mp-panel-sin-sena.png` });
      await fr.goto(F + '?lugar=canchaana'); await frenteListo(fr);
      await fr.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 });
      ok(/Sin seña/.test(await fr.textContent('.ficha__head')) && /no pide seña/.test(await fr.textContent('#ficha-root')), 'página: la ficha dice "Sin seña"');
      await fr.click('.cupo[data-i="1"]'); await fr.click('.slot[data-t="22:00"]'); await fr.waitForTimeout(300);
      ok(/^Reservar/.test((await fr.textContent('#ir-pagar [data-act="reservar"]')).trim()) && /sin seña/.test(await fr.textContent('#ir-pagar')), 'página: el aviso verde dice "Reservar" y "sin seña", no "Ir a pagar"');
      await fr.click('#ir-pagar [data-act="reservar"]'); await fr.waitForSelector('#pago-root .chk__turno');
      const lado = await fr.textContent('.chk__side');
      ok((await fr.textContent('.chk__side [data-act="pay"]')).trim() === 'Confirmar turno' && /Sin seña/.test(lado) && !/Mercado Pago|en prueba/.test(lado)
        && (await fr.title()) === 'Confirmá tu turno · Bookea', 'página: sin seña, "Confirmar turno", sin Mercado Pago ni "en prueba"');
      await fr.screenshot({ path: `${out}/sin-sena-confirmar.png` });
      const antes = (await mp()).ordenes.length;
      await fr.click('.chk__side [data-act="pay"]');
      await fr.waitForSelector('#page-turnos:not([hidden]) .okban:not(.okban--espera)', { timeout: 15000 });
      const ts = await sql(`select row_to_json(t) from turnos t where t.negocio_id = '${neg}' and t.hora = '22:00' and t.estado = 'confirmado'`);
      ok(new URL(fr.url()).host === new URL(B).host && (await mp()).ordenes.length === antes && ts && ts.sena === 0 && ts.pago === ''
        && !(await sql(`select to_json(count(*)) from mp_cobros where turno_id = '${ts && ts.id}'`)),
        'página: "Confirmar turno" confirma en el momento, sin ir a Mercado Pago ni armar un cobro');
      ok(/Listo, tu turno está confirmado/.test(await fr.textContent('.okban')) && /Lo pagás en el lugar/.test(await fr.textContent('.okban'))
        && /Sin seña/.test(await fr.textContent('.tcard.is-new')) && /Confirmado/.test(await fr.textContent('.tcard.is-new')), 'Mis turnos: confirmado y "Sin seña"');
      await fr.screenshot({ path: `${out}/sin-sena-turnos.png` });
      await fr.click('.tcard.is-new [data-act="cancel"]');
      ok(/no tiene seña/.test(await fr.textContent('#dlg-p')), 'cancelar uno sin seña: "Este turno no tiene seña"');
      await fr.click('#dlg-no');
      for (const [n, p] of [['panel', an], ['página', fr], ['celular', cel]]) ok(!p.errs.length, `sin errores en la consola (${n}) ${p.errs.join(' | ')}`);
    } finally {
      await nav.close();
    }
  } catch (e) {
    console.log('FALLA ' + (e.stack || e));
    process.exitCode = 1;
  } finally {
    srv.kill();
  }
})();
