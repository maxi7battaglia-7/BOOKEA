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

    // ---------- Crear cuenta: se crea el negocio y queda atado a la cuenta ----------
    await registrar(a, { nombre: 'Ana Gómez', negocio: 'Los Álamos Pádel', rubro: 'Pádel', email: 'ana@prueba.com', clave: 'canchas2026' });
    await a.waitForSelector('#panel:not([hidden])'); await listo(a);
    ok(/Mi negocio/.test(await a.textContent('#vista h1')) && (await a.textContent('#lado-neg')) === 'Los Álamos Pádel', 'cuenta nueva: entra a Mi negocio de "Los Álamos Pádel"');
    await espera(600);
    const negA = (await sql(`select json_agg(x) from (select n.id, n.slug, n.ajustes, m.rol, u.email from negocios n join miembros m on m.negocio_id = n.id join auth.users u on u.id = m.user_id) x`))[0];
    ok(negA && negA.slug === 'losalamospadel' && negA.rol === 'dueno' && negA.email === 'ana@prueba.com', 'en la base: negocio "losalamospadel" con Ana como dueña');
    ok(negA && negA.ajustes && Array.isArray(negA.ajustes.recursos) && negA.ajustes.horario.length === 7, 'en la base: quedaron guardados los ajustes iniciales (canchas, horarios, precios)');

    // ---------- Mi negocio: guardar cambios ----------
    await a.fill('#g-ciudad', 'Tunuyán'); await a.fill('#g-desc', 'Tres canchas, una techada.');
    await a.click('#g-guardar'); await a.waitForFunction(() => /guardados/.test(document.querySelector('#g-msg').textContent));
    const n1 = (await sql(`select row_to_json(n) from negocios n where slug = 'losalamospadel'`));
    ok(n1.ciudad === 'Tunuyán' && n1.descripcion === 'Tres canchas, una techada.', 'Mi negocio: ciudad y descripción guardadas en la base');

    // ---------- Cargar un turno ----------
    await a.click('[data-vista="agenda"]'); await a.waitForTimeout(300);
    await a.click('[data-nuevo]'); await a.waitForSelector('#f-nuevo');
    const manana = await a.evaluate(() => { const d = new Date(Date.now() + 864e5); return d.toISOString().slice(0, 10); });
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
    await a.waitForSelector('#panel:not([hidden])'); await listo(a);
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
    await a.click('#g-guardar'); await a.waitForFunction(() => document.querySelector('#g-msg').textContent.length > 0);
    ok(await a.isVisible('#g-slug-err') && (await a.textContent('#g-slug-err')).includes('ya lo usa otro negocio'), 'link de otro negocio: avisa al lado del campo');
    const nb = await sql(`select row_to_json(n) from negocios n where n.id <> '${negA.id}'`);
    ok(nb.slug === 'losalamospadel2' && nb.ciudad === 'Tupungato', 'se guardó todo menos el link (' + nb.slug + ', ' + nb.ciudad + ')');
    await a.screenshot({ path: `${out}/nb-slug.png` });

    // ---------- Errores al entrar ----------
    await a.click('#salir'); await a.waitForSelector('#f-ingresar:not([hidden])');
    await ingresar(a, 'ana@prueba.com', 'otra-clave'); await a.waitForTimeout(400);
    ok((await a.textContent('#i-msg')) === 'El email o la contraseña no coinciden.', 'contraseña mal: avisa');
    await registrar(a, { nombre: 'Ana', negocio: 'Otro', rubro: 'Pádel', email: 'ana@prueba.com', clave: 'canchas2026' }); await a.waitForTimeout(400);
    ok((await a.textContent('#r-email-err')).includes('Ya hay una cuenta'), 'email que ya tiene cuenta: avisa');
    ok((await sql(`select count(*) from negocios`)) === 2, 'y no crea otro negocio');
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

    // ---------- Celular ----------
    const m = await nueva(390, 844);
    await m.goto(URL_); await m.waitForSelector('#f-ingresar:not([hidden])');
    await m.screenshot({ path: `${out}/nb-m-entrada.png`, fullPage: true });
    ok((await m.evaluate(() => document.documentElement.scrollWidth)) === 390, 'celular: la entrada no se desborda');

    for (const [n, p] of [['a', a], ['c', c], ['m', m]]) ok(!p.errs.length, `sin errores en la consola (${n}) ${p.errs.join(' | ')}`);
  } catch (e) {
    console.log('FALLA (excepción)', e.message); process.exitCode = 1;
  } finally {
    await b.close(); srv.kill();
  }
})();
