// Prueba del equipo en el panel (Playwright), en modo de prueba (sin base):
// el dueño invita a alguien, esa persona se suma con el link, ve solo lo que le habilitaron,
// el dueño le cambia los permisos y la saca del equipo. En computadora y en celular.
// Lo mismo contra la base de verdad está en supabase/pruebas/e2e/nube-e2e.js.
// Uso: node pruebas/equipo.js     (necesita Node y Playwright con Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
let fallas = 0, hechas = 0;
const ok = (c, m) => { hechas++; if (!c) fallas++; console.log((c ? 'OK    ' : 'FALLA ') + m); };
(async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, r));
  const B = `http://localhost:${srv.address().port}/admin.html`;
  const br = await chromium.launch();
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const movil = w < 900;
      const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: movil, isMobile: movil });
      await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.BOOKEA_CONFIG = {};' }));
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      const toca = (s) => (movil ? p.tap(s) : p.click(s));
      // en el celular el menú se despliega desde el botón de arriba; en la compu, la barra de íconos se abre al pasar el cursor
      const irA = async (v) => { if (await p.isVisible('#menu-boton')) { await toca('#menu-boton'); await p.waitForTimeout(450); } await toca(`.menu__i[data-vista="${v}"]`); };
      const entrar = async (email, clave) => { await p.fill('#i-email', email); await p.fill('#i-clave', clave); await toca('#f-ingresar button[type="submit"]'); await p.waitForTimeout(3600); };
      await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(500);
      await entrar('demo@example.com', 'bookea2026');
      // dueño: Equipo está en el menú (en el celular, en el menú que baja desde arriba)
      if (movil) { ok(!(await p.isVisible('.menu__i[data-vista="agenda"]')) && await p.isVisible('#menu-boton'), `${w}: en el celular el menú está cerrado, con el botón arriba`); await toca('#menu-boton'); await p.waitForTimeout(450); ok((await p.getAttribute('#menu-boton', 'aria-expanded')) === 'true', `${w}: el botón despliega el menú desde arriba`); }
      ok(await p.isVisible('.menu__i[data-vista="equipo"]'), `${w}: el dueño ve Equipo en el menú`); await toca('.menu__i[data-vista="equipo"]');
      if (movil) { await p.waitForTimeout(450); ok(!(await p.isVisible('.menu__i[data-vista="agenda"]')) && /Equipo/.test(await p.textContent('#menu-boton')), `${w}: al elegir, el menú se cierra y el botón dice "Equipo"`); }
      await p.waitForTimeout(600);
      ok((await p.textContent('#vista h1')) === 'Equipo', `${w}: abre Equipo`);
      await toca('[data-invitar]'); await p.waitForTimeout(400);
      await toca('#f-invitar button[type="submit"]'); await p.waitForTimeout(200);
      ok(await p.isVisible('#iv-nombre-err') && await p.isVisible('#iv-email-err'), `${w}: invitar vacío marca nombre y email`);
      await p.fill('#iv-nombre', 'Lucía Pérez'); await p.fill('#iv-email', 'Lucia@Prueba.com');
      // destildar "ver la agenda" destilda "cargar turnos"
      await toca('input[name="perm"][value="agenda"]');
      ok(!(await p.isChecked('input[name="perm"][value="turnos"]')), `${w}: sin ver la agenda no puede cargar turnos (se destilda solo)`);
      await toca('input[name="perm"][value="agenda"]');
      ok(!(await p.isChecked('input[name="perm"][value="turnos"]')) && await p.isChecked('input[name="perm"][value="agenda"]'), `${w}: queda solo "ver la agenda"`);
      await toca('input[name="perm"][value="clientes"]');
      await toca('#f-invitar button[type="submit"]'); await p.waitForTimeout(500);
      const link = await p.inputValue('#iv-link');
      ok(/admin\.html\?invitacion=[0-9a-f]{64}$/.test(link), `${w}: da el link para mandar`);
      const wa = await p.getAttribute('.dlg a[href^="https://wa.me/"]', 'href');
      ok(decodeURIComponent(wa).includes('lucia@prueba.com') && decodeURIComponent(wa).includes(link), `${w}: el WhatsApp lleva el link y el email`);
      await toca('.dlg [data-cerrar].btn'); await p.waitForTimeout(500);
      ok(await p.isVisible('.eq--inv'), `${w}: la invitación aparece en "Invitaciones sin usar"`);
      // salir y sumarse con el link
      await p.evaluate(() => document.querySelector('#salir').click()); await p.waitForTimeout(500);
      await p.goto(link, { waitUntil: 'load' }); await p.waitForTimeout(800);
      ok(await p.isVisible('#f-unirse') && (await p.textContent('#t-unirse')).includes('Los Álamos'), `${w}: el link abre "Sumate al equipo de …"`);
      ok((await p.inputValue('#u-email')) === 'lucia@prueba.com' && (await p.inputValue('#u-nombre')) === 'Lucía Pérez', `${w}: trae su nombre y su email`);
      await p.fill('#u-email', 'otra@prueba.com'); await p.fill('#u-clave', 'lucia-2026'); await p.fill('#u-clave2', 'lucia-2026');
      await toca('#u-crear'); await p.waitForTimeout(300);
      ok(await p.isVisible('#u-email-err'), `${w}: con otro email no deja`);
      await p.fill('#u-email', 'lucia@prueba.com');
      await toca('#u-crear'); await p.waitForTimeout(4200);
      ok(await p.isVisible('#panel'), `${w}: crea la cuenta y entra al panel`);
      ok(!p.url().includes('invitacion='), `${w}: la dirección queda limpia`);
      const menu = await p.$$eval('.menu__i', (bs) => bs.filter((b) => !b.hidden && getComputedStyle(b).display !== 'none').map((b) => b.dataset.vista));
      ok(JSON.stringify(menu) === JSON.stringify(['agenda', 'clientes', 'cuenta']), `${w}: ve solo Agenda, Clientes y Cuenta (${menu})`);
      ok(!(await p.isVisible('[data-nuevo]')) && await p.isVisible('.solo-ver'), `${w}: agenda de solo lectura: sin "Cargar turno"`);
      ok((await p.locator('[data-libre]').count()) === 0 && (await p.locator('[data-rapido]').count()) === 0, `${w}: no puede tocar huecos libres ni marcar pagos`);
      await toca('[data-res] >> nth=0'); await p.waitForTimeout(400);
      ok((await p.locator('.dlg [data-acc]').count()) === 0 && !(await p.isVisible('#d-nota')), `${w}: el detalle de un turno no tiene botones para cambiarlo`);
      await toca('.dlg__x'); await p.waitForTimeout(300);
      await p.evaluate(() => document.querySelector('#salir').click()); await p.waitForTimeout(400);
      await entrar('lucia@prueba.com', 'lucia-2026');
      await irA('cuenta'); await p.waitForTimeout(400);
      ok((await p.textContent('#vista')).includes('Tu lugar en el equipo'), `${w}: en Cuenta ve qué puede hacer`);
      // el dueño le da "cargar turnos" y Finanzas
      await p.evaluate(() => document.querySelector('#salir').click()); await p.waitForTimeout(400);
      await entrar('demo@example.com', 'bookea2026');
      await irA('equipo');
      await p.waitForTimeout(600);
      ok((await p.locator('.eq').count()) === 2 && (await p.textContent('.eqs')).includes('Lucía'), `${w}: Lucía aparece en el equipo`);
      await toca('[data-permisos="lucia@prueba.com"]'); await p.waitForTimeout(400);
      await toca('input[name="perm"][value="turnos"]'); await toca('input[name="perm"][value="finanzas"]');
      await toca('#f-perm button[type="submit"]'); await p.waitForTimeout(600);
      ok((await p.textContent('.eqs')).includes('Cargar turnos') && (await p.textContent('.eqs')).includes('Finanzas'), `${w}: los permisos nuevos se ven en la lista`);
      await p.evaluate(() => document.querySelector('#salir').click()); await p.waitForTimeout(400);
      await entrar('lucia@prueba.com', 'lucia-2026');
      ok(await p.isVisible('[data-nuevo]') && await p.$eval('.menu__i[data-vista="finanzas"]', (b) => !b.hidden), `${w}: Lucía ahora carga turnos y ve Finanzas en su menú`);
      // el dueño la saca
      await p.evaluate(() => document.querySelector('#salir').click()); await p.waitForTimeout(400);
      await entrar('demo@example.com', 'bookea2026');
      await irA('equipo');
      await p.waitForTimeout(600);
      await toca('[data-quitar="lucia@prueba.com"]'); await p.waitForTimeout(200);
      ok((await p.textContent('[data-quitar="lucia@prueba.com"]')).includes('Tocá de nuevo'), `${w}: sacar del equipo pide un segundo toque`);
      await toca('[data-quitar="lucia@prueba.com"]'); await p.waitForTimeout(600);
      ok((await p.locator('.eq').count()) === 1, `${w}: Lucía ya no está`);
      await p.evaluate(() => document.querySelector('#salir').click()); await p.waitForTimeout(400);
      await p.fill('#i-email', 'lucia@prueba.com'); await p.fill('#i-clave', 'lucia-2026'); await toca('#f-ingresar button[type="submit"]'); await p.waitForTimeout(800);
      const mm = await p.textContent('#i-msg'); ok(!(await p.isVisible('#panel')) && mm.includes('no está en ningún negocio'), `${w}: Lucía ya no puede entrar y se le explica (${mm})`);
      // un link usado no sirve
      await p.goto(link, { waitUntil: 'load' }); await p.waitForTimeout(700);
      ok((await p.textContent('#t-unirse')) === 'Este link ya no sirve' && !(await p.isVisible('#u-crear')), `${w}: el link ya usado no sirve`);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      ok(sw <= w, `${w}: sin desborde (${sw})`);
      ok(errs.length === 0, `${w}: sin errores ${errs.join(' | ')}`);
      await ctx.close();
    }
  } catch (e) {
    fallas++; console.log('FALLA (excepción)', e.message);
  } finally {
    await br.close(); srv.close();
  }
  console.log(fallas ? `\n${fallas} FALLAS de ${hechas}` : `\nTODO OK (${hechas} comprobaciones)`);
  process.exit(fallas ? 1 : 0);
})();
