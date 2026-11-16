// Prueba del sitio en el navegador (Playwright), en modo de prueba (sin base):
//   - buscador del inicio en dos pasos (foto del rubro → dónde y cuándo) y llegada a reservar.html
//   - reservar.html: fotos, filtros, botón atrás, "Cambiar" y una reserva completa
//   - "Sumá tu negocio" → registro del panel con los datos cargados → cuenta creada
//   - panel con la cuenta de prueba: las cinco vistas
//   - teclado, movimiento reducido, sin JavaScript
//   - en todos los anchos: nada cortado ni salido de la ventana, toques de 40px o más, consola sin errores
// Uso: node pruebas/sitio.js     (necesita Node y Playwright con Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
let fallas = 0, hechas = 0;
const ok = (c, m) => { hechas++; if (!c) fallas++; console.log((c ? 'OK    ' : 'FALLA ') + m); };

// Lo que se sale, se corta o es chico para el dedo (corre adentro de la página)
const medir = () => {
  const vw = document.documentElement.clientWidth, res = [];
  const nombre = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const seDesplaza = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.opacity === '0') return;
    if (el.closest('[aria-hidden="true"], .sr-only, .skip, svg, .mosaico, .splash, .bienv')) return;
    const texto = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (texto && !el.matches('.brand__word')) {
      if ((r.right > vw + 1 || r.left < -1) && !seDesplaza(el)) res.push(`fuera de la ventana: ${nombre(el)}`);
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a).overflowX;
        if (o === 'auto' || o === 'scroll') break;
        if (o === 'hidden' || o === 'clip') { const ra = a.getBoundingClientRect(); if (r.right > ra.right + 2 || r.left < ra.left - 2) res.push(`recortado por ${nombre(a)}: ${nombre(el)} "${el.textContent.trim().slice(0, 20)}"`); break; }
      }
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') res.push(`texto cortado sin "…": ${nombre(el)}`);
    }
    if (vw < 500 && el.matches('a[href], button, select, input:not([type=hidden]), summary') && cs.position !== 'absolute' && !el.closest('.foot__credits p, .frag, .ex__demo')) {
      const h = Math.max(r.height, el.closest('label') ? el.closest('label').getBoundingClientRect().height : 0);
      if (h < 40) res.push(`toque chico (${Math.round(h)}px): ${nombre(el)} "${(el.textContent || '').trim().slice(0, 20)}"`);
    }
  });
  return [...new Set(res)];
};

