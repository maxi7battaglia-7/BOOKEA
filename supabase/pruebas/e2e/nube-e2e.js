// Prueba de punta a punta del modo "nube": el panel real + Postgres con las reglas de supabase/esquema.sql.
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const AQUI = __dirname, out = AQUI + '/capturas';
require('fs').mkdirSync(out, { recursive: true });
const URL_ = 'http://localhost:8787/admin.html';
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FALLA ') + m); if (!c) process.exitCode = 1; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  execFileSync('bash', [AQUI + '/base.sh']);
  const srv = spawn('node', [AQUI + '/puente.js'], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => srv.stdout.once('data', r));
  const sql = async (q) => { const r = await (await fetch('http://localhost:8787/api/sql', { method: 'POST', body: JSON.stringify({ sql: q }) })).json(); if (r.error) throw new Error(r.error.message); return JSON.parse(r.data || 'null'); };
  const b = await chromium.launch();
  const nueva = async (w = 1440, h = 900) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript({ path: AQUI + '/falso-supabase.js' });
    const p = await ctx.newPage();
    p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); });
    return p;
  };
  const listo = (p) => p.waitForFunction(() => !document.querySelector('.bienv')).then(() => p.waitForTimeout(150));
  const registrar = async (p, d) => {
    await p.click('[data-ir="registro"]');
    await p.fill('#r-nombre', d.nombre); await p.fill('#r-negocio', d.negocio); await p.fill('#r-rubro', d.rubro);
    await p.fill('#r-email', d.email); await p.fill('#r-clave', d.clave); await p.fill('#r-clave2', d.clave);
    await p.click('#f-registro button[type=submit]');
  };
  const ingresar = async (p, email, clave) => { await p.fill('#i-email', email); await p.fill('#i-clave', clave); await p.click('#f-ingresar button[type=submit]'); };

  try {
    // ---------- Pantalla de entrada con la base ----------
    const a = await nueva();
    await a.goto(URL_); await a.waitForSelector('#f-ingresar:not([hidden])');
    ok(await a.isVisible('.caja__olvido') && !(await a.isVisible('.caja__demo')) && !(await a.isVisible('.entrada__nota')), 'con la base: aparece "¿Te olvidaste la contraseña?" y no los datos de prueba');
    await a.screenshot({ path: `${out}/nb-entrada.png` });

    // ---------- Crear cuenta: queda en revisión hasta que Bookea la apruebe ----------
    await registrar(a, { nombre: 'Ana Gómez', negocio: 'Los Álamos Pádel', rubro: 'Pádel', email: 'ana@prueba.com', clave: 'canchas2026' });
    await a.waitForSelector('#f-espera:not([hidden])');
    ok(!(await a.isVisible('#panel')) && (await a.textContent('#t-espera')) === 'Tu negocio está en revisión' && (await a.textContent('#es-texto')).includes('Los Álamos Pádel'),
      'cuenta nueva: no entra al panel, queda "en revisión"');
    ok((await sql(`select to_json(estado) from negocios where email_dueno = 'ana@prueba.com'`)) === 'pendiente', 'en la base: el negocio de Ana está pendiente');
    await a.screenshot({ path: `${out}/nb-espera.png` });
    await a.click('#es-volver'); await a.waitForFunction(() => /Todavía/.test(document.querySelector('#es-msg').textContent));
    ok(!(await a.isVisible('#panel')), '"Volver a fijarme" mientras sigue pendiente: sigue afuera');

    // ---------- El equipo de Bookea aprueba desde Solicitudes ----------
    const adm = await nueva();
    await adm.goto(URL_); await adm.waitForSelector('#f-ingresar:not([hidden])');
    await registrar(adm, { nombre: 'Maxi', negocio: 'Bookea', rubro: 'Software', email: 'equipo@bookea.test', clave: 'equipo2026' });
    await adm.waitForSelector('#f-espera:not([hidden])');
    await sql(`with x as (insert into admins_bookea (user_id) select id from auth.users where email = 'equipo@bookea.test' returning 1) select count(*) from x`);
    await adm.click('#es-volver'); await adm.waitForSelector('#panel:not([hidden])'); await listo(adm);
    ok(await adm.isVisible('#ir-solicitudes') && (await adm.textContent('#sol-n')) === '2', 'el equipo de Bookea entra aunque su negocio esté pendiente, y ve "Solicitudes (2)"');
    await adm.click('#ir-solicitudes'); await adm.waitForSelector('.sol');
    ok((await adm.locator('.sol').count()) === 2 && (await adm.textContent('#vista')).includes('ana@prueba.com'), 'Solicitudes: muestra los dos negocios con el email de quien lo pidió');
    await adm.screenshot({ path: `${out}/nb-solicitudes.png`, fullPage: true });
    await adm.locator('.sol', { hasText: 'Los Álamos Pádel' }).locator('[data-ok="1"]').click();
    await adm.waitForFunction(() => /quedó aprobado/.test(document.querySelector('#aviso').textContent));
    await adm.waitForSelector('.sol');
    await adm.locator('.sol', { hasText: 'equipo@bookea.test' }).locator('[data-ok="1"]').click();
    await adm.waitForTimeout(800);
    ok((await sql(`select json_agg(estado order by email_dueno) from negocios`)).join() === 'aprobado,aprobado', 'aprobó a Ana y a su propio negocio');
    await adm.screenshot({ path: `${out}/nb-solicitudes-2.png`, fullPage: true });

    // ---------- Ana vuelve a fijarse y entra ----------
    await a.click('#es-volver'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    ok(/Mi negocio/.test(await a.textContent('#vista h1')) && (await a.textContent('#lado-neg')) === 'Los Álamos Pádel', 'aprobada: entra a Mi negocio de "Los Álamos Pádel"');
    ok(!(await a.isVisible('#ir-solicitudes')), 'Ana no ve "Solicitudes" (no es del equipo de Bookea)');
    const autoAprobarse = await a.evaluate(async () => { const c = window.__clientes[window.__clientes.length - 1]; const r = await c.rpc('revisar_negocio', { n: '00000000-0000-0000-0000-000000000000', aprobar: true }); return r.error && r.error.code; });
    ok(autoAprobarse === '42501', 'Ana no puede aprobar negocios ni pidiéndolo directo a la base');
    await espera(600);
    const negA = (await sql(`select json_agg(x) from (select n.id, n.slug, n.ajustes, m.rol, u.email from negocios n join miembros m on m.negocio_id = n.id join auth.users u on u.id = m.user_id where u.email = 'ana@prueba.com') x`))[0];
    ok(negA && negA.slug === 'losalamospadel' && negA.rol === 'dueno' && negA.email === 'ana@prueba.com', 'en la base: negocio "losalamospadel" con Ana como dueña');
    ok(negA && negA.ajustes && Array.isArray(negA.ajustes.recursos) && negA.ajustes.horario.length === 7, 'en la base: quedaron guardados los ajustes iniciales (canchas, horarios, precios)');

    // ---------- Mi negocio: guardar cambios ----------
    await a.fill('#g-ciudad', 'Tunuyán'); await a.fill('#g-desc', 'Tres canchas, una techada.');
    await a.waitForFunction(() => /Guardado/.test(document.querySelector('#g-msg').textContent), null, { timeout: 10000 }); // se guarda solo
    const n1 = (await sql(`select row_to_json(n) from negocios n where slug = 'losalamospadel'`));
    ok(n1.ciudad === 'Tunuyán' && n1.descripcion === 'Tres canchas, una techada.', 'Mi negocio: ciudad y descripción guardadas en la base');

    // ---------- Cargar un turno ----------
    await a.click('[data-vista="agenda"]'); await a.waitForTimeout(300);
    await a.click('[data-nuevo]'); await a.waitForSelector('#f-nuevo');
    // mañana (o pasado, si mañana es domingo: un negocio nuevo cierra los domingos)
    const manana = await a.evaluate(() => { let d = new Date(Date.now() + 864e5); if (d.getUTCDay() === 0) d = new Date(d.getTime() + 864e5); return d.toISOString().slice(0, 10); });
    await a.fill('#n-fecha', manana); await a.dispatchEvent('#n-fecha', 'change'); await a.waitForTimeout(150);
    const hora = await a.evaluate(() => [...document.querySelectorAll('#n-hora option')].find((o) => o.value && !o.disabled).value);
    await a.selectOption('#n-hora', hora);
    await a.fill('#n-cli', 'Juan P.'); await a.fill('#n-wa', '2622 111 222');
    await a.click('#f-nuevo button[type=submit]'); await a.waitForTimeout(900);
    const r1 = await sql(`select json_agg(r) from reservas r`);
    ok(r1 && r1.length === 1 && r1[0].cliente === 'Juan P.' && r1[0].fecha === manana && r1[0].estado === 'confirmada', 'turno cargado: queda en la base (' + (r1 && r1.length) + ')');

    // ---------- Recargar: la sesión sigue y los datos vienen de la base ----------
    await a.reload(); await a.waitForSelector('#f-ingresar:not([hidden])');
    ok(!(await a.isVisible('#panel')), 'al recargar pide email y contraseña de nuevo (la sesión vive solo en memoria)');
    await ingresar(a, 'ana@prueba.com', 'canchas2026'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    ok((await a.textContent('#lado-user')).includes('ana@prueba.com'), 'vuelve a entrar con su email');
    await a.click('[data-vista="clientes"]'); await a.waitForTimeout(300);
    ok((await a.textContent('#vista')).includes('Juan P.'), 'después de recargar, el turno sigue (Clientes muestra a Juan P.)');

    // ---------- Otra cuenta, mismo nombre de negocio ----------
    await a.click('#salir'); await a.waitForSelector('#f-ingresar:not([hidden])');
    await registrar(a, { nombre: 'Beto', negocio: 'Los Álamos Pádel', rubro: 'Fútbol', email: 'beto@prueba.com', clave: 'futbol2026' });
    await a.waitForSelector('#f-espera:not([hidden])');
    await sql(`with x as (update negocios set estado = 'aprobado' where email_dueno = 'beto@prueba.com' returning 1) select count(*) from x`);
    await a.click('#es-volver'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    ok((await a.inputValue('#g-slug')) === 'losalamospadel2', 'segundo negocio con el mismo nombre: link propio "losalamospadel2"');
    await a.click('[data-vista="clientes"]'); await a.waitForTimeout(300);
    ok(!(await a.textContent('#vista')).includes('Juan P.'), 'Beto no ve los clientes ni turnos de Ana');
    // desde la consola del navegador, pidiendo directo a la base, tampoco
    const robados = await a.evaluate(async () => { const c = window.__clientes[window.__clientes.length - 1]; const r = await c.from('reservas').select('*'); const n = await c.from('negocios').select('*'); return [r.data.length, n.data.length]; });
    ok(robados[0] === 0 && robados[1] === 1, 'aunque Beto pida todo directo a la base, solo recibe su negocio y ninguna reserva de Ana');
    const intento = await a.evaluate(async (id) => { const c = window.__clientes[window.__clientes.length - 1]; const r = await c.from('negocios').update({ nombre: 'Hackeado' }).eq('id', id); return r.data && r.data.length; }, negA.id);
    ok(intento === 0, 'Beto no puede cambiar el negocio de Ana');
    const nomA = await sql(`select to_json(nombre) from negocios where slug = 'losalamospadel'`);
    ok(nomA === 'Los Álamos Pádel', 'el negocio de Ana sigue intacto: ' + nomA);

    // ---------- Link repetido ----------
    await a.click('[data-vista="negocio"]'); await a.waitForTimeout(300);
    await a.fill('#g-slug', 'losalamospadel'); await a.fill('#g-ciudad', 'Tupungato');
    await a.waitForFunction(() => /link|guardar/i.test(document.querySelector('#g-msg').textContent), null, { timeout: 10000 }); // se guarda solo
    ok(await a.isVisible('#g-slug-err') && (await a.textContent('#g-slug-err')).includes('ya lo usa otro negocio'), 'link de otro negocio: avisa al lado del campo');
    const nb = await sql(`select row_to_json(n) from negocios n where n.email_dueno = 'beto@prueba.com'`);
    ok(nb.slug === 'losalamospadel2' && nb.ciudad === 'Tupungato', 'se guardó todo menos el link (' + nb.slug + ', ' + nb.ciudad + ')');
    await a.screenshot({ path: `${out}/nb-slug.png` });

    // ---------- Errores al entrar ----------
    await a.click('#salir'); await a.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(a, 'ana@prueba.com', 'otra-clave'); await a.waitForTimeout(400);
    ok((await a.textContent('#i-msg')) === 'El email o la contraseña no coinciden.', 'contraseña mal: avisa');
    await registrar(a, { nombre: 'Ana', negocio: 'Otro', rubro: 'Pádel', email: 'ana@prueba.com', clave: 'canchas2026' }); await a.waitForTimeout(400);
    ok((await a.textContent('#r-email-err')).includes('Ya hay una cuenta'), 'email que ya tiene cuenta: avisa');
    ok((await sql(`select count(*) from negocios`)) === 3, 'y no crea otro negocio');
    await a.click('#f-registro [data-ir="ingresar"]');

    // ---------- Cambiar nombre y contraseña ----------
    await ingresar(a, 'ana@prueba.com', 'canchas2026'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    await a.click('[data-vista="cuenta"]'); await a.waitForTimeout(300);
    ok((await a.inputValue('#cu-user')) === 'ana@prueba.com' && !(await a.isVisible('#cu-reset')), 'Cuenta: muestra el email y no el botón de datos de prueba');
    await a.fill('#cu-nombre', 'Ana María'); await a.click('#f-datos button[type=submit]'); await a.waitForTimeout(400);
    await a.fill('#cu-a', 'mal-mal-mal'); await a.fill('#cu-n', 'nueva2026x'); await a.fill('#cu-r', 'nueva2026x');
    await a.click('#f-clave button[type=submit]'); await a.waitForTimeout(500);
    ok(await a.isVisible('#cu-a-err'), 'cambiar contraseña con la actual mal: avisa');
    await a.fill('#cu-a', 'canchas2026'); await a.click('#f-clave button[type=submit]'); await a.waitForTimeout(600);
    ok((await a.textContent('#aviso')).includes('Contraseña cambiada'), 'contraseña cambiada');
    await a.click('#salir'); await a.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(a, 'ana@prueba.com', 'canchas2026'); await a.waitForTimeout(400);
    ok(!(await a.isVisible('#panel')), 'la contraseña vieja ya no sirve');
    await ingresar(a, 'ana@prueba.com', 'nueva2026x'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    ok((await a.textContent('#lado-user')).startsWith('Ana María'), 'con la nueva entra, y el nombre cambiado quedó guardado');

    // ---------- Dos dispositivos a la vez ----------
    const c = await nueva(1280, 800);
    await c.goto(URL_); await c.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(c, 'ana@prueba.com', 'nueva2026x'); await c.waitForSelector('#panel:not([hidden])'); await listo(c);
    // en el celular se carga un turno en un horario...
    await a.click('[data-vista="agenda"]'); await a.waitForTimeout(200);
    await a.click('[data-nuevo]'); await a.waitForSelector('#f-nuevo');
    await a.fill('#n-fecha', manana); await a.dispatchEvent('#n-fecha', 'change'); await a.waitForTimeout(150);
    const libreA = await a.evaluate(() => [...document.querySelectorAll('#n-hora option')].find((o) => o.value && !o.disabled).value);
    // ...y en la compu, que todavía no se enteró, se intenta el mismo
    await c.click('[data-vista="agenda"]'); await c.waitForTimeout(200);
    await c.click('[data-nuevo]'); await c.waitForSelector('#f-nuevo');
    await c.fill('#n-fecha', manana); await c.dispatchEvent('#n-fecha', 'change'); await c.waitForTimeout(150);
    await a.selectOption('#n-hora', libreA); await a.fill('#n-cli', 'Desde el celular'); await a.click('#f-nuevo button[type=submit]'); await a.waitForTimeout(800);
    await c.selectOption('#n-hora', libreA); await c.fill('#n-cli', 'Desde la compu'); await c.click('#f-nuevo button[type=submit]');
    await c.waitForFunction(() => /otra reserva/.test(document.querySelector('#aviso').textContent), null, { timeout: 5000 }).catch(() => {});
    ok((await c.textContent('#aviso')).includes('otra reserva'), 'mismo horario desde dos dispositivos: el segundo avisa que ya está ocupado');
    await c.waitForTimeout(800);
    const enEseHorario = await sql(`select json_agg(cliente) from reservas where fecha = '${manana}' and hora = ${libreA} and estado <> 'cancelada'`);
    ok(enEseHorario && enEseHorario.length === 1 && enEseHorario[0] === 'Desde el celular', 'en la base queda una sola reserva en ese horario: ' + JSON.stringify(enEseHorario));
    await c.click('[data-vista="clientes"]'); await c.waitForTimeout(300);
    ok((await c.textContent('#vista')).includes('Desde el celular'), 'la compu se actualizó y ahora muestra el turno del celular');

    // ---------- Me olvidé la contraseña ----------
    await a.click('#salir'); await a.waitForSelector('#f-ingresar:not([hidden])');
    await a.fill('#i-email', 'ana@prueba.com');
    await a.click('[data-ir="olvido"]');
    ok((await a.inputValue('#o-email')) === 'ana@prueba.com', 'olvido: trae el email que ya habías escrito');
    await a.click('#f-olvido button[type=submit]'); await a.waitForTimeout(400);
    const recu = await (await fetch('http://localhost:8787/api/recuperos')).json();
    ok((await a.textContent('#o-msg')).startsWith('Listo.') && recu.includes('ana@prueba.com'), 'olvido: pide el mail de recuperación');
    await a.screenshot({ path: `${out}/nb-olvido.png` });

    // ---------- Con confirmación de email activada ----------
    await fetch('http://localhost:8787/api/confirmar', { method: 'POST', body: JSON.stringify({ si: true }) });
    await a.click('#f-olvido [data-ir="ingresar"]');
    await registrar(a, { nombre: 'Caro', negocio: 'Barbería Caro', rubro: 'Barbería', email: 'caro@prueba.com', clave: 'barberia26' });
    await a.waitForTimeout(500);
    ok(await a.isVisible('#f-ingresar') && (await a.textContent('#i-msg')).includes('Te mandamos un mail a caro@prueba.com'), 'si hay que confirmar el email: lo explica y vuelve a Ingresar');
    await a.screenshot({ path: `${out}/nb-confirmar.png` });
    await ingresar(a, 'caro@prueba.com', 'barberia26'); await a.waitForTimeout(400);
    ok((await a.textContent('#i-msg')).includes('Todavía no confirmaste'), 'sin confirmar: no entra y dice por qué');

    // ---------- Llega desde el link del mail para elegir contraseña nueva ----------
    await fetch('http://localhost:8787/api/confirmar', { method: 'POST', body: JSON.stringify({ si: false }) });
    const rr = await nueva();
    await rr.goto(URL_); await rr.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(rr, 'ana@prueba.com', 'nueva2026x'); await rr.waitForSelector('#panel:not([hidden])'); await listo(rr);
    // (Supabase abre la sesión con el link y vuelve a la página con #...type=recovery)
    const idAna = await sql(`select to_json(id) from auth.users where email = 'ana@prueba.com'`);
    await rr.goto('about:blank'); await rr.goto(URL_ + '#access_token=' + idAna + '&type=recovery'); await rr.waitForSelector('#f-nueva:not([hidden])');
    ok(!(await rr.isVisible('#panel')), 'desde el link del mail: pide la contraseña nueva antes de entrar');
    await rr.waitForFunction(() => !location.hash, null, { timeout: 5000 }).catch(() => {});
    ok(!(await rr.evaluate(() => location.hash)), 'y saca los datos del link de la dirección');
    await rr.screenshot({ path: `${out}/nb-nueva.png` });
    await rr.fill('#nc-clave', 'corta'); await rr.fill('#nc-clave2', 'corta'); await rr.click('#f-nueva button[type=submit]'); await rr.waitForTimeout(200);
    ok(await rr.isVisible('#nc-clave-err'), 'contraseña nueva muy corta: avisa');
    await rr.fill('#nc-clave', 'recuperada26'); await rr.fill('#nc-clave2', 'recuperada26'); await rr.click('#f-nueva button[type=submit]');
    await rr.waitForSelector('#panel:not([hidden])');
    ok((await rr.textContent('#aviso')).includes('contraseña nueva'), 'la guarda y entra al panel');
    await rr.click('#salir'); await rr.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(rr, 'ana@prueba.com', 'recuperada26'); await rr.waitForSelector('#panel:not([hidden])');
    ok(true, 'después entra con la contraseña nueva');
    ok(!rr.errs.length, 'sin errores en la consola (recuperar) ' + rr.errs.join(' | '));

    // ---------- Quitarle el acceso a un negocio ----------
    await adm.click('#ir-solicitudes'); await adm.waitForSelector('.sol');
    const bBeto = adm.locator('.sol', { hasText: 'beto@prueba.com' }).locator('[data-ok="0"]');
    await bBeto.click(); ok((await bBeto.textContent()).includes('confirmar'), 'quitar acceso pide confirmar');
    await bBeto.click(); await adm.waitForFunction(() => /sin acceso/.test(document.querySelector('#aviso').textContent));
    const bt = await nueva();
    await bt.goto(URL_); await bt.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(bt, 'beto@prueba.com', 'futbol2026'); await bt.waitForSelector('#f-espera:not([hidden])');
    ok((await bt.textContent('#t-espera')) === 'Tu solicitud no fue aprobada' && !(await bt.isVisible('#es-volver')) && !(await bt.isVisible('#panel')), 'sin acceso: Beto ya no entra al panel y se le explica');
    ok(!adm.errs.length && !bt.errs.length, 'sin errores en la consola (equipo de Bookea y Beto) ' + adm.errs.concat(bt.errs).join(' | '));

    // ---------- Equipo: el dueño suma a alguien con permisos ----------
    await fetch('http://localhost:8787/api/confirmar', { method: 'POST', body: JSON.stringify({ si: false }) });
    // el dueño (Ana) arma la invitación desde Equipo
    await a.reload(); await a.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(a, 'ana@prueba.com', 'recuperada26'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    await a.click('.menu__i[data-vista="equipo"]'); await a.waitForSelector('[data-invitar]');
    await a.click('[data-invitar]'); await a.waitForSelector('#f-invitar');
    await a.fill('#iv-nombre', 'Ema Ruiz'); await a.fill('#iv-email', 'ema@prueba.com');
    await a.click('input[name="perm"][value="turnos"]'); // queda solo "ver la agenda"
    await a.click('#f-invitar button[type=submit]'); await a.waitForSelector('#iv-link');
    const link = await a.inputValue('#iv-link');
    const inv = await sql(`select coalesce(json_agg(json_build_object('e', email, 'p', permisos)), '[]') from invitaciones`);
    ok(inv.length === 1 && inv[0].e === 'ema@prueba.com' && JSON.stringify(inv[0].p) === '["agenda"]' && link.includes('?invitacion='), 'equipo: el dueño crea la invitación (en la base, con sus permisos) y recibe el link');
    await a.click('.dlg [data-cerrar].btn'); await a.waitForSelector('.eq--inv');
    await a.screenshot({ path: `${out}/nb-equipo.png`, fullPage: true });
    // Ema abre el link y crea su cuenta
    const e = await nueva();
    await e.goto(link); await e.waitForSelector('#f-unirse:not([hidden]) #u-crear:not([hidden])');
    ok((await e.textContent('#t-unirse')).includes('Los Álamos Pádel') && (await e.inputValue('#u-email')) === 'ema@prueba.com', 'equipo: el link muestra el negocio y el email, sin cuenta');
    await e.fill('#u-clave', 'agenda2026'); await e.fill('#u-clave2', 'agenda2026');
    await e.click('#u-crear'); await e.waitForSelector('#panel:not([hidden])'); await listo(e);
    const miembroEma = await sql(`select json_agg(json_build_object('r', m.rol, 'p', m.permisos, 'n', m.nombre)) from miembros m join auth.users u on u.id = m.user_id where u.email = 'ema@prueba.com'`);
    ok(miembroEma.length === 1 && miembroEma[0].r === 'encargado' && JSON.stringify(miembroEma[0].p) === '["agenda"]' && miembroEma[0].n === 'Ema Ruiz', 'equipo: Ema queda en el equipo de Ana, con solo "ver la agenda"');
    const menuEma = await e.$$eval('.menu__i', (bs) => bs.filter((b) => !b.hidden).map((b) => b.dataset.vista).join());
    ok(menuEma === 'agenda,cuenta' && !(await e.isVisible('[data-nuevo]')) && (await e.locator('[data-libre]').count()) === 0, `equipo: Ema ve solo Agenda y Cuenta, y no puede cargar turnos (${menuEma})`);
    const cargaEma = await e.evaluate(async () => {
      const c = window.__clientes[window.__clientes.length - 1];
      const { data: m } = await c.from('miembros').select('*');
      const r = await c.from('reservas').upsert({ id: crypto.randomUUID(), negocio_id: m[0].negocio_id, recurso: 'r1', fecha: '2030-01-02', hora: 600, estado: 'confirmada' });
      const n = await c.from('negocios').update({ nombre: 'De Ema' }).eq('id', m[0].negocio_id);
      return [r.error && r.error.code, n.data && n.data.length, m.length];
    });
    ok(cargaEma[0] === '42501' && cargaEma[1] === 0 && cargaEma[2] === 1, `equipo: aunque Ema lo pida directo a la base, no carga turnos, no cambia el negocio ni ve al resto del equipo (${cargaEma})`);
    await e.screenshot({ path: `${out}/nb-equipo-ema.png`, fullPage: true });
    // Ana le da "cargar turnos": a Ema le aparece al volver a la pantalla
    await a.reload(); await a.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(a, 'ana@prueba.com', 'recuperada26'); await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    await a.click('.menu__i[data-vista="equipo"]'); await a.waitForSelector('[data-permisos]');
    await a.click('[data-permisos]'); await a.waitForSelector('#f-perm');
    await a.click('#f-perm input[name="perm"][value="turnos"]');
    await a.click('#f-perm button[type=submit]'); await a.waitForFunction(() => /cambiaste lo que puede hacer/.test(document.querySelector('#aviso').textContent));
    await e.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await e.waitForSelector('[data-nuevo]', { timeout: 8000 }).catch(() => {});
    ok(await e.isVisible('[data-nuevo]') && (await e.textContent('#aviso')).includes('Cambiaron tus permisos'), 'equipo: el dueño le da "cargar turnos" y a Ema le aparece "Cargar turno" sin volver a entrar');
    // Ana la saca del equipo: Ema queda afuera
    await a.click('[data-quitar]'); await a.click('[data-quitar]');
    await a.waitForFunction(() => /ya no entra a tu panel/.test(document.querySelector('#aviso').textContent));
    await e.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await e.waitForSelector('#f-ingresar:not([hidden])', { timeout: 8000 }).catch(() => {});
    ok(await e.isVisible('#f-ingresar') && !(await e.isVisible('#panel')), 'equipo: si el dueño la saca, Ema queda afuera del panel');
    await ingresar(e, 'ema@prueba.com', 'agenda2026'); await e.waitForTimeout(800);
    ok((await e.textContent('#i-msg')).includes('no está en ningún negocio'), 'equipo: y al querer entrar se le explica');
    await e.goto(link); await e.waitForSelector('#f-unirse:not([hidden])'); await e.waitForTimeout(500);
    ok((await e.textContent('#t-unirse')) === 'Este link ya no sirve', 'equipo: el link ya usado no sirve más');
    ok(!e.errs.filter((x) => !/Failed to load resource/.test(x)).length, 'sin errores en la consola (Ema) ' + e.errs.join(' | '));

    // ---------- Celular ----------
    const m = await nueva(390, 844);
    await m.goto(URL_); await m.waitForSelector('#f-ingresar:not([hidden])');
    await m.screenshot({ path: `${out}/nb-m-entrada.png`, fullPage: true });
    ok((await m.evaluate(() => document.documentElement.scrollWidth)) === 390, 'celular: la entrada no se desborda');

    // ---------- Llegada desde "Sumá tu negocio" del inicio: el registro abre con los datos cargados ----------
    await m.goto(URL_ + '?alta=1&nombre=Carla+Ruiz&negocio=Estudio+Carla&rubro=Peluquer%C3%ADa'); await m.waitForSelector('#f-registro:not([hidden])');
    ok((await m.inputValue('#r-nombre')) === 'Carla Ruiz' && (await m.inputValue('#r-negocio')) === 'Estudio Carla' && (await m.inputValue('#r-rubro')) === 'Peluquería', 'desde el inicio: el registro abre con nombre, negocio y rubro');
    ok(!m.url().includes('alta=') && (await m.evaluate(() => document.activeElement.id)) === 'r-email', 'y deja la dirección limpia y el foco en el email');
    await m.fill('#r-email', 'carla@prueba.com'); await m.fill('#r-clave', 'peluqueria2026'); await m.fill('#r-clave2', 'peluqueria2026');
    await m.click('#f-registro button[type=submit]'); await m.waitForSelector('#f-espera:not([hidden])');
    const carla = await sql("select coalesce(json_agg(json_build_object('n', nombre, 'r', rubro, 'e', estado, 'd', nombre_dueno)), '[]') from public.negocios where email_dueno = 'carla@prueba.com'");
    ok(carla.length === 1 && carla[0].n === 'Estudio Carla' && carla[0].r === 'Peluquería' && carla[0].e === 'pendiente' && carla[0].d === 'Carla Ruiz', 'la cuenta se crea de verdad: negocio pendiente en la base');

    for (const [n, p] of [['a', a], ['c', c], ['m', m]]) ok(!p.errs.length, `sin errores en la consola (${n}) ${p.errs.join(' | ')}`);

    // ---------- Frente (bookea.ar): el cliente crea su cuenta para pagar la seña (cuenta.js contra la base) ----------
    const F = 'http://localhost:8787/index.html';
    const confirmar = (si) => fetch('http://localhost:8787/api/confirmar', { method: 'POST', body: JSON.stringify({ si }) });
    const frenteListo = (p) => p.waitForFunction(() => document.documentElement.classList.contains('is-ready') && !document.querySelector('.splash'), null, { timeout: 8000 }).then(() => p.waitForTimeout(500));
    const pag = (p) => p.evaluate(() => document.querySelector('.page:not([hidden])').dataset.page);
    // captura de la página entera: antes baja hasta el final, así cada bloque hace su entrada y se ve
    const entera = async (p, ruta) => {
      await p.evaluate(async () => { for (let y = 0; y <= document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); } scrollTo(0, 0); });
      await p.waitForTimeout(900); await p.screenshot({ path: ruta, fullPage: true });
    };
    const aPagar = async (p) => {
      await p.goto(F + '?rubro=padel'); await frenteListo(p);
      await p.click('.qslot >> nth=0'); await p.waitForTimeout(500);
      await p.click('#ir-pagar [data-act="reservar"]'); await p.waitForSelector('#pago-root .chk__turno');
    };
    const crearCuenta = async (p, d) => {
      await p.fill('#cu-nombre', d.nombre); await p.fill('#cu-email', d.email); await p.fill('#cu-cel', d.cel); await p.fill('#cu-clave', d.clave);
      await p.check('#cu-acepto'); if (d.promos) await p.check('#cu-promos');
      await p.click('#f-cuenta button[type=submit]');
    };
    await confirmar(true);
    const f1 = await nueva();
    await aPagar(f1);
    ok(await f1.isVisible('#f-cuenta[data-modo="nueva"]'), 'frente con la base: para pagar la seña pide crear la cuenta');
    await crearCuenta(f1, { nombre: 'Juli Paz', email: 'juli@prueba.com', cel: '261 555 1234', clave: 'canchas2026', promos: true });
    await f1.waitForSelector('#cuenta.cuenta--mail');
    const juli = await sql("select row_to_json(c) from public.clientes c where email = 'juli@prueba.com'");
    ok(juli && juli.nombre === 'Juli Paz' && juli.celular === '261 555 1234' && juli.promos === true, 'frente: la cuenta queda en la base con nombre, email, celular y promociones');
    ok((await f1.textContent('#cuenta')).includes('juli@prueba.com') && (await pag(f1)) === 'pago', 'frente: con "Confirm email" pide confirmar el email, sin salir del pago');
    await f1.screenshot({ path: `${out}/fr-confirmar.png`, fullPage: true });
    await f1.click('.chk__side [data-act="pay"]'); await f1.waitForTimeout(400);
    ok(!(await f1.isVisible('.mpov')) && /Confirmá tu email/.test(await f1.textContent('#cu-msg')), 'frente: sin confirmar el email no se paga');
    await f1.click('[data-act="cu-ya"]'); await f1.waitForSelector('#f-cuenta[data-modo="entrar"]');
    ok((await f1.inputValue('#cu-email')) === 'juli@prueba.com', 'frente: "Ya lo confirmé" sin haberlo hecho: pide entrar, con el email ya escrito');
    await f1.fill('#cu-clave', 'canchas2026'); await f1.click('#f-cuenta button[type=submit]'); await f1.waitForSelector('#cuenta.cuenta--mail');
    ok(/Todavía no confirmaste/.test(await f1.textContent('#cu-msg')), 'frente: entrar sin haber confirmado: lo explica y sigue esperando');
    // confirma con el link del mail, en este mismo navegador: vuelve solo al pago, con la cuenta abierta
    await sql("with x as (update auth.users set confirmado = true where email = 'juli@prueba.com' returning 1) select count(*) from x");
    const juliId = await sql("select to_json(id) from auth.users where email = 'juli@prueba.com'");
    await f1.goto(F + `?cuenta=confirmada#access_token=${juliId}&type=signup`); await frenteListo(f1);
    await f1.waitForSelector('#cuenta.cuenta--yo', { timeout: 6000 });
    ok((await pag(f1)) === 'pago' && /Juli Paz/.test(await f1.textContent('#cuenta')) && !/access_token|cuenta=/.test(f1.url()), 'frente: con el link del mail entra solo y vuelve a pagar el turno guardado (la dirección queda limpia)');
    await f1.click('.chk__side [data-act="pay"]'); await f1.waitForSelector('#page-turnos:not([hidden]) .tcard', { timeout: 8000 });
    const t1 = await sql("select row_to_json(t) from public.turnos t join public.clientes c on c.id = t.cliente_id where c.email = 'juli@prueba.com'");
    ok(t1 && t1.estado === 'confirmado' && t1.lugar && t1.cancha && (await f1.textContent('.tcard .code')) === t1.codigo, `frente: al pagar, el turno queda en la base (${t1 && t1.lugar}, ${t1 && t1.cancha}) con el código que se ve en Mis turnos`);
    await f1.screenshot({ path: `${out}/fr-mis-turnos.png`, fullPage: true });
    await f1.reload(); await frenteListo(f1);
    await f1.click('.foot a[data-go="turnos"]'); await f1.waitForSelector('.micuenta');
    ok((await f1.locator('.tcard').count()) === 1, 'frente: al volver a abrir la página sigue adentro, con su turno');
    // Otro cliente (sin "Confirm email") quiere el mismo horario: la base no lo deja
    await confirmar(false);
    const f2 = await nueva();
    await aPagar(f2);
    await crearCuenta(f2, { nombre: 'Nico Ríos', email: 'nico@prueba.com', cel: '261 444 0000', clave: 'canchas2026' });
    await f2.waitForSelector('#cuenta.cuenta--yo');
    ok(!(await sql("select to_json(promos) from public.clientes where email = 'nico@prueba.com'")), 'frente: sin confirmación por mail entra enseguida (y sin promociones si no las marcó)');
    await f2.click('.chk__side [data-act="pay"]'); await f2.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 });
    ok(/lo acaba de reservar otra persona/.test(await f2.textContent('#toast')) && (await sql("select count(*) from public.turnos where estado = 'confirmado'")) === 1, 'frente: si otra persona ya pagó ese horario, la base lo frena y vuelve a elegir');
    // Juli corrige sus datos y cancela
    await f1.click('[data-act="cu-editar"]'); await f1.fill('#dd-cel', '261 555 9999'); await f1.uncheck('#dd-promos');
    await f1.click('#f-datos button[type=submit]'); await f1.waitForFunction(() => !document.querySelector('#dlg-datos').open);
    const juli2 = await sql("select row_to_json(c) from public.clientes c where email = 'juli@prueba.com'");
    ok(juli2.celular === '261 555 9999' && juli2.promos === false && /261 555 9999/.test(await f1.textContent('.micuenta')), 'frente: corregir sus datos los cambia en la base');
    await f1.click('[data-act="cancel"]'); await f1.click('#dlg-si'); await f1.waitForFunction(() => !document.querySelector('.tcard'));
    ok((await sql(`select to_json(estado) from public.turnos where codigo = '${t1.codigo}'`)) === 'cancelado', 'frente: cancelar lo cancela en la base');
    // Se olvidó la contraseña: el link del mail abre "Elegí una contraseña nueva"
    await f1.click('.micuenta [data-act="cu-salir"]'); await f1.waitForSelector('#f-cuenta[data-modo="entrar"]');
    await f1.fill('#cu-email', 'juli@prueba.com'); await f1.click('[data-act="cu-olvido"]'); await f1.waitForTimeout(500);
    const recs = await (await fetch('http://localhost:8787/api/recuperos')).json();
    ok(recs.includes('juli@prueba.com') && /Te mandamos un mail/.test(await f1.textContent('#cu-msg')), 'frente: "¿Te olvidaste la contraseña?" manda el mail');
    await f1.goto(F + `?cuenta=clave#access_token=${juliId}&type=recovery`); await frenteListo(f1);
    await f1.waitForSelector('#dlg-clave[open]', { timeout: 6000 });
    await f1.fill('#dc-clave', 'nueva-2026'); await f1.click('#f-clave button[type=submit]'); await f1.waitForFunction(() => !document.querySelector('#dlg-clave').open);
    await f1.click('.foot a[data-go="turnos"]'); await f1.waitForSelector('.micuenta'); await f1.click('.micuenta [data-act="cu-salir"]'); await f1.waitForSelector('#f-cuenta');
    await f1.fill('#cu-email', 'juli@prueba.com'); await f1.fill('#cu-clave', 'nueva-2026'); await f1.click('#f-cuenta button[type=submit]');
    await f1.waitForSelector('.micuenta', { timeout: 6000 });
    ok(true, 'frente: con el link elige otra contraseña y después entra con ella');
    // Borra su cuenta: se van sus datos y sus turnos
    await f1.click('[data-act="cu-borrar"]'); await f1.click('#dlg-si'); await f1.waitForSelector('#f-cuenta');
    ok((await sql("select count(*) from auth.users where email = 'juli@prueba.com'")) === 0 && (await sql(`select count(*) from public.turnos where codigo = '${t1.codigo}'`)) === 0, 'frente: "Borrar mi cuenta" borra la cuenta, sus datos y sus turnos de la base');
    // El link de los mails (bookea.ar/#mis-turnos) y una dueña de negocio que reserva con su cuenta
    const f3 = await nueva();
    await f3.goto(F + '#mis-turnos'); await frenteListo(f3);
    ok((await pag(f3)) === 'turnos' && await f3.isVisible('#f-cuenta[data-modo="entrar"]'), 'frente: bookea.ar/#mis-turnos (el botón de los mails) abre Mis turnos para entrar');
    await f3.fill('#cu-email', 'carla@prueba.com'); await f3.fill('#cu-clave', 'peluqueria2026'); await f3.click('#f-cuenta button[type=submit]');
    await f3.waitForSelector('#f-cuenta[data-modo="datos"]');
    ok(/Completá tus datos/.test(await f3.textContent('#cuenta')), 'frente: una cuenta de negocio que entra a reservar completa su nombre y su celular');
    await f3.fill('#cu-nombre', 'Carla Ruiz'); await f3.fill('#cu-cel', '261 333 2222'); await f3.check('#cu-acepto'); await f3.click('#f-cuenta button[type=submit]');
    await f3.waitForSelector('.micuenta');
    await f3.click('[data-act="cu-borrar"]'); await f3.click('#dlg-si'); await f3.waitForTimeout(500);
    ok(/maneja un negocio/.test(await f3.textContent('#toast')) && (await sql("select count(*) from auth.users where email = 'carla@prueba.com'")) === 1, 'frente: una cuenta que maneja un negocio no se borra desde la página (se pide por mail)');
    // Un cliente en el panel: se le explica; y si el link de su mail cayó en el panel, sigue en la página de reservas con su sesión
    await f2.goto(URL_); await f2.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(f2, 'nico@prueba.com', 'canchas2026'); await f2.waitForTimeout(800);
    ok(/es para reservar turnos/.test(await f2.textContent('#i-msg')), 'panel: a un cliente que quiere entrar se le explica que sus turnos están en la página de reservas');
    const nicoId = await sql("select to_json(id) from auth.users where email = 'nico@prueba.com'");
    await f2.evaluate(() => localStorage.removeItem('bookea:cliente-sesion'));
    await f2.goto('about:blank'); // si no, ir a admin.html#… desde admin.html solo cambia el # y no recarga
    await f2.goto(URL_ + `#access_token=${nicoId}&type=signup`);
    await f2.waitForURL(/\/\?cuenta=confirmada/, { timeout: 8000 }).catch(() => {});
    await frenteListo(f2); await f2.waitForSelector('#cuenta.cuenta--yo, .micuenta', { timeout: 8000 }).catch(() => {});
    ok(/Nico Ríos/.test(await f2.textContent('main')) && !/admin\.html/.test(f2.url()), 'panel: el link del mail de un cliente que cae en el panel lo lleva a la página de reservas, ya adentro');
    // ---------- Negocio de verdad en la página: el de Ana (aprobado), con su link y su agenda ----------
    await sql(`with x as (update negocios set ciudad = 'Tunuyán', direccion = 'Belgrano 450', descripcion = 'Dos canchas de pádel.',
      ajustes = jsonb_build_object(
        'recursos', jsonb_build_array(jsonb_build_object('id', 'r1', 'nombre', 'Cancha 1', 'detalle', 'Blindex'), jsonb_build_object('id', 'r2', 'nombre', 'Cancha 2', 'detalle', 'Techada')),
        'duracion', 60,
        'horario', (select jsonb_agg(jsonb_build_object('abre', '08:00', 'cierra', '23:00', 'cerrado', false)) from generate_series(0, 6)),
        'franjas', jsonb_build_array(jsonb_build_object('desde', '08:00', 'hasta', '18:00', 'precio', 20000), jsonb_build_object('desde', '18:00', 'hasta', '23:00', 'precio', 26000)),
        'senaPct', 25, 'cancelarHoras', 6, 'devolverSena', true)
      where slug = 'losalamospadel' returning 1) select count(*) from x`);
    const mananaN = await sql("select to_json(((now() at time zone 'America/Argentina/Mendoza')::date + 1)::text)");
    // Ana tiene cargado a mano un turno mañana a las 20:00 en la cancha 1
    await sql(`with x as (insert into reservas (negocio_id, recurso, fecha, hora, cliente, estado, origen)
      select id, 'r1', '${mananaN}', 1200, 'Pepe a mano', 'confirmada', 'telefono' from negocios where slug = 'losalamospadel' returning 1) select count(*) from x`);
    const f4 = await nueva();
    await f4.goto(F + '?rubro=padel'); await frenteListo(f4);
    ok(!/Los Álamos Pádel/.test(await f4.textContent('#r-list')), 'negocio de verdad: sin Mercado Pago todavía no aparece en la lista de la página');
    // bookea.ar/nombre: su página; bookea.ar/nombre/reservar: sus turnos (con la dirección limpia)
    await f4.goto('http://localhost:8787/losalamospadel'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'local', null, { timeout: 8000 }).catch(() => {});
    ok((await pag(f4)) === 'local' && /Los Álamos Pádel/.test(await f4.textContent('#local-root h1').catch(() => '')) && new URL(f4.url()).pathname === '/losalamospadel'
      && (await f4.title()) === 'Los Álamos Pádel · Bookea', 'negocio de verdad: bookea.ar/nombre abre su página (y la dirección queda bookea.ar/nombre)');
    await f4.click('.loc__fin [data-act="ficha"]'); await f4.waitForTimeout(500);
    ok((await pag(f4)) === 'ficha' && new URL(f4.url()).pathname === '/losalamospadel/reservar', 'negocio de verdad: "Reservar turno" lleva a bookea.ar/nombre/reservar');
    await f4.goto('http://localhost:8787/losalamospadel/reservar'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 }).catch(() => {});
    const ficha = (await pag(f4)) === 'ficha' ? await f4.textContent('#ficha-root') : '';
    ok(/Los Álamos Pádel/.test(await f4.textContent('#ficha-root h1').catch(() => '')) && /Tunuyán/.test(ficha) && /Turnos de 60 min/.test(ficha) && /Seña 25 %/.test(ficha),
      'negocio de verdad: bookea.ar/nombre/reservar abre su ficha con su nombre, su ciudad, la duración y la seña de Mi negocio');
    ok(/Todos los días/.test(ficha) && /08:00 a 23:00/.test(ficha) && /Belgrano 450/.test(ficha) && /\$\s20\.000/.test(ficha) && /\$\s26\.000/.test(ficha) && !/Negocio de ejemplo/.test(ficha)
      && (await f4.getAttribute('.dir__ir', 'href') || '').startsWith('https://www.google.com/maps/search/'),
      'negocio de verdad: sus horarios, sus precios por franja, su dirección con "Cómo llegar" y sin el cartel de ejemplo');
    await f4.click('.cupo[data-i="1"]'); await f4.waitForSelector('#book-panel');
    await entera(f4, `${out}/nb-ficha-real.png`);
    const cel = await nueva(390, 844);
    await cel.goto(F + '?lugar=losalamospadel'); await frenteListo(cel);
    await cel.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 }).catch(() => {});
    await cel.click('.cupo[data-i="1"]'); await entera(cel, `${out}/nb-ficha-real-cel.png`);
    ok(await cel.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'negocio de verdad: en el celular la ficha entra a lo ancho');
    await cel.close();
    const s20 = await f4.textContent('.slot[data-t="20:00"] small');
    ok(/Último lugar/.test(s20), `negocio de verdad: el turno que Ana cargó a mano ocupa su cancha (a las 20:00 queda una: "${s20}")`);
    // Nico entra y reserva mañana a las 19:00 en la cancha 2
    await f4.goto(F + '#mis-turnos'); await frenteListo(f4);
    await f4.fill('#cu-email', 'nico@prueba.com'); await f4.fill('#cu-clave', 'canchas2026'); await f4.click('#f-cuenta button[type=submit]');
    await f4.waitForSelector('.micuenta', { timeout: 8000 });
    await f4.goto(F + '?lugar=losalamospadel'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 });
    await f4.click('.cupo[data-i="1"]'); await f4.click('.slot[data-t="19:00"]'); await f4.waitForTimeout(300);
    if (await f4.isVisible('.slot--u')) await f4.click('.slot--u[data-u="Cancha 2 · techada"]');
    ok(/seña \$\s6\.500 · \$\s26\.000 el turno/.test(await f4.textContent('#ir-pagar')), 'negocio de verdad: el precio y la seña salen de sus franjas (26.000, seña 6.500)');
    await f4.click('#ir-pagar [data-act="reservar"]'); await f4.waitForSelector('#pago-root .chk__turno');
    ok(/Bookea está en prueba/.test(await f4.textContent('#pago-root')) && /Belgrano 450/.test(await f4.textContent('#pago-root')), 'negocio de verdad: al pagar avisa que la seña todavía no se cobra, y muestra la dirección');
    await entera(f4, `${out}/nb-pago-real.png`);
    await f4.click('.chk__side [data-act="pay"]'); await f4.waitForSelector('.tcard', { timeout: 10000 });
    const tN = (await sql(`select json_agg(t) from (select t.*, r.cliente as r_cliente, r.wa as r_wa, r.origen as r_origen, r.sena as r_sena, r.recurso as r_recurso, r.hora as r_hora
      from turnos t join reservas r on r.id = t.reserva_id where t.negocio_id = (select id from negocios where slug = 'losalamospadel')) t`) || [])[0];
    ok(tN && tN.cancha === 'Cancha 2 · techada' && tN.precio === 26000 && tN.sena === 6500 && tN.hora === '19:00:00' && tN.fecha === mananaN,
      `negocio de verdad: el turno queda en la base con la cancha, el día, la hora y el precio de Mi negocio (${tN && tN.cancha}, ${tN && tN.precio})`);
    ok(tN && tN.r_cliente === 'Nico Ríos' && tN.r_wa === '261 444 0000' && tN.r_origen === 'link' && tN.r_sena === 0 && tN.r_recurso === 'r2' && tN.r_hora === 1140,
      'negocio de verdad: el turno entra en la agenda de Ana, por el link, con el nombre y el celular de Nico (y sin seña cobrada, en prueba)');
    ok(/Los Álamos Pádel/.test(await f4.textContent('.tcard')) && /Cancha 2/.test(await f4.textContent('.tcard')), 'negocio de verdad: el turno se ve en Mis turnos');
    // Ana lo cancela desde su panel: a Nico se le cancela también
    await sql(`with x as (update reservas set estado = 'cancelada', retenida = false where id = '${tN.reserva_id}' returning 1) select count(*) from x`);
    ok((await sql(`select to_json(estado || '/' || cancelado_por) from turnos where id = '${tN.id}'`)) === 'cancelado/negocio', 'negocio de verdad: si el negocio cancela en su agenda, el turno del cliente se cancela');
    await f4.goto(F + '?lugar=losalamospadel'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'ficha', null, { timeout: 8000 }).catch(() => {});
    await f4.click('.cupo[data-i="1"]');
    ok(/2 libres/.test(await f4.textContent('.slot[data-t="19:00"] small')), 'negocio de verdad: el horario cancelado vuelve a estar libre en la página');
    // Un negocio pendiente no se abre ni con su link; una dirección que no existe muestra la página de "no encontramos"
    await f4.goto(F + '?lugar=estudiocarla'); await frenteListo(f4); await f4.waitForTimeout(400);
    ok((await pag(f4)) === 'home' && /No encontramos ese lugar/.test(await f4.textContent('#toast')), 'negocio pendiente: con su link no se abre (lleva al inicio)');
    await f4.goto('http://localhost:8787/no/existe');
    ok(/No encontramos esta página/.test(await f4.textContent('h1')), 'una dirección que no existe: "No encontramos esta página"');
    await f4.screenshot({ path: `${out}/nb-404.png` });

    // ---------- Tu página: Ana sube portada y logo, escribe su historia y sus redes; se ve en bookea.ar/nombre ----------
    const RAIZ = require('path').resolve(AQUI, '../../..');
    const an = await nueva();
    await an.goto(URL_); await an.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(an, 'ana@prueba.com', 'recuperada26'); await an.waitForSelector('#panel:not([hidden])'); await listo(an); // la que eligió al recuperarla, más arriba
    ok(!(await an.$('.menu__i[data-vista="pagina"]')), 'la página la carga el equipo de Bookea: la dueña no tiene "Tu página" en el menú');
    await an.click('.menu__i[data-vista="negocio"]'); await an.waitForSelector('#f-neg');
    ok(!(await an.$('#g-tu-pagina')) && /pagina=losalamospadel/.test(await an.getAttribute('#g-web', 'href')), 'Mi negocio: la dueña ve su página web (un link), pero no la edita');
    // la arma el equipo de Bookea: Solicitudes → "Editar su página"
    await adm.click('#ir-solicitudes'); await adm.waitForSelector('.sol');
    await adm.locator('.sol', { hasText: 'ana@prueba.com' }).locator('[data-pagina]').click(); await adm.waitForSelector('#f-pag');
    const ed = adm;
    const guardadoPg = () => ed.waitForFunction(() => /Guardado/.test(document.querySelector('#p-msg').textContent), null, { timeout: 10000 }).catch(() => {});
    await ed.setInputFiles('#p-portada', RAIZ + '/assets/r-padel.webp'); await ed.waitForSelector('#p-port .port__bg', { timeout: 10000 }).catch(() => {}); await guardadoPg();
    await ed.setInputFiles('#p-logo', RAIZ + '/marca/isotipo-192.png'); await ed.waitForSelector('#p-port .port__logo img', { timeout: 10000 }).catch(() => {}); await guardadoPg();
    await ed.fill('#p-frase', 'Pádel entre álamos'); await ed.fill('#p-historia', 'Empezamos con una cancha.\nHoy tenemos dos.');
    await ed.fill('#p-ig', 'https://www.instagram.com/losalamospadel/'); await ed.press('#p-ig', 'Tab');
    await ed.click('#f-pag .servp__i:has(input[value="vest"])'); await ed.click('#f-pag .servp__i:has(input[value="clases"])');
    await ed.waitForTimeout(1600); await guardadoPg();
    const pgA = await sql("select to_json(pagina) from negocios where slug = 'losalamospadel'");
    const enStorage = /\/storage\/v1\/object\/public\/negocios\/[0-9a-f-]{36}\//;
    ok(pgA && enStorage.test(pgA.portada || '') && /\/portada-/.test(pgA.portada) && enStorage.test(pgA.logo || '') && pgA.frase === 'Pádel entre álamos' && pgA.instagram === 'losalamospadel' && JSON.stringify(pgA.servicios) === '["vest","clases"]',
      'Tu página: las fotos van a Storage (a la carpeta del negocio) y la frase, la historia, las redes y los servicios a la base');
    ok((await sql("select count(*) from storage.objects where bucket_id = 'negocios'")) === 2, 'Tu página: quedan dos fotos guardadas (portada y logo)');
    await ed.setInputFiles('#p-portada', RAIZ + '/assets/r-tenis.webp'); await ed.waitForTimeout(800); await guardadoPg(); await ed.waitForTimeout(600);
    const pgA2 = await sql("select to_json(pagina) from negocios where slug = 'losalamospadel'");
    ok(pgA2.portada !== pgA.portada && (await sql("select count(*) from storage.objects where bucket_id = 'negocios'")) === 2, 'Tu página: al cambiar la portada, la vieja se borra');
    await ed.screenshot({ path: `${out}/nb-tu-pagina.png`, fullPage: true });
    await f4.goto('http://localhost:8787/losalamospadel'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'local', null, { timeout: 8000 }).catch(() => {});
    const portadaVista = await f4.evaluate(() => { const i = document.querySelector('.loc__bg'); return i ? { src: i.src, ancho: i.naturalWidth } : null; });
    ok(portadaVista && portadaVista.src === pgA2.portada && portadaVista.ancho > 0, 'la página del negocio muestra su portada (la foto se carga)');
    const loc = await f4.textContent('#local-root');
    ok(/Pádel entre álamos/.test(loc) && /Empezamos con una cancha\./.test(loc) && /Hoy tenemos dos\./.test(loc) && /@losalamospadel/.test(loc) && /Vestuarios/.test(loc) && /Clases/.test(loc) && await f4.isVisible('.loc__logo img'),
      'la página del negocio muestra su logo, su frase, su historia, sus servicios y su Instagram');
    await entera(f4, `${out}/nb-pagina-real.png`);
    // ---------- El equipo de Bookea arma la página de un negocio (pedido del dueño, 25/11: "lo voy a cargar yo") ----------
    await adm.click('#ir-solicitudes'); await adm.waitForSelector('.sol');
    await adm.locator('.sol', { hasText: 'ana@prueba.com' }).locator('[data-pagina]').click(); await adm.waitForSelector('#f-pag');
    ok(/Página de Los Álamos Pádel/.test(await adm.textContent('#vista h1')) && (await adm.inputValue('#p-frase')) === 'Pádel entre álamos' && await adm.isChecked('#f-pag .servp input[value="vest"]'),
      'equipo de Bookea: "Editar su página" (en Solicitudes) abre la página de ese negocio, con lo que ya tiene');
    await adm.fill('#p-frase', 'Cargada por Bookea');
    await adm.click('#f-pag .servp__i:has(input[value="pileta"])');
    await adm.setInputFiles('#p-fotos', RAIZ + '/assets/r-futbol.webp');
    await adm.waitForFunction(() => document.querySelectorAll('#p-gal .galp__f').length === 1, null, { timeout: 15000 }).catch(() => {});
    await adm.waitForTimeout(1800);
    await adm.waitForFunction(() => /Guardado/.test(document.querySelector('#p-msg').textContent), null, { timeout: 10000 }).catch(() => {});
    const pgE = await sql("select to_json(pagina) from negocios where slug = 'losalamospadel'");
    const idLA = await sql("select to_json(id) from negocios where slug = 'losalamospadel'");
    ok(pgE.frase === 'Cargada por Bookea' && JSON.stringify(pgE.servicios) === '["vest","pileta","clases"]' && pgE.galeria.length === 1 && pgE.galeria[0].includes(`/negocios/${idLA}/`)
      && pgE.instagram === 'losalamospadel' && pgE.portada === pgA2.portada,
      'equipo de Bookea: guarda la página del negocio y sube la foto a su carpeta (sin tocar lo demás)');
    await adm.click('#p-volver'); await adm.waitForSelector('.sol');
    ok(true, 'equipo de Bookea: "Volver a Solicitudes"');
    await f4.goto('http://localhost:8787/losalamospadel'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'local', null, { timeout: 8000 }).catch(() => {});
    const loc2 = await f4.textContent('#local-root');
    ok(/Cargada por Bookea/.test(loc2) && /Pileta/.test(loc2) && (await f4.locator('.loc__gal img').count()) === 1, 'la página del negocio muestra lo que cargó el equipo de Bookea');
    // horarios: los días seguidos que abren igual van en una sola fila, y se marca la de hoy (pedido del dueño, 26/11)
    await sql(`with x as (update negocios set ajustes = jsonb_set(ajustes, '{horario}', (select jsonb_agg(case
        when d = 0 then jsonb_build_object('abre', '08:00', 'cierra', '23:00', 'cerrado', true)
        when d = 6 then jsonb_build_object('abre', '09:00', 'cierra', '20:00', 'cerrado', false)
        else jsonb_build_object('abre', '08:00', 'cierra', '23:00', 'cerrado', false) end order by d) from generate_series(0, 6) d))
      where slug = 'losalamospadel' returning 1) select count(*) from x`);
    const dowHoy = await sql("select to_json(extract(dow from (now() at time zone 'America/Argentina/Mendoza'))::int)");
    await f4.goto('http://localhost:8787/losalamospadel'); await frenteListo(f4);
    await f4.waitForFunction(() => document.querySelector('.page:not([hidden])').dataset.page === 'local', null, { timeout: 8000 }).catch(() => {});
    const hor = await f4.evaluate(() => [...document.querySelectorAll('.loc__hor tr')].map((tr) => [tr.querySelector('th').firstChild.textContent, tr.querySelector('td').textContent, tr.classList.contains('is-hoy')]));
    const filaHoy = dowHoy === 0 ? 2 : dowHoy === 6 ? 1 : 0;
    ok(JSON.stringify(hor.map(([d, t]) => [d, t])) === JSON.stringify([['Lunes a viernes', '08:00 a 23:00'], ['Sábado', '09:00 a 20:00'], ['Domingo', 'Cerrado']])
      && hor.filter((x) => x[2]).length === 1 && hor[filaHoy][2], 'la página del negocio: horarios juntos ("Lunes a viernes", "Sábado", "Domingo") con la fila de hoy marcada ' + JSON.stringify(hor));
    for (const [n, p] of [['f1', f1], ['f2', f2], ['f3', f3], ['f4', f4], ['an', an]]) ok(!p.errs.filter((x) => !/Failed to load resource/.test(x)).length, `frente: sin errores en la consola (${n}) ${p.errs.join(' | ')}`);
  } catch (e) {
    console.log('FALLA (excepción)', e.message); process.exitCode = 1;
  } finally {
    await b.close(); srv.kill();
  }
})();
