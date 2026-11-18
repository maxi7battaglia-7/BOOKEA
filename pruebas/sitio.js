// Prueba del frente (index.html) y del registro en el navegador (Playwright), en modo de prueba (sin base):
//   - inicio: rubros con foto, dónde/cuándo/hora y "Buscar turnos"; "Libres ahora" con su switch; lugares
//   - resultados: rubro, día, franja y zona; horarios rápidos; "Solo techadas"
//   - ficha del lugar: día, horario, cancha o barbero, "Reservar turno" (y la barra de abajo en el celular)
//   - pagar la seña (sin carrito): el turno guardado 10 minutos, el aviso "Pagar seña" en las otras pantallas,
//     avisos al lado de cada campo, pago simulado → Mis turnos → cancelar con su diálogo
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
      ok((await p.pagina()) === 'home' && (await p.locator('#f-rubros .rubro').count()) === 4, `${w} inicio: los cuatro rubros con foto`);
      ok(await p.evaluate(() => [...document.fonts].some((f) => f.family.includes('Inter Tight') && f.status === 'loaded')), `${w} inicio: la letra Inter Tight cargó desde bookea.ar`);
      ok(await p.evaluate(() => [...document.images].every((i) => !i.complete || i.naturalWidth > 0)), `${w} inicio: ninguna foto rota`);
      await p.limpio('inicio');
      await p.toca('#f-rubros .rubro[data-k="futbol"]'); await espera(p, 200);
      ok((await p.getAttribute('#f-rubros .rubro[data-k="futbol"]', 'aria-pressed')) === 'true' && (await p.getAttribute('#f-rubros .rubro[data-k="padel"]', 'aria-pressed')) === 'false', `${w} inicio: tocar Fútbol 5 lo marca`);
      await p.selectOption('#f-zona', 'tunuyan'); await p.selectOption('#f-dia', '1'); await p.selectOption('#f-franja', 'noche');
      await p.toca('#finder button[type=submit]'); await espera(p);
      ok((await p.pagina()) === 'resultados' && (await p.textContent('#r-t')) === 'Turnos de fútbol 5 en Tunuyán' && /mañana/i.test(await p.textContent('#r-s')) && /noche/.test(await p.textContent('#r-s')), `${w} buscar: resultados de fútbol 5 en Tunuyán, mañana a la noche`);
      await p.limpio('resultados');
      await p.goBack(); await espera(p);
      ok((await p.pagina()) === 'home', `${w} resultados: "atrás" del navegador vuelve al inicio`);

      // Libres ahora y lugares
      await p.toca('#hs-switch .pill[data-k="barberia"]'); await espera(p, 200);
      ok((await p.textContent('#dest-t')) === 'Barbería: para reservar hoy' && (await p.locator('#grid-dest .vcard').count()) === 3, `${w} inicio: el switch cambia "Libres ahora" y los lugares a Barbería`);
      ok((await p.locator('#rail-now .now').count()) > 0, `${w} inicio: hay turnos en "Libres ahora"`);
      await p.toca('#rail-now .now >> nth=0'); await espera(p);
      ok((await p.pagina()) === 'ficha' && (await p.locator('#book .slot.is-on').count()) === 1, `${w} "Libres ahora": abre el lugar con ese horario elegido`);
      await p.toca('.back'); await espera(p);
      ok((await p.pagina()) === 'home', `${w} ficha: "Volver" vuelve al inicio`);
      await p.toca('#grid-dest .vcard >> nth=0'); await espera(p);
      ok((await p.pagina()) === 'ficha' && (await p.textContent('.ficha h1')).length > 2 && !(await p.textContent('#page-ficha')).match(/reseña/i), `${w} lugares: abre la ficha (sin reseñas inventadas)`);
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
      await p.toca('.qslot >> nth=0'); await espera(p);
      ok((await p.pagina()) === 'ficha' && (await p.locator('#book .slot.is-on').count()) === 1 && !(await p.isDisabled('#book [data-act="reservar"]')), `${w} resultados: el horario rápido abre la ficha listo para reservar`);
      if (cel) ok(await p.isVisible('#mbar [data-act="reservar"]'), `${w} ficha: en el celular, la barra de abajo tiene "Reservar"`);

      // ---------- Ficha: elegir y reservar ----------
      await p.toca('#book .day[data-i="3"]'); await espera(p, 200);
      ok((await p.getAttribute('#book .day[data-i="3"]', 'aria-pressed')) === 'true' && (await p.locator('#book .day.is-on').count()) === 1, `${w} ficha: cambia el día`);
      await p.toca('#book .slot:not([disabled]) >> nth=0'); await espera(p, 200);
      if (await p.locator('#book .unit').count()) { await p.toca('#book .unit >> nth=1'); await espera(p, 150); }
      ok(/Seña ahora/.test(await p.textContent('#book .sum')), `${w} ficha: muestra la seña y lo que se paga en el lugar`);
      await p.limpio('ficha con horario');
      await p.toca('#book [data-act="reservar"]'); await espera(p);
      ok((await p.pagina()) === 'pago' && (await p.locator('#pago-root .chk__turno').count()) === 1 && /Confirmá tu turno/.test(await p.textContent('#pago-root h1')), `${w} reservar: va directo a pagar la seña de ese turno`);
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

      // ---------- Pago simulado → Mis turnos ----------
      await p.toca('[data-act="pay"]'); await espera(p, 200);
      ok(await p.isVisible('#c-nombre-e') && await p.isVisible('#c-wa-e'), `${w} pago: sin datos, avisa al lado de cada campo`);
      await p.fill('#c-nombre', 'Ana Prueba'); await p.fill('#c-wa', '2622 15 123456');
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
      await p.toca('[data-act="cancel"]'); await espera(p, 300); await p.toca('#dlg-si'); await espera(p);
      ok((await p.locator('.tcard').count()) === 0 && /Todavía no tenés turnos/.test(await p.textContent('#turnos-root')), `${w} Mis turnos: cancelar lo saca`);
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
      if (w <= 820) ok(r.envivo >= r.ve - 1, `${w}x${h} celular: la pantalla termina justo después del buscador, "En vivo" aparece al bajar (empieza en ${r.envivo})`);
      await q.context().close();
    }

    // ---------- Turno guardado 10 minutos (pedido del dueño, 18/11): se vence, se libera y se puede volver a reservar ----------
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const q = await abrir(w, h);
      await q.clock.install();
      await q.ir(B + 'reservar.html?rubro=padel&dia=1');
      await q.toca('.qslot >> nth=0'); await espera(q, 300);
      await q.toca('#book [data-act="reservar"]'); await espera(q);
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
      await q.waitForTimeout(1400);
      ok(!(await q.$('.splash')) && await q.evaluate(() => getComputedStyle(document.querySelector('.hero h1 .ln > span')).transform === 'none' && getComputedStyle(document.querySelector('.finder')).opacity === '1'), 'movimiento: después entra el título renglón por renglón y el buscador');
      const antes = await q.evaluate(() => { const el = document.querySelector('#grid-dest .vcard'); return el.classList.contains('rise') && !el.classList.contains('is-in'); });
      await q.evaluate(() => document.querySelector('#grid-dest').scrollIntoView({ block: 'center', behavior: 'instant' })); await q.waitForTimeout(1300);
      ok(antes && await q.evaluate(() => !document.querySelector('#grid-dest .vcard.rise')), 'movimiento: al bajar, los lugares suben a su lugar (y después quedan quietos)');
      await q.evaluate(() => window.scrollTo(0, 0)); await q.waitForTimeout(300);
      await q.hover('.top a.btn--ink'); await q.waitForTimeout(500);
      ok(await q.evaluate(() => { const b = document.querySelector('.top a.btn--ink'); return getComputedStyle(b, '::before').clipPath === 'inset(0px)' && getComputedStyle(b).color === 'rgb(17, 21, 28)'; }), 'movimiento: con el mouse, "Ingresar" se llena de verde agua de izquierda a derecha');
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
    await p.tap('#book [data-act="reservar"]'); await espera(p, 200);
    await p.fill('#c-nombre', 'Leo'); await p.fill('#c-wa', '261 555 1234');
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
