// Prueba del frente (index.html) y del registro en el navegador (Playwright), en modo de prueba (sin base):
//   - inicio: pestañas Deportes | Servicios, rubros con foto, dónde/cuándo/hora y "Buscar turnos"; "Libres ahora"; lugares
//   - resultados: rubro, día, franja y zona; horarios rápidos; "Solo techadas"
//   - ficha del lugar: fotos a lo ancho, días; al tocar uno, sus horarios; al elegir horario, el aviso verde "Ir a pagar"
//   - pagar la seña (sin carrito): el turno guardado 10 minutos, el aviso "Pagar seña" en las otras pantallas,
//     sin cuenta no se paga: crear la cuenta ahí mismo (avisos al lado de cada campo, leyenda de la AAIP), pago simulado
//     → Mis turnos con "Tu cuenta" → cancelar con su diálogo; salir, entrar, corregir los datos y borrar la cuenta; privacidad.html
//   - turno guardado: a los 10 minutos se libera y se puede volver a reservar (con el reloj de Playwright)
//   - parte para negocios: botones de la franja, copiar link, reglas de cancelación, preguntas, "Sumá tu negocio"
//   - "Sumá tu negocio" → registro del panel con los datos cargados → cuenta creada → panel (las cinco vistas)
//   - links viejos: reservar.html?rubro=…, reservar.html, index.html#sumate
//   - movimiento: pantalla de carga con la B, entrada del título, tarjetas que suben, barrido verde agua, toque con el dedo
//   - teclado, movimiento reducido, sin JavaScript
//   - en todos los anchos: nada cortado ni salido de la ventana, toques de 40px o más, consola sin errores
// Uso: node pruebas/sitio.js     (necesita Node y Playwright con Chromium)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
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
    if (el.closest('[aria-hidden="true"], .sr-only, .skip, svg, .toast')) return;
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
    if (vw < 500 && el.matches('a[href], button, select, input:not([type=hidden]), summary') && cs.position !== 'absolute' && !el.closest('.foot__bottom details p, .frag, .ex__demo')) {
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
    await ctx.route(/^https:\/\/(maps|www)\.google\.com\//, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Mapa</title>' }));
    const p = await ctx.newPage();
    p.errs = [];
    p.on('pageerror', (e) => p.errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('response', (r) => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    p.toca = (s) => (w < 900 ? p.tap(s) : p.click(s));
    p.limpio = async (donde) => { await p.waitForTimeout(250); const l = await p.evaluate(medir); ok(l.length === 0, `${w} ${donde}: nada cortado, salido ni chico para el dedo ${l.join(' | ')}`); };
    p.pagina = () => p.evaluate(() => (document.querySelector('.page:not([hidden])') || {}).dataset?.page);
    // abre una página del frente y espera a que suba la pantalla de carga (y que termine la entrada)
    p.ir = async (url) => {
      await p.goto(url, { waitUntil: 'load' });
      await p.waitForFunction(() => document.documentElement.classList.contains('is-ready') && !document.querySelector('.splash'), null, { timeout: 8000 });
      await p.waitForTimeout(500);
    };
    return p;
  };
  const espera = (p, ms = 450) => p.waitForTimeout(ms);

  try {
    for (const [w, h] of [[1440, 900], [1024, 768], [820, 1180], [390, 844], [360, 740]]) {
      const p = await abrir(w, h);
      const cel = w <= 820;

      // ---------- Inicio ----------
      await p.ir(B);
      ok((await p.pagina()) === 'home' && (await p.locator('#f-rubros .rubro:not(.rubro--molde)').count()) === 3 && (await p.getAttribute('#f-secs [data-k="deportes"]', 'aria-pressed')) === 'true', `${w} inicio: arranca en Deportes, con sus tres rubros con foto`);
      ok(await p.evaluate(() => [...document.fonts].some((f) => f.family.includes('Inter Tight') && f.status === 'loaded')), `${w} inicio: la letra Inter Tight cargó desde bookea.ar`);
      ok(await p.evaluate(() => [...document.images].every((i) => !i.complete || i.naturalWidth > 0)), `${w} inicio: ninguna foto rota`);
      ok(await p.evaluate(() => { const t = [...document.querySelectorAll('.top a, .top button')].filter((e) => e.offsetParent).map((e) => e.textContent.trim()); return !t.some((x) => /Reservar turno|Mis turnos/.test(x)) && t.some((x) => x === 'Ingresar'); }), `${w} barra de arriba: sin "Reservar turno" ni "Mis turnos" (pedido del dueño, 21/11), con "Ingresar"`);
      ok((await p.locator('.foot a[data-go="turnos"]').count()) === 1, `${w} pie: "Mis turnos" está abajo, en la columna Bookea`);
      await p.limpio('inicio');
      // las tres fotos de Deportes, del mismo tamaño (pedido del dueño, 26/11)
      ok(await p.evaluate(() => { const r = [...document.querySelectorAll('#f-rubros .rubro:not(.rubro--molde)')].map((e) => e.getBoundingClientRect()); return r.length === 3 && r.every((x) => Math.abs(x.width - r[0].width) < 2 && Math.abs(x.height - r[0].height) < 2); }), `${w} inicio: las tres fotos de Deportes miden lo mismo`);
      ok(!(await p.isVisible('#f-tam-l')), `${w} inicio: con pádel no aparece el campo "Cancha" (fútbol 5 o 7)`);
      await p.toca('#f-rubros .rubro[data-k="futbol"]'); await espera(p, 200);
      ok((await p.getAttribute('#f-rubros .rubro[data-k="futbol"]', 'aria-pressed')) === 'true' && (await p.getAttribute('#f-rubros .rubro[data-k="padel"]', 'aria-pressed')) === 'false'
        && (await p.textContent('#f-rubros .rubro[data-k="futbol"] .rubro__n')) === 'Fútbol' && await p.isVisible('#f-tam-l'), `${w} inicio: tocar Fútbol lo marca y aparece "Cancha" para elegir de 5 o de 7`);
      await p.selectOption('#f-tam', '7'); await p.selectOption('#f-zona', 'tunuyan'); await p.toca('#f-dia'); await espera(p, 150);
      ok(await p.isVisible('#f-cal') && (await p.locator('#f-cal button.cal__d').count()) === 7 && (await p.getAttribute('#f-cal .cal__d.is-on', 'data-i')) === '0' && /Hoy/.test(await p.getAttribute('#f-cal .cal__d.is-on', 'aria-label')),
        `${w} buscador: "Cuándo" abre un calendario con los 7 días que se pueden reservar (hoy marcado)`);
      await p.toca('#f-cal [data-i="1"]'); await espera(p, 150);
      ok(!(await p.isVisible('#f-cal')) && /^Mañana/.test(await p.textContent('#f-dia-t')), `${w} buscador: al tocar un día se cierra y "Cuándo" dice "Mañana"`); await p.selectOption('#f-franja', 'noche');
      await p.toca('#finder button[type=submit]'); await espera(p);
      ok((await p.pagina()) === 'resultados' && (await p.textContent('#r-t')) === 'Turnos de fútbol en Tunuyán' && /mañana/i.test(await p.textContent('#r-s')) && /noche/.test(await p.textContent('#r-s')), `${w} buscar: resultados de fútbol en Tunuyán, mañana a la noche`);
      ok(JSON.stringify(await p.$$eval('#r-list .rcard h3', (l) => l.map((h) => h.textContent))) === '["El Potrero Fútbol"]' && (await p.getAttribute('#r-rubros [data-act="tam-h"][data-k="7"]', 'aria-pressed')) === 'true',
        `${w} buscar: con fútbol 7, solo los lugares con canchas de 7 (y "Fútbol 7" marcado en los resultados)`);
      await p.limpio('resultados');
      await p.goBack(); await espera(p);
      ok((await p.pagina()) === 'home', `${w} resultados: "atrás" del navegador vuelve al inicio`);

      // Libres ahora y lugares: la pestaña Servicios cambia toda la página
      const xPadel = await p.evaluate(() => document.querySelector('#hs-switch .pill[data-k="padel"]').getBoundingClientRect().left);
      await p.toca('#hs-secs .secs [data-k="servicios"]'); await espera(p, 700);
      ok(Math.abs(await p.evaluate(() => document.querySelector('#hs-switch .pill[data-k="barberia"]').getBoundingClientRect().left) - xPadel) < 2 && await p.isVisible('#hs-switch .pill[data-k="barberia"]') && !(await p.isVisible('#hs-switch .pill[data-k="padel"]')), `${w} "Libres ahora": Barbería queda donde estaba Pádel (los rubros no se mueven)`);
      ok((await p.textContent('#dest-t')) === 'Barbería: para reservar hoy' && (await p.locator('#grid-dest .vcard').count()) === 3, `${w} inicio: Servicios cambia "Libres ahora" y los lugares a Barbería`);
      ok((await p.locator('#f-rubros .rubro:not(.rubro--molde)').count()) === 1 && (await p.getAttribute('#f-secs [data-k="servicios"]', 'aria-pressed')) === 'true' && await p.evaluate(() => [...document.querySelectorAll('.collage img')].some((i) => /barber/.test(i.getAttribute('src')))), `${w} inicio: el buscador y las fotos de al lado también pasan a Servicios`);
      ok(await p.evaluate(() => { const r = [...document.querySelectorAll('#f-rubros .rubro')].map((e) => e.getBoundingClientRect().height); return Math.abs(r[0] - r[1]) < 2; }), `${w} inicio: con un solo rubro, la fila de fotos mide lo mismo`);
      ok((await p.locator('#rail-now .now').count()) > 0, `${w} inicio: hay turnos en "Libres ahora"`);
      if (!cel) ok(await p.evaluate(() => { const r = document.querySelector('#rail-now'), rr = r.getBoundingClientRect(); return r.scrollWidth <= r.clientWidth + 1 && [...r.querySelectorAll('.now')].filter((e) => e.offsetParent).every((e) => e.getBoundingClientRect().right <= rr.right + 1); }), `${w} "Libres ahora": en la compu no se desliza ni queda ninguna tarjeta cortada`);
      // ninguna fila que se desliza de costado se puede mover para arriba o para abajo (pedido del dueño, 19/11)
      const sinVertical = () => p.evaluate(() => [...document.querySelectorAll('.rail, .switch-rubro, .rbar__row, .reserva .cupos')].filter((e) => e.offsetParent).every((e) => !/auto|scroll/.test(getComputedStyle(e).overflowY)));
      ok(await sinVertical(), `${w} inicio: "Libres ahora" no se mueve para arriba ni para abajo`);
      await p.toca('#rail-now .now >> nth=0'); await espera(p);
      ok((await p.pagina()) === 'ficha' && (await p.locator('#book .slot.is-on[data-act="f-slot"]').count()) === 1, `${w} "Libres ahora": abre el lugar con ese horario elegido`);
      await p.toca('.back'); await espera(p);
      ok((await p.pagina()) === 'home', `${w} ficha: "Volver" vuelve al inicio`);
      await p.toca('#grid-dest .vcard >> nth=0'); await espera(p);
      ok((await p.pagina()) === 'ficha' && (await p.textContent('.ficha h1')).length > 2 && !(await p.textContent('#page-ficha')).match(/reseña/i), `${w} lugares: abre la ficha (sin reseñas inventadas)`);
      ok((await p.locator('#book .cupo').count()) === 7 && (await p.locator('#book .slot').count()) === 0 && await p.isVisible('.reserva__hint') && !(await p.isVisible('#ir-pagar')) && /Servicios · Barbería/.test(await p.textContent('.ficha .eyebrow')), `${w} ficha: los siete días a lo ancho y todavía sin horarios ni aviso`);
      await p.toca('#book .cupo[data-i="1"]'); await espera(p, 400);
      ok((await p.locator('#book .slot').count()) > 0 && /Horarios de mañana/.test(await p.textContent('#book-panel h3')), `${w} ficha: al tocar un día aparecen sus horarios`);
      await p.limpio('ficha');

      // ---------- Resultados: filtros ----------
      await p.ir(B + 'reservar.html?rubro=tenis&zona=tunuyan&dia=1&franja=');
      ok((await p.pagina()) === 'resultados' && (await p.textContent('#r-t')) === 'Turnos de tenis en Tunuyán', `${w} link viejo reservar.html?rubro=tenis: abre los resultados de tenis en Tunuyán`);
      await p.toca('#r-rubros .pill[data-k="padel"]'); await espera(p, 200);
      await p.selectOption('#r-zona', ''); await espera(p, 200);
      ok((await p.textContent('#r-t')) === 'Turnos de pádel' && (await p.locator('.rcard').count()) === 4, `${w} resultados: Pádel en todas las zonas, cuatro lugares`);
      await p.toca('#r-dias .day[data-i="2"]'); await espera(p, 200);
      ok((await p.getAttribute('#r-dias .day[data-i="2"]', 'aria-pressed')) === 'true', `${w} resultados: cambia el día`);
      await p.toca('#r-franjas .pill[data-k="noche"]'); await espera(p, 200);
      ok(/noche/.test(await p.textContent('#r-s')), `${w} resultados: filtra a la noche`);
      await p.toca('#r-rubros .pill[data-act="techada-h"]'); await espera(p, 200);
      ok((await p.locator('.rcard').count()) === 3, `${w} resultados: "Solo techadas" deja los lugares con cancha techada`);
      await p.toca('#r-rubros .pill[data-act="techada-h"]'); await espera(p, 200);
      await p.toca('#r-franjas .pill[data-k=""]'); await espera(p, 200);
      await p.limpio('resultados con filtros');
      ok(await sinVertical(), `${w} resultados: las filas de filtros no se mueven para arriba ni para abajo`);
      await p.toca('.qslot >> nth=0'); await espera(p);
      ok((await p.pagina()) === 'ficha' && (await p.locator('#book .slot.is-on[data-act="f-slot"]').count()) === 1 && await p.isVisible('#ir-pagar [data-act="reservar"]'), `${w} resultados: el horario rápido abre la ficha con el aviso verde "Ir a pagar"`);
      ok(await p.evaluate(() => getComputedStyle(document.querySelector('#ir-pagar')).backgroundColor === 'rgb(31, 160, 140)'), `${w} ficha: el aviso "Ir a pagar" es verde agua`);

      // ---------- Ficha: elegir y reservar ----------
      await p.toca('#book .cupo[data-i="3"]'); await espera(p, 300);
      ok((await p.getAttribute('#book .cupo[data-i="3"]', 'aria-pressed')) === 'true' && (await p.locator('#book .cupo.is-on').count()) === 1, `${w} ficha: cambia el día`);
      await p.toca('#book .slot:not([disabled]) >> nth=0'); await espera(p, 200);
      // Con dos o más canchas libres a esa hora se elige cuál, justo debajo del horario elegido (pedido del dueño, 19/11)
      const conVarias = await p.evaluate(() => [...document.querySelectorAll('#book .slot[data-act="f-slot"]:not([disabled])')].findIndex((x) => /libres/.test(x.textContent)));
      let uElegida = null;
      if (conVarias >= 0) {
        await p.toca(`#book .slot[data-act="f-slot"]:not([disabled]) >> nth=${conVarias}`); await espera(p, 800);
        ok(await p.evaluate(() => { const e = document.querySelector('#f-eleccion'), s = document.querySelector('#book .slot.is-on[data-act="f-slot"]'), ir = document.querySelector('#ir-pagar'); return !!e && !!s && e.previousElementSibling.contains(s) && document.querySelectorAll('#f-eleccion .slot--u').length >= 2 && document.querySelectorAll('#f-eleccion .slot--u.is-on').length === 1 && e.getBoundingClientRect().bottom <= ir.getBoundingClientRect().top + 1; }), `${w} ficha: con dos o más canchas libres, se elige cuál justo debajo del horario (y el aviso verde no la tapa)`);
        const u2 = await p.getAttribute('#f-eleccion .slot--u >> nth=1', 'data-u');
        await p.toca('#f-eleccion .slot--u >> nth=1'); await espera(p, 200);
        ok((await p.textContent('#ir-pagar')).includes(u2) && (await p.getAttribute('#f-eleccion .slot--u >> nth=1', 'aria-pressed')) === 'true', `${w} ficha: la cancha elegida queda marcada y el aviso verde la nombra (${u2})`);
        uElegida = u2;
      }
      ok(/seña \$/.test(await p.textContent('#ir-pagar')) && await p.isVisible('#ir-pagar'), `${w} ficha: el aviso muestra el día, la hora y la seña`);
      await p.limpio('ficha con horario');
      await p.toca('#ir-pagar [data-act="reservar"]'); await espera(p);
      ok((await p.pagina()) === 'pago' && (await p.locator('#pago-root .chk__turno').count()) === 1 && /Confirmá tu turno/.test(await p.textContent('#pago-root h1')), `${w} reservar: va directo a pagar la seña de ese turno`);
      if (uElegida) ok((await p.textContent('#pago-root')).includes(uElegida.split(' · ')[0]), `${w} pago: el turno es en la cancha que eligió (${uElegida})`);
      const reloj0 = await p.textContent('#pago-root .reloj b');
      ok(/^(10:00|09:5\d)$/.test(reloj0), `${w} pago: el turno queda guardado 10 minutos (${reloj0})`);
      ok(await p.evaluate(() => !document.querySelector('[data-tab="carrito"], #t-carrito, [data-count="carrito"]') && !/carrito/i.test(document.body.innerText)), `${w} sin carrito: ni pestaña, ni ícono, ni la palabra`);
      ok(/Dónde queda/.test(await p.textContent('#pago-root')) && (await p.locator('#pago-root .pasos li').count()) === 3, `${w} pago: muestra dónde queda y los tres pasos de cómo sigue`);
      await p.limpio('pago');

      // ---------- El turno guardado sigue a la vista en las otras pantallas ----------
      await p.toca('#page-pago .back'); await espera(p);
      ok((await p.pagina()) === 'ficha', `${w} pago: "Volver" vuelve a la ficha`);
      await p.toca('.top .brand'); await espera(p);
      if (cel) ok(await p.isVisible('#hold-bar') && /^0\d:\d\d$/.test(await p.textContent('#hold-bar [data-reloj]')), `${w} turno guardado: en el celular, la barra "Pagar seña" con el tiempo que queda`);
      else ok(await p.isVisible('#t-pago') && /^0\d:\d\d$/.test(await p.textContent('#t-pago [data-reloj]')), `${w} turno guardado: arriba, "Pagar seña" con el tiempo que queda`);
      await p.limpio('inicio con un turno guardado');
      await p.toca(cel ? '#hold-bar .btn' : '#t-pago'); await espera(p);
      ok((await p.pagina()) === 'pago' && (await p.locator('#pago-root .chk__turno').count()) === 1 && !(await p.isVisible('#hold-bar')) && !(await p.isVisible('#t-pago')), `${w} turno guardado: "Pagar seña" vuelve a la pantalla de pago`);

      // ---------- Para pagar hace falta la cuenta (pedido del dueño, 19/11) → pago simulado → Mis turnos ----------
      await p.toca('[data-act="pay"]'); await espera(p, 700);
      ok((await p.pagina()) === 'pago' && !(await p.isVisible('.mpov')) && /Primero creá tu cuenta/.test(await p.textContent('#cu-msg')) && await p.isVisible('#f-cuenta[data-modo="nueva"]'), `${w} pago: sin cuenta no se paga; pide crear la cuenta (o entrar)`);
      await p.toca('#f-cuenta button[type=submit]'); await espera(p, 200);
      ok(await p.evaluate(() => ['cu-nombre', 'cu-email', 'cu-cel', 'cu-clave', 'cu-acepto'].every((id) => !document.getElementById(id + '-e').hidden && document.getElementById(id).getAttribute('aria-invalid') === 'true')), `${w} cuenta: sin datos, avisa al lado de cada campo (también que hay que aceptar las condiciones)`);
      ok(/Ley Nº 25\.326/.test(await p.textContent('#cuenta .legal')) && /Agencia de Acceso a la Información Pública/.test(await p.textContent('#cuenta .legal')) && (await p.locator('#cuenta a[href="privacidad.html"]').count()) >= 1 && !(await p.isChecked('#cu-promos')), `${w} cuenta: la leyenda de la AAIP, el link a la política de privacidad y las promociones sin marcar`);
      await p.fill('#cu-nombre', 'Ana Prueba'); await p.fill('#cu-email', `ana${w}@prueba.com`); await p.fill('#cu-cel', '2622 15 123456'); await p.fill('#cu-clave', 'canchas2026');
      await p.check('#cu-acepto');
      ok(await p.evaluate(() => [...document.querySelectorAll('#f-cuenta .err')].every((e) => e.hidden)), `${w} cuenta: al corregir cada campo, su aviso se va`);
      await p.toca('#f-cuenta button[type=submit]'); await espera(p, 500);
      ok((await p.pagina()) === 'pago' && !(await p.isVisible('#f-cuenta')) && /Ana Prueba/.test(await p.textContent('#cuenta')) && (await p.textContent('#cuenta')).includes(`ana${w}@prueba.com`) && (await p.locator('#pago-root .chk__turno').count()) === 1, `${w} cuenta: se crea ahí mismo y sigue en el pago, con el turno guardado`);
      await p.limpio('pago con la cuenta abierta');
      await p.toca('[data-act="pay"]'); await espera(p, 300);
      ok(await p.isVisible('.mpov'), `${w} pago: aparece el pago simulado`);
      await p.waitForSelector('#page-turnos:not([hidden]) .tcard', { timeout: 6000 }); await espera(p);
      ok((await p.pagina()) === 'turnos' && (await p.locator('#turnos-root .tcard').count()) === 1 && /BK-/.test(await p.textContent('.tcard .code')), `${w} pago: el turno queda en Mis turnos con su código`);
      ok(/demo/i.test(await p.textContent('#toast')), `${w} pago: avisa que es una demo`);
      ok(await p.isVisible('.okban [data-go="home"]') && (await p.locator('#turnos-root .mas .now').count()) > 0 && !(await p.isVisible('#hold-bar')) && !(await p.isVisible('#t-pago')), `${w} Mis turnos: "¡Listo!" con "Reservar otro turno", turnos libres abajo y sin turno guardado`);
      await p.limpio('Mis turnos');
      await p.toca('[data-act="cancel"]'); await espera(p, 300);
      ok(await p.isVisible('#dlg[open]'), `${w} Mis turnos: "Cancelar" pregunta antes`);
      await p.toca('#dlg-no'); await espera(p, 200);
      ok(!(await p.isVisible('#dlg[open]')) && (await p.locator('.tcard').count()) === 1, `${w} Mis turnos: "Volver" no cancela`);
      ok(await p.isVisible('.micuenta') && (await p.textContent('.micuenta')).includes(`ana${w}@prueba.com`) && /mail a ana/.test(await p.textContent('.okban')), `${w} Mis turnos: al lado, "Tu cuenta" con sus datos; el aviso dice que la confirmación va por mail`);
      await p.toca('[data-act="cancel"]'); await espera(p, 300); await p.toca('#dlg-si'); await espera(p);
      ok((await p.locator('.tcard').count()) === 0 && /Todavía no tenés turnos/.test(await p.textContent('#turnos-root')), `${w} Mis turnos: cancelar lo saca`);
      if (w === 1440) {
        // ---------- La cuenta: salir, entrar, corregir los datos y borrarla ----------
        await p.click('.micuenta [data-act="cu-salir"]'); await espera(p, 300);
        ok(await p.isVisible('#f-cuenta[data-modo="entrar"]') && /¿Todavía no tenés cuenta\?/.test(await p.textContent('#turnos-root')) && (await p.locator('#turnos-root a[href="admin.html"]').count()) === 1, '1440 Mis turnos sin cuenta: "Entrá a tu cuenta", cómo se crea una y el link al panel para negocios');
        await p.fill('#cu-email', 'ana1440@prueba.com'); await p.fill('#cu-clave', 'otra-clave');
        await p.click('#f-cuenta button[type=submit]'); await espera(p, 300);
        ok(/no coinciden/.test(await p.textContent('#cu-msg')), '1440 entrar: con la contraseña equivocada avisa');
        await p.fill('#cu-clave', 'canchas2026'); await p.click('#f-cuenta button[type=submit]'); await espera(p, 400);
        ok(await p.isVisible('.micuenta'), '1440 entrar: con email y contraseña vuelve a su cuenta');
        await p.click('[data-act="cu-editar"]'); await espera(p, 200);
        ok(await p.isVisible('#dlg-datos[open]') && (await p.inputValue('#dd-nombre')) === 'Ana Prueba' && (await p.textContent('#dd-email')) === 'ana1440@prueba.com', '1440 corregir datos: abre con sus datos (el email se ve, no se cambia)');
        await p.fill('#dd-cel', '261 444 9999'); await p.check('#dd-promos'); await p.click('#f-datos button[type=submit]'); await espera(p, 300);
        ok(!(await p.isVisible('#dlg-datos[open]')) && /261 444 9999/.test(await p.textContent('.micuenta')) && /Recibís promociones/.test(await p.textContent('.micuenta')), '1440 corregir datos: el celular y las promociones quedan guardados');
        await p.click('[data-act="cu-borrar"]'); await espera(p, 200);
        ok(/Borrar tu cuenta/.test(await p.textContent('#dlg-t')), '1440 borrar la cuenta: pregunta antes');
        await p.click('#dlg-si'); await espera(p, 400);
        ok(!(await p.isVisible('.micuenta')) && await p.isVisible('#f-cuenta') && await p.evaluate(() => !JSON.parse(localStorage.getItem('bookea:clientes:v1')).cuentas.length), '1440 borrar la cuenta: se borran sus datos');
        await p.goto(B + 'privacidad.html'); await espera(p, 300);
        ok(/Privacidad y condiciones/.test(await p.textContent('h1')) && (await p.locator('#privacidad, #derechos, #condiciones').count()) === 3 && /Agencia de Acceso a la Información Pública/.test(await p.textContent('.doc__aaip')), '1440 privacidad.html: política, derechos (con la leyenda de la AAIP) y condiciones');
        await p.limpio('privacidad');
        await p.ir(B);
      }
      if (cel) {
        ok((await p.locator('.tabbar button').count()) === 3, `${w} barra de abajo: Reservar, Mis turnos y Negocios (sin Carrito)`);
        await p.toca('.tabbar [data-tab="home"]'); await espera(p);
        ok((await p.pagina()) === 'home', `${w} barra de abajo: Reservar`);
      }

      // ---------- Para negocios ----------
      await p.ir(B);
      await p.toca(cel ? '.tabbar [data-tab="negocios"]' : '.top__neg'); await espera(p);
      ok((await p.pagina()) === 'negocios' && await p.isVisible('.band h1'), `${w} "Sumá tu negocio"/"Negocios": abre la parte para negocios`);
      await p.limpio('negocios');
      await p.toca('.band [data-scroll="como-funciona"]'); await espera(p, 900);
      ok(await p.evaluate(() => Math.abs(document.querySelector('#como-funciona').getBoundingClientRect().top) < 140), `${w} negocios: "Cómo funciona" baja a esa parte`);
      await p.locator('#como-funciona .copy').scrollIntoViewIfNeeded(); await espera(p, 600);
      await p.toca('#como-funciona .copy'); await espera(p, 300);
      ok(/Copiado|Seleccionado/.test(await p.textContent('#como-funciona .copy')), `${w} negocios: "Copiar" el link responde`);
      await p.toca('[data-step="1"]'); await espera(p, 100);
      ok((await p.textContent('#hrs')) === '7 h', `${w} negocios: + suma una hora a la regla de cancelación`);
      await p.toca('.switch'); await espera(p, 100);
      ok((await p.getAttribute('.switch', 'aria-checked')) === 'false' && /queda para vos/.test(await p.textContent('#rule-note')), `${w} negocios: el interruptor cambia la regla`);
      await p.toca('#preguntas details:nth-of-type(2) summary'); await espera(p, 200);
      ok(await p.evaluate(() => document.querySelectorAll('#preguntas details')[1].open), `${w} negocios: las preguntas se abren`);
      await p.toca('.band [data-scroll="sumate"]'); await espera(p, 900);

      // ---------- "Sumá tu negocio" → registro → panel ----------
      await p.toca('#form-sumate button[type="submit"]'); await espera(p, 300);
      ok(!p.url().includes('admin.html') && /3 campos/.test(await p.textContent('#form-sumate .form__msg')) && await p.isVisible('#f-nombre-err'), `${w} sumate: vacío no sigue y avisa`);
      await p.fill('#f-nombre', 'Julia Méndez'); await p.fill('#f-negocio', 'Pádel & Co. Tunuyán'); await p.fill('#f-rubro', 'Pádel');
      await Promise.all([p.waitForURL('**/admin.html**'), p.toca('#form-sumate button[type="submit"]')]); await espera(p, 900);
      ok(await p.isVisible('#f-registro') && (await p.inputValue('#r-nombre')) === 'Julia Méndez' && (await p.inputValue('#r-negocio')) === 'Pádel & Co. Tunuyán' && (await p.inputValue('#r-rubro')) === 'Pádel', `${w} sumate: abre el registro del panel con los tres datos cargados`);
      ok(!p.url().includes('alta=') && await p.evaluate(() => document.activeElement.id === 'r-email'), `${w} sumate: dirección limpia y foco en el email`);
      await p.limpio('panel, registro');
      await p.fill('#r-email', `julia${w}@example.com`); await p.fill('#r-clave', 'clave-segura-1'); await p.fill('#r-clave2', 'clave-segura-1');
      await p.toca('#f-registro button[type="submit"]'); await espera(p, 4200);
      ok(await p.isVisible('#panel') && (await p.textContent('#panel')).includes('Pádel & Co. Tunuyán'), `${w} sumate: la cuenta se crea y entra al panel de su negocio`);
      await p.reload({ waitUntil: 'load' }); await espera(p, 800);
      ok(await p.isVisible('#f-ingresar'), `${w} panel: al recargar pide ingresar (no repite el registro)`);

      // ---------- Panel con la cuenta de prueba ----------
      await p.fill('#i-email', 'demo@example.com'); await p.fill('#i-clave', 'bookea2026');
      await p.toca('#f-ingresar button[type="submit"]'); await espera(p, 4200);
      ok(await p.isVisible('#panel'), `${w} panel: entra con la cuenta de prueba`);
      ok(await p.evaluate(() => [...document.querySelectorAll('a.brand')].every((l) => l.getAttribute('href') === './')), `${w} panel: el logo vuelve a bookea.ar/ (no a /index.html)`);
      for (const v of ['agenda', 'finanzas', 'clientes', 'negocio', 'cuenta']) {
        await p.toca(`.menu__i[data-vista="${v}"]`); await espera(p, 700);
        await p.limpio(`panel, ${v}`);
      }
      // Finanzas en tarjetas y Mi negocio compacto, con la duración y los horarios cada 10 minutos (pedido del dueño, 19/11)
      await p.toca('.menu__i[data-vista="finanzas"]'); await espera(p, 700);
      ok(await p.evaluate(() => document.querySelectorAll('.fz-k').length === 4 && !!document.querySelector('.chart .prom') && !!document.querySelector('.chart .tope-t') && !!document.querySelector('.chart .eje--hoy')), `${w} finanzas: cuatro tarjetas, la línea del promedio, el monto del mejor día y hoy marcado`);
      if (w === 1440) ok(await p.evaluate(() => document.querySelector('.fz').getBoundingClientRect().bottom <= innerHeight), `${w} finanzas: todas las tarjetas entran en la pantalla sin bajar`);
      // la planilla de cobros se descarga en Excel (.xlsx), no en CSV (pedido del dueño, 26/11: el CSV se veía en una sola columna)
      if (w === 1440) {
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }), p.click('#planilla')]);
        const buf = require('fs').readFileSync(await dl.path()), xml = buf.toString('utf8');
        ok(/\.xlsx$/.test(dl.suggestedFilename()) && buf.slice(0, 2).toString() === 'PK' && /<t xml:space="preserve">Monto<\/t>/.test(xml)
          && /<c r="A5" s="2"><v>\d+<\/v><\/c>/.test(xml) && /<f>SUM\(G5:G\d+\)<\/f>/.test(xml) && /pane ySplit="4"/.test(xml),
          `${w} finanzas: la planilla se descarga en Excel, con fechas de verdad, el encabezado fijo y el total ${dl.suggestedFilename()}`);
      }
      await p.toca('.menu__i[data-vista="negocio"]'); await espera(p, 700);
      ok(await p.evaluate(() => { const d = [...document.querySelectorAll('#g-dur option')].map((o) => +o.value), h = [...document.querySelector('#g-hor select').options].map((o) => o.value); return d[0] === 10 && d.every((x, i) => !i || x - d[i - 1] === 10) && h.length === 144 && h[1] === '00:10'; }), `${w} mi negocio: la duración y los horarios van cada 10 minutos`);
      if (w === 1440) {
        ok(await p.evaluate(() => getComputedStyle(document.querySelector('.ng')).gridTemplateColumns.split(' ').length === 3 && document.documentElement.scrollHeight < 1350), `${w} mi negocio: tres columnas y en menos de una pantalla y media`);
        // Por filas (pedido del dueño, 19/11): en cada fila las tarjetas terminan a la misma altura,
        // y en una pantalla de 1280×650 la primera fila entra entera; las de abajo se ven al bajar.
        ok(await p.evaluate(() => { const g = {}; for (const c of document.querySelectorAll('.ng-card')) { const r = c.getBoundingClientRect(); (g[Math.round(r.top)] ||= []).push(r.bottom); } const f = Object.values(g); return f.length === 3 && f.every((b) => b.length > 1 && Math.max(...b) - Math.min(...b) < 1.5); }), `${w} mi negocio: tres filas y en cada una las tarjetas terminan a la misma altura`);
        await p.setViewportSize({ width: 1280, height: 650 }); await espera(p, 400);
        ok(await p.evaluate(() => { scrollTo(0, 0); const c = [...document.querySelectorAll('.ng-card')], top = Math.min(...c.map((x) => x.getBoundingClientRect().top)); const f1 = c.filter((x) => Math.abs(x.getBoundingClientRect().top - top) < 2); return f1.length === 3 && f1.every((x) => x.getBoundingClientRect().bottom <= innerHeight); }), '1280×650 mi negocio: la primera fila de tarjetas entra entera sin bajar');
        await p.setViewportSize({ width: w, height: h }); await espera(p, 300);
      }
      // Más llamativo (pedido del dueño, 19/11): un bloque noche por vista y el naranja en la acción clave
      if (w === 1440) {
        await p.toca('.menu__i[data-vista="agenda"]'); await espera(p, 700);
        ok(await p.evaluate(() => { const n = (s) => document.querySelector(s) && getComputedStyle(document.querySelector(s)).backgroundColor; return n('.lado') === 'rgb(17, 21, 28)' && n('.prox1') === 'rgb(17, 21, 28)' && n('[data-nuevo]') === 'rgb(204, 69, 32)'; }), `${w} panel: barra del costado y próximo turno en noche, "Cargar turno" en naranja`);
        await p.toca('.menu__i[data-vista="finanzas"]'); await espera(p, 700);
        ok(await p.evaluate(() => getComputedStyle(document.querySelector('.fz-cob')).backgroundColor === 'rgb(17, 21, 28)'), `${w} finanzas: lo cobrado en noche`);
      }

      // ---------- Links viejos ----------
      await p.ir(B + 'index.html#sumate');
      ok((await p.pagina()) === 'negocios' && await p.evaluate(() => Math.abs(document.querySelector('#sumate').getBoundingClientRect().top) < 160), `${w} link viejo index.html#sumate: abre el formulario`);
      await p.evaluate(() => { window.__sinRecargar = 1; }); await p.toca('.tabbar [data-tab="home"], .top .brand'); await espera(p);
      await p.goto(B + '#preguntas'); await espera(p, 900);
      ok((await p.pagina()) === 'negocios' && await p.evaluate(() => window.__sinRecargar === 1 && (() => { const r = document.querySelector('#preguntas').getBoundingClientRect(); return r.top >= -2 && r.top < innerHeight - 100; })()), `${w} link #preguntas con la página ya abierta: va a las preguntas sin recargar`);
      await p.ir(B + 'reservar.html');
      ok((await p.pagina()) === 'home' && /\/$|index\.html$/.test(new URL(p.url()).pathname), `${w} link viejo reservar.html: abre el buscador del inicio`);
      ok((await p.getAttribute('.top a.btn--ink', 'href')) === 'admin.html', `${w} "Ingresar" lleva al panel`);
      await p.ir(B + 'index.html');
      ok(new URL(p.url()).pathname === '/', `${w} entrar por /index.html deja la dirección limpia (bookea.ar/)`);
      // ---------- La página de un negocio (bookea.ar/nombre; acá ?pagina=), rehecha el 25/11 (pedido del dueño) ----------
      await p.goto(B + '?pagina=losalamos', { waitUntil: 'load' });
      await p.waitForFunction(() => document.documentElement.classList.contains('is-ready') && document.querySelector('#page-local:not([hidden]) .loc'), null, { timeout: 8000 }).catch(() => {});
      await espera(p, 600);
      const loc = await p.evaluate(() => ({
        pagina: (document.querySelector('.page:not([hidden])') || {}).dataset?.page,
        splash: !!document.querySelector('.splash') && getComputedStyle(document.querySelector('.splash')).display !== 'none',
        sinBookea: ['.top', '.tabbar', '.foot'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none'),
        marca: !!document.querySelector('.loc__hero .loc__bookea'), turnos: document.querySelectorAll('#local-root .slot, #local-root .now, #local-root .ptable').length,
        botones: document.querySelectorAll('#local-root [data-act="ficha"]').length, alFinal: !!document.querySelector('.loc__fin [data-act="ficha"]'),
        texto: document.querySelector('#local-root').textContent, mapa: (document.querySelector('.loc__mapa iframe') || {}).src || '',
        tarjetas: document.querySelectorAll('.loc__bloque').length, hoy: document.querySelectorAll('.loc__hor tr.is-hoy').length,
        fotosEnTarjetas: document.querySelectorAll('.loc__bloque .loc__fotos img').length,
        horarios: [...document.querySelectorAll('.loc__hor tr')].map((tr) => tr.textContent), fin: Math.round(document.querySelector('.loc__fin').getBoundingClientRect().height),
      }));
      ok(loc.pagina === 'local' && !loc.splash && loc.sinBookea && loc.marca, `${w} página del negocio: sin la barra, la de abajo, el pie ni la pantalla de carga de Bookea; solo el logo de Bookea sobre la foto`);
      ok(loc.turnos === 0 && loc.botones === 1 && loc.alFinal && loc.tarjetas === 3 && !/Características/.test(loc.texto) && /3 canchas de pádel/.test(loc.texto) && /Vestuarios/.test(loc.texto)
        && !/Galería/.test(loc.texto) && loc.fotosEnTarjetas >= 2 && /Dónde estamos/.test(loc.texto) && /Servicios/.test(loc.texto) && /maps\.google\.com/.test(loc.mapa),
        `${w} página del negocio: tarjetas con lo que tiene el lugar (canchas, horarios, servicios), galería, horarios con el mapa al lado y un solo botón para reservar, al final (sin turnos ni precios) ${loc.tarjetas}`);
      // compacta (pedido del dueño, 26/11): los días que abren igual van en una sola fila y el cierre es una franja chica
      ok(loc.horarios.length === 1 && /^Todos los días17:00 a 00:30$/.test(loc.horarios[0]) && loc.hoy === 0 && loc.fin > 0 && loc.fin <= 240,
        `${w} página del negocio: horarios en una fila ("Todos los días") y "Reservá tu turno" chico ${JSON.stringify(loc.horarios)} ${loc.fin}px`);
      await p.limpio('página del negocio');
      await p.toca('.loc__fin [data-act="ficha"]'); await espera(p);
      ok((await p.pagina()) === 'ficha' && await p.evaluate(() => getComputedStyle(document.querySelector('.top')).display !== 'none'), `${w} página del negocio: "Reservar turno" lleva a sus turnos (y ahí vuelve la barra de Bookea)`);
      ok((await p.evaluate(() => document.documentElement.scrollWidth)) <= w, `${w}: sin desplazamiento horizontal`);
      ok(p.errs.length === 0, `${w}: sin errores en la consola ni archivos que falten ${p.errs.join(' | ')}`);
      await p.context().close();
    }

    // ---------- Primer pantallazo: el buscador entero a la vista, sin bajar (pedido del dueño, 18/11) ----------
    for (const [w, h] of [[360, 560], [390, 600], [390, 664], [414, 720], [768, 900], [1280, 620], [1366, 657], [1440, 760], [1536, 730], [1920, 950]]) {
      const q = await abrir(w, h);
      await q.ir(B); await q.waitForTimeout(900);
      const r = await q.evaluate(() => {
        const tb = document.querySelector('.tabbar'), tabH = tb && getComputedStyle(tb).display !== 'none' ? tb.getBoundingClientRect().height : 0;
        const k = document.querySelector('.finder__k');
        return { ve: Math.floor(innerHeight - tabH), fin: Math.ceil(document.querySelector('#finder').getBoundingClientRect().bottom), rotulo: getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().height > 0,
          envivo: Math.floor(document.querySelector('#libres .eyebrow').getBoundingClientRect().top) };
      });
      ok(r.fin <= r.ve && r.rotulo, `${w}x${h} primer pantallazo: "¿Qué querés reservar?" y "Buscar turnos" entran sin bajar (termina en ${r.fin}, se ve hasta ${r.ve})`);
      ok(r.envivo >= r.ve - 1, `${w}x${h} la pantalla termina en el buscador, "En vivo" aparece al bajar (empieza en ${r.envivo})`);
      await q.context().close();
    }

    // ---------- Turno guardado 10 minutos (pedido del dueño, 18/11): se vence, se libera y se puede volver a reservar ----------
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const q = await abrir(w, h);
      await q.clock.install();
      await q.ir(B + 'reservar.html?rubro=padel&dia=1');
      await q.toca('.qslot >> nth=0'); await espera(q, 300);
      await q.toca('#ir-pagar [data-act="reservar"]'); await espera(q);
      await q.clock.fastForward('08:30'); await espera(q, 300);
      const poco = await q.evaluate(() => ({ t: document.querySelector('#pago-root .reloj b').textContent, naranja: document.querySelector('#pago-root .reloj').classList.contains('is-poco') }));
      ok(/^01:[23]\d$/.test(poco.t) && poco.naranja, `${w} turno guardado: a los 8 minutos y medio quedan ${poco.t} y el reloj se pone naranja`);
      await q.clock.fastForward('01:45'); await espera(q, 300);
      ok(await q.isVisible('.aviso--vencio') && /Se terminó el tiempo/.test(await q.textContent('#pago-root')) && (await q.locator('#pago-root .mas .now').count()) > 0, `${w} turno guardado: a los 10 minutos se libera, avisa y muestra otros turnos libres`);
      await q.limpio('turno vencido');
      await q.toca('[data-act="otra-vez"]'); await espera(q);
      ok((await q.locator('#pago-root .chk__turno').count()) === 1 && /^(10:00|09:5\d)$/.test(await q.textContent('#pago-root .reloj b')), `${w} turno vencido: "Volver a reservarlo" lo guarda otros 10 minutos`);
      ok(q.errs.length === 0, `${w} turno guardado: sin errores ${q.errs.join(' | ')}`);
      await q.context().close();
    }

    // ---------- Movimiento ----------
    {
      const q = await abrir(1440, 900);
      await q.goto(B, { waitUntil: 'domcontentloaded' });
      const alAbrir = await q.evaluate(() => ({ splash: !!document.querySelector('.splash') && getComputedStyle(document.querySelector('.splash')).display !== 'none', listo: document.documentElement.classList.contains('is-ready') }));
      ok(alAbrir.splash && !alAbrir.listo, 'movimiento: al abrir aparece la pantalla de carga con la B');
      ok(await q.evaluate(() => getComputedStyle(document.querySelector('.sp-asta')).animationName === 'sp-asta' && getComputedStyle(document.querySelector('.sp-naranja')).animationName === 'sp-naranja'), 'movimiento: la B se arma (asta, verde y naranja)');
      const t0 = Date.now();
      await q.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 6000 });
      const espero = Date.now() - t0;
      ok(espero >= 700 && espero < 4500, `movimiento: la pantalla de carga sube después de ~1,5 s (${espero} ms desde que se vio)`);
      // espera a que termine la entrada (con tope), en vez de mirar en un momento fijo: no depende de lo rápida que esté la máquina
      await q.waitForFunction(() => !document.querySelector('.splash') && getComputedStyle(document.querySelector('.hero h1 .ln > span')).transform === 'none' && getComputedStyle(document.querySelector('.finder')).opacity === '1', null, { timeout: 4000 }).catch(() => {});
      ok(!(await q.$('.splash')) && await q.evaluate(() => getComputedStyle(document.querySelector('.hero h1 .ln > span')).transform === 'none' && getComputedStyle(document.querySelector('.finder')).opacity === '1'), 'movimiento: después entra el título renglón por renglón y el buscador');
      const antes = await q.evaluate(() => { const el = document.querySelector('#grid-dest .vcard'); return el.classList.contains('rise') && !el.classList.contains('is-in'); });
      await q.evaluate(() => document.querySelector('#grid-dest').scrollIntoView({ block: 'center', behavior: 'instant' })); await q.waitForTimeout(1300);
      ok(antes && await q.evaluate(() => !document.querySelector('#grid-dest .vcard.rise')), 'movimiento: al bajar, los lugares suben a su lugar (y después quedan quietos)');
      await q.evaluate(() => window.scrollTo(0, 0)); await q.waitForTimeout(300);
      await q.hover('.top a.btn--ink'); await q.waitForTimeout(500);
      ok(await q.evaluate(() => { const b = document.querySelector('.top a.btn--ink'); return getComputedStyle(b, '::before').clipPath === 'inset(0px)' && getComputedStyle(b).color === 'rgb(17, 21, 28)'; }), 'movimiento: con el mouse, "Ingresar" se llena de verde agua de izquierda a derecha');
      await q.hover('.top .brand'); await q.waitForTimeout(600);
      ok(await q.evaluate(() => { const b = document.querySelector('.top .brand'); return getComputedStyle(b, '::before').clipPath === 'inset(0px round 12px)' && getComputedStyle(b.querySelector('.brand__mark')).transform !== 'none'; }), 'movimiento: con el mouse, el logo de Bookea se llena de verde agua y la B se inclina');
      await q.hover('#finder button[type=submit]'); await q.waitForTimeout(500);
      ok(await q.evaluate(() => getComputedStyle(document.querySelector('#finder button[type=submit]'), '::before').clipPath === 'inset(0px)'), 'movimiento: "Buscar turnos" también barre en verde agua');
      await q.click('#f-rubros .rubro[data-k="tenis"]');
      ok(await q.evaluate(() => getComputedStyle(document.querySelector('#f-rubros .rubro[aria-pressed="true"]'), '::before').animationName === 'pop'), 'movimiento: el rubro elegido hace un saltito');
      ok(q.errs.length === 0, 'movimiento: sin errores ' + q.errs.join(' | '));
      await q.context().close();
      const c = await abrir(390, 844);
      await c.ir(B);
      await c.dispatchEvent('#finder button[type=submit]', 'pointerdown', { pointerType: 'touch', isPrimary: true });
      const apreta = await c.evaluate(() => document.querySelector('#finder button[type=submit]').classList.contains('is-apreta'));
      await c.dispatchEvent('#finder button[type=submit]', 'pointerup', { pointerType: 'touch', isPrimary: true });
      const suelta = await c.evaluate(() => document.querySelector('#finder button[type=submit]').classList.contains('is-suelta'));
      ok(apreta && suelta, 'movimiento: con el dedo, el botón se aprieta y rebota al soltar');
      // el logo: que de verdad se mueva y se ponga verde (antes la entrada de la barra de arriba lo dejaba quieto)
      await c.dispatchEvent('.top .brand', 'pointerdown', { pointerType: 'touch', isPrimary: true }); await c.waitForTimeout(220);
      const logo = await c.evaluate(() => { const b = document.querySelector('.top .brand'); return { tr: getComputedStyle(b).transform, verde: getComputedStyle(b, '::before').opacity }; });
      await c.dispatchEvent('.top .brand', 'pointerup', { pointerType: 'touch', isPrimary: true });
      ok(logo.tr !== 'none' && logo.verde === '1', `movimiento: con el dedo, el logo de Bookea se aprieta y se pone verde agua (${JSON.stringify(logo)})`);
      await c.context().close();
    }

    // ---------- Teclado ----------
    let p = await abrir(1440, 900);
    await p.ir(B);
    await p.focus('#f-rubros .rubro[data-k="padel"]'); await p.keyboard.press('Tab'); await p.keyboard.press('Enter'); await espera(p, 200);
    ok((await p.getAttribute('#f-rubros .rubro[data-k="futbol"]', 'aria-pressed')) === 'true', 'teclado: Tab + Enter elige Fútbol 5');
    await p.focus('#finder button[type=submit]'); await p.keyboard.press('Enter'); await espera(p);
    ok((await p.pagina()) === 'resultados', 'teclado: Enter en "Buscar turnos" muestra los resultados');
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), 'teclado: el foco se ve');
    await p.context().close();

    // ---------- Movimiento reducido ----------
    p = await abrir(390, 844, { reducedMotion: 'reduce' });
    await p.ir(B + 'reservar.html?rubro=barberia&dia=1');
    await p.tap('.qslot >> nth=0'); await espera(p, 200);
    await p.tap('#ir-pagar [data-act="reservar"]'); await espera(p, 200);
    await p.fill('#cu-nombre', 'Leo Gil'); await p.fill('#cu-email', 'leo@prueba.com'); await p.fill('#cu-cel', '261 555 1234'); await p.fill('#cu-clave', 'canchas2026');
    await p.check('#cu-acepto'); await p.tap('#f-cuenta button[type=submit]'); await p.waitForSelector('#cuenta.cuenta--yo', { timeout: 3000 });
    await p.tap('[data-act="pay"]'); await p.waitForSelector('#page-turnos:not([hidden]) .tcard', { timeout: 3000 });
    ok(p.errs.length === 0, 'movimiento reducido: reserva completa y rápida, sin errores');
    await p.ir(B);
    ok(await p.evaluate(() => !document.querySelector('.rise')), 'movimiento reducido: nada sube ni barre, todo quieto');
    await p.context().close();

    // ---------- Sin JavaScript ----------
    p = await abrir(1440, 900, { javaScriptEnabled: false });
    await p.goto(B, { waitUntil: 'load' });
    ok(/activá JavaScript/.test(await p.textContent('#finder')) && (await p.getAttribute('.top a.btn--ink', 'href')) === 'admin.html', 'sin JavaScript: avisa que hace falta y "Ingresar" sigue andando');
    ok(!(await p.isVisible('.splash')) && await p.isVisible('.hero h1'), 'sin JavaScript: sin pantalla de carga, el título a la vista');
    await p.context().close();
  } catch (e) {
    fallas++; console.log('FALLA (excepción)', e.message);
  } finally {
    await br.close(); srv.close();
  }
  console.log(fallas ? `\n${fallas} FALLAS de ${hechas}` : `\nTODO OK (${hechas} comprobaciones)`);
  process.exit(fallas ? 1 : 0);
})();