(async () => {
  const srv = http.createServer((req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, r));
  const B = `http://localhost:${srv.address().port}/`;
  const br = await chromium.launch();
  const abrir = async (w, h, extra = {}) => {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900, isMobile: w < 500, ...extra });
    // config.js del repo apunta a la base real: acá siempre modo de prueba
    await ctx.route('**/config.js*', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.BOOKEA_CONFIG = {};' }));
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('response', (r) => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    p.toca = (s) => (w < 900 ? p.tap(s) : p.click(s));
    p.limpio = async (donde) => { const l = await p.evaluate(medir); ok(l.length === 0, `${w} ${donde}: nada cortado, salido ni chico para el dedo ${l.join(' | ')}`); };
    return p;
  };

  try {
    for (const [w, h] of [[1440, 900], [1024, 768], [820, 1180], [390, 844], [360, 740]]) {
      const p = await abrir(w, h);

      // ---------- Inicio: el buscador en dos pasos ----------
      await p.goto(B + 'index.html', { waitUntil: 'load' }); await p.waitForTimeout(3400);
      const pantalla = await p.evaluate(() => ({ foto: Math.round([...document.querySelectorAll('#finder .rubro')].pop().getBoundingClientRect().bottom), alto: innerHeight }));
      ok(await p.isVisible('#finder-1') && !(await p.isVisible('#finder-2')), `${w} inicio: se ven las fotos de los rubros y todavía no los campos`);
      if (h >= 768) ok(pantalla.foto <= pantalla.alto, `${w} inicio: las cuatro fotos entran en el primer pantallazo (${pantalla.foto} de ${pantalla.alto})`);
      await p.evaluate(() => document.querySelectorAll('.rise').forEach((e) => e.classList.add('is-in'))); await p.waitForTimeout(900);
      await p.limpio('inicio');
      await p.toca('#finder .rubro[value="futbol"]'); await p.waitForTimeout(700);
      ok(await p.isVisible('#finder-2') && !(await p.isVisible('#finder-1')) && (await p.textContent('#el-n')) === 'Fútbol 5', `${w} inicio: al tocar Fútbol 5 aparece dónde y cuándo`);
      const boton = await p.evaluate(() => Math.round(document.querySelector('.finder__go').getBoundingClientRect().bottom));
      if (h >= 768) ok(boton <= h, `${w} inicio: "Buscar turnos" entra en el primer pantallazo (${boton} de ${h})`);
      await p.limpio('inicio, paso 2');
      await p.toca('#el-cambiar'); await p.waitForTimeout(700);
      ok(await p.isVisible('#finder-1') && await p.evaluate(() => document.activeElement.value === 'futbol'), `${w} inicio: Cambiar vuelve a las fotos, con el foco en la que tenías`);
      await p.toca('#finder .rubro[value="padel"]'); await p.waitForTimeout(700);
      await p.selectOption('#fz', 'godoy-cruz'); await p.selectOption('#fh', 'noche');
      await Promise.all([p.waitForURL('**/reservar.html?**'), p.toca('.finder__go')]); await p.waitForTimeout(700);
      ok((await p.textContent('#res-t')) === 'Pádel en Godoy Cruz' && (await p.inputValue('#bh')) === 'noche', `${w} llega a reservas con rubro, zona y hora`);

      // ---------- Reservas ----------
      await p.goto(B + 'reservar.html', { waitUntil: 'load' }); await p.waitForTimeout(700);
      ok(await p.isVisible('#elegir') && !(await p.isVisible('#buscar')) && (await p.locator('#elegir .rubro').count()) === 4, `${w} reservas sin rubro: las cuatro fotos`);
      await p.limpio('reservas, fotos');
      await p.toca('#elegir .rubro[value="tenis"]'); await p.waitForTimeout(900);
      ok(await p.isVisible('#buscar') && (await p.textContent('#el-n')) === 'Tenis' && p.url().includes('rubro=tenis') && (await p.locator('.lugar').count()) === 3, `${w} reservas: Tenis muestra sus tres lugares`);
      await p.selectOption('#bz', 'tunuyan'); await p.waitForTimeout(200);
      ok((await p.textContent('#res-t')) === 'Tenis en Tunuyán', `${w} reservas: filtro por zona`);
      await p.goBack(); await p.waitForTimeout(300);
      ok(await p.isVisible('#elegir'), `${w} reservas: "atrás" vuelve a las fotos`);
      await p.goForward(); await p.waitForTimeout(300);
      ok(await p.isVisible('#buscar') && (await p.inputValue('#bz')) === 'tunuyan', `${w} reservas: "adelante" vuelve a los turnos con el filtro`);
      await p.toca('#el-cambiar'); await p.waitForTimeout(700);
      ok(await p.isVisible('#elegir') && await p.evaluate(() => document.activeElement.value === 'tenis'), `${w} reservas: Cambiar vuelve a las fotos`);
      await p.toca('#elegir .rubro[value="barberia"]'); await p.waitForTimeout(900);
      await p.selectOption('#bz', ''); await p.selectOption('#bd', '1'); await p.waitForTimeout(900);
      await p.limpio('reservas, turnos');
      await p.toca('.hora >> nth=0'); await p.waitForTimeout(500);
      ok(await p.isVisible('#reserva[open]'), `${w} reservas: se abre la reserva`);
      await p.limpio('reservas, elegí tu turno');
      await p.toca('[data-sig="2"]'); await p.waitForTimeout(200);
      await p.toca('#rv-datos button[type="submit"]'); await p.waitForTimeout(200);
      ok(await p.isVisible('#rv-nombre-err') && await p.isVisible('#rv-wa-err'), `${w} reservas: sin datos, avisa al lado de cada campo`);
      await p.fill('#rv-nombre', 'Ana Prueba'); await p.fill('#rv-wa', '2622 15 123456'); await p.waitForTimeout(700);
      await p.limpio('reservas, tus datos');
      await p.toca('#rv-datos button[type="submit"]'); await p.waitForTimeout(200);
      await p.toca('[data-pagar]'); await p.waitForTimeout(1300);
      ok((await p.textContent('#rv-t')).includes('Ana'), `${w} reservas: seña simulada y turno confirmado`);
      await p.toca('.reserva [data-cerrar].btn'); await p.waitForTimeout(300);
      ok(!(await p.isVisible('#reserva[open]')), `${w} reservas: se cierra`);

      // ---------- "Sumá tu negocio" → registro → panel ----------
      await p.goto(B + 'index.html', { waitUntil: 'load' }); await p.waitForTimeout(3400);
      await p.evaluate(() => document.querySelector('#sumate').scrollIntoView({ block: 'start', behavior: 'instant' })); await p.waitForTimeout(1000);
      await p.toca('#form-sumate button[type="submit"]'); await p.waitForTimeout(300);
      ok(p.url().includes('index.html') && (await p.textContent('#form-sumate .form__msg')).includes('3 campos'), `${w} sumate: vacío no sigue y avisa`);
      await p.fill('#f-nombre', 'Julia Méndez'); await p.fill('#f-negocio', 'Pádel & Co. Tunuyán'); await p.fill('#f-rubro', 'Pádel');
      await Promise.all([p.waitForURL('**/admin.html**'), p.toca('#form-sumate button[type="submit"]')]); await p.waitForTimeout(900);
      ok(await p.isVisible('#f-registro') && (await p.inputValue('#r-nombre')) === 'Julia Méndez' && (await p.inputValue('#r-negocio')) === 'Pádel & Co. Tunuyán' && (await p.inputValue('#r-rubro')) === 'Pádel', `${w} sumate: abre el registro con los tres datos cargados`);
      ok(!p.url().includes('alta=') && await p.evaluate(() => document.activeElement.id === 'r-email'), `${w} sumate: dirección limpia y foco en el email`);
      await p.limpio('panel, registro');
      await p.fill('#r-email', `julia${w}@example.com`); await p.fill('#r-clave', 'clave-segura-1'); await p.fill('#r-clave2', 'clave-segura-1');
      await p.toca('#f-registro button[type="submit"]'); await p.waitForTimeout(4200);
      ok(await p.isVisible('#panel') && (await p.textContent('#panel')).includes('Pádel & Co. Tunuyán'), `${w} sumate: la cuenta se crea y entra al panel de su negocio`);
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(800);
      ok(await p.isVisible('#f-ingresar'), `${w} panel: al recargar pide ingresar (no repite el registro)`);
      await p.limpio('panel, ingresar');

      // ---------- Panel con la cuenta de prueba ----------
      await p.fill('#i-email', 'demo@example.com'); await p.fill('#i-clave', 'bookea2026');
      await p.toca('#f-ingresar button[type="submit"]'); await p.waitForTimeout(4200);
      ok(await p.isVisible('#panel'), `${w} panel: entra con la cuenta de prueba`);
      for (const v of ['agenda', 'finanzas', 'clientes', 'negocio', 'cuenta']) {
        await p.toca(`.menu__i[data-vista="${v}"]`); await p.waitForTimeout(700);
        await p.limpio(`panel, ${v}`);
      }
      if (w >= 901) ok(await p.evaluate(() => document.querySelector('.lado__salir').getBoundingClientRect().right <= document.querySelector('.lado').getBoundingClientRect().right), `${w} panel: "Salir" entra entero en el costado`);
      ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= w, `${w}: sin desplazamiento horizontal`);
      ok(p.errs.length === 0, `${w}: sin errores en la consola ni archivos que falten ${p.errs.join(' | ')}`);
      await p.context().close();
    }

    // ---------- Cursor y teclado ----------
    let p = await abrir(1440, 900);
    await p.goto(B + 'index.html', { waitUntil: 'load' }); await p.waitForTimeout(3600);
    await p.hover('#finder .rubro[value="tenis"]'); await p.waitForTimeout(700);
    ok(/^inset\(0/.test(await p.evaluate(() => getComputedStyle(document.querySelector('#finder .rubro[value="tenis"] .rubro__n'), '::before').clipPath)), 'cursor sobre un rubro: el verde agua barre el nombre');
    await p.click('#finder .rubro[value="tenis"]'); await p.waitForTimeout(700);
    await p.hover('.finder__go'); await p.waitForTimeout(600);
    const b = await p.evaluate(() => { const x = document.querySelector('.finder__go'); return [getComputedStyle(x, '::before').clipPath, getComputedStyle(x).color]; });
    ok(/^inset\(0/.test(b[0]) && b[1] === 'rgb(17, 21, 28)', 'cursor sobre "Buscar turnos": barrido verde agua y texto noche');
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3600);
    await p.focus('#finder .rubro[value="padel"]'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
    ok((await p.textContent('#el-n')) === 'Fútbol 5' && await p.evaluate(() => document.activeElement.id === 'el-n'), 'teclado: Tab + Enter elige Fútbol 5 y el foco pasa al paso 2');
    await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.activeElement.value === 'futbol'), 'teclado: "Cambiar" devuelve el foco a Fútbol 5');
    await p.context().close();

    // ---------- Movimiento reducido ----------
    p = await abrir(390, 844, { reducedMotion: 'reduce' });
    await p.goto(B + 'index.html', { waitUntil: 'load' }); await p.waitForTimeout(1600);
    await p.tap('#finder .rubro[value="barberia"]'); await p.waitForTimeout(200);
    ok(await p.isVisible('#finder-2') && !(await p.isVisible('#finder-1')), 'movimiento reducido: el paso cambia al instante');
    await Promise.all([p.waitForURL('**/reservar.html?**'), p.tap('.finder__go')]); await p.waitForTimeout(400);
    ok((await p.locator('.lugar').count()) > 0 && p.errs.length === 0, 'movimiento reducido: llega a los turnos, sin errores');
    await p.context().close();

    // ---------- Sin JavaScript ----------
    p = await abrir(1440, 900, { javaScriptEnabled: false });
    await p.goto(B + 'index.html', { waitUntil: 'load' });
    ok(await p.isVisible('#finder-1') && await p.isVisible('#finder-2') && !(await p.isVisible('.elegido')) && !(await p.isVisible('.splash')), 'sin JavaScript: fotos y campos a la vista, sin pantalla de carga');
    await Promise.all([p.waitForURL('**/reservar.html?**'), p.click('#finder .rubro[value="tenis"]')]);
    ok(p.url().includes('rubro=tenis'), 'sin JavaScript: la foto lleva a reservar.html?rubro=tenis');
    await p.context().close();
  } catch (e) {
    fallas++; console.log('FALLA (excepción)', e.message);
  } finally {
    await br.close(); srv.close();
  }
  console.log(fallas ? `\n${fallas} FALLAS de ${hechas}` : `\nTODO OK (${hechas} comprobaciones)`);
  process.exit(fallas ? 1 : 0);
})();
