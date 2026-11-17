// Bookea — frente público: buscar → resultados → ficha del lugar → carrito con seña → Mis turnos,
// y la parte para negocios ("Sumá tu negocio" sigue en admin.html?alta=1, el registro del panel).
// Sin frameworks. Los negocios son ejemplos y el pago con Mercado Pago está simulado: no se cobra nada.
// Links que siguen andando: index.html?rubro=padel&zona=&dia=0&franja= (y reservar.html, que redirige acá)
// abre los resultados; #sumate, #como-funciona, #funciones y #preguntas abren la parte para negocios.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$ " + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Movimiento: tarjetas y secciones suben a su lugar al aparecer (clase .rise, en sitio.css) ----------
  // Espera a que suba la pantalla de carga; con "reducir movimiento" no hace nada.
  const SUBEN = [".sec__head", ".now", ".vcard", ".rcard", ".ex", ".cell", ".join", ".faq h2", ".faq details", ".blk", ".item", ".tcard", ".panel", ".band", ".foot__top > *", ".empty"].join(", ");
  let listoMov = false; const pendientes = [];
  const io = !reduce && "IntersectionObserver" in window ? new IntersectionObserver((ents) => ents.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target; io.unobserve(el); el.classList.add("is-in");
    // al terminar se saca la clase, así el cursor vuelve a mover la tarjeta (hover)
    setTimeout(() => el.classList.remove("rise", "is-in"), 900 + (parseInt(el.style.getPropertyValue("--d"), 10) || 0));
  }), { rootMargin: "0px 0px -6% 0px", threshold: 0.01 }) : null;
  function revelar(root) {
    if (!io || !root) return;
    if (!listoMov) { pendientes.push(root); return; }
    const orden = new Map(); // la escalera cuenta por contenedor
    $$(SUBEN, root).forEach((el) => {
      if (el.dataset.subio) return;
      el.dataset.subio = "1";
      const i = orden.get(el.parentElement) || 0; orden.set(el.parentElement, i + 1);
      el.style.setProperty("--d", `${Math.min(i, 6) * 70}ms`);
      el.classList.add("rise"); io.observe(el);
    });
  }

  // ---------- Fotos (assets/) ----------
  // Rutas enteras (no armadas): así la copia sin internet (scripts/sin-internet.py) las encuentra y las mete adentro
  const IMG = { padel: "assets/r-padel.webp", futbol: "assets/r-futbol.webp", tenis: "assets/r-tenis.webp", barberia: "assets/r-barberia.webp",
    canchas: "assets/m-padel-canchas.webp", paletas: "assets/m-paletas.webp", tenis2: "assets/m-tenis.webp", futbolnoche: "assets/m-futbol-noche.webp",
    barbero: "assets/m-barbero.webp", peine: "assets/m-barberia-peine.webp" };
  const img = (k, alt = "", extra = "") => `<img src="${IMG[k] || ""}" alt="${esc(alt)}" ${extra}/>`;

  // ---------- Almacenamiento liviano (por visitante) ----------
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bookea:" + k); return v ? JSON.parse(v) : (mem[k] ?? d); } catch { return mem[k] ?? d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem("bookea:" + k, JSON.stringify(v)); } catch {} },
  };

  // ---------- Fechas (Mendoza, UTC-3 fijo) ----------
  const TZ = "America/Argentina/Mendoza";
  const DOW3 = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const DOWL = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const nowM = () => {
    try {
      const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
      const g = (t) => +p.find((x) => x.type === t).value;
      return { y: g("year"), m: g("month"), d: g("day"), min: (g("hour") % 24) * 60 + g("minute") };
    } catch { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), min: n.getHours() * 60 + n.getMinutes() }; }
  };
  const dayInfo = (i) => {
    const n = nowM(), dt = new Date(Date.UTC(n.y, n.m - 1, n.d) + i * 864e5), dow = dt.getUTCDay();
    return { i, key: dt.toISOString().slice(0, 10), dow, d: dt.getUTCDate(), m: dt.getUTCMonth() + 1, finde: dow === 0 || dow === 6 };
  };
  const dayShort = (i) => (i === 0 ? "Hoy" : i === 1 ? "Mañ" : DOW3[dayInfo(i).dow]);
  const dayFull = (i) => { const d = dayInfo(i); return (i === 0 ? "Hoy" : i === 1 ? "Mañana" : cap(DOWL[d.dow])) + ` ${d.d}/${d.m}`; };
  const keyLabel = (key) => { // etiqueta de una fecha ya guardada
    const t = dayInfo(0).key, [y, m, d] = key.split("-").map(Number), dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const diff = Math.round((Date.UTC(y, m - 1, d) - Date.parse(t)) / 864e5);
    return (diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : cap(DOW3[dow])) + ` ${d}/${m}`;
  };
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const fmt = (min) => { min %= 1440; return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); };
  const franjaDe = (min) => (min < 13 * 60 ? "manana" : min < 20 * 60 ? "tarde" : "noche");
  const FRANJAS = { "": "Todo el día", manana: "Mañana", tarde: "Tarde", noche: "Noche" };

  // ---------- Datos de ejemplo ----------
  const SENA = 0.25;
  const RUBROS = {
    padel: { n: "Pádel", img: "padel", un: "Cancha", uns: "canchas" },
    futbol: { n: "Fútbol 5", img: "futbol", un: "Cancha", uns: "canchas" },
    tenis: { n: "Tenis", img: "tenis", un: "Cancha", uns: "canchas" },
    barberia: { n: "Barbería", img: "barberia", un: "Barbero", uns: "barberos" },
  };
  const ZONAS = { tunuyan: "Tunuyán", tupungato: "Tupungato", "san-carlos": "San Carlos" };
  const P = (dia, noche, finde) => ({ dia, noche, finde });
  const cs = (n, techadas = []) => Array.from({ length: n }, (_, i) => `Cancha ${i + 1}` + (techadas.includes(i + 1) ? " · techada" : ""));
  const BARB = (a, b, c) => [
    { id: "corte", n: "Corte", min: 45, p: P(a, a, a) },
    { id: "corte-barba", n: "Corte y barba", min: 45, p: P(b, b, b) },
    { id: "barba", n: "Barba", min: 45, p: P(c, c, c) },
  ];
  const REG = { "Valle de Uco": ["tunuyan", "tupungato", "san-carlos"] };
  const AM = { vest: "Vestuarios", est: "Estacionamiento", palas: "Alquiler de paletas", buf: "Buffet", led: "Iluminación LED", cesped: "Césped sintético", luz: "Iluminación nocturna", parr: "Parrilla", polvo: "Polvo de ladrillo", raq: "Alquiler de raquetas", wifi: "Wi-Fi", mate: "Café y mate", qr: "Pago con QR", aire: "Aire acondicionado", cuen: "Mercado Pago", tv: "TV y música" };
  const VENUES = [
    { id: "losalamos", rubro: "padel", name: "Los Álamos", zona: "tupungato", fotos: ["canchas", "padel", "paletas"], dur: 90, bloques: [["17:00", "24:30"]], units: cs(3, [3]), p: P(28000, 34000, 36000), ocup: 34, cancel: 6, desc: "Tres canchas de cristal, una de ellas techada. Turnos de 90 minutos para jugar entre amigos o en pareja.", ame: ["vest", "est", "palas", "buf", "led"] },
    { id: "aconcagua", rubro: "padel", name: "Aconcagua Pádel Club", zona: "tunuyan", fotos: ["padel", "paletas", "canchas"], dur: 90, bloques: [["15:00", "24:00"]], units: cs(4, [1, 2]), p: P(30000, 36000, 38000), ocup: 42, cancel: 12, desc: "Cuatro canchas con fácil acceso, dos de ellas techadas. Ideal para jugar después de la oficina.", ame: ["vest", "palas", "buf", "led", "tv"] },
    { id: "terraza", rubro: "padel", name: "La Terraza Pádel", zona: "san-carlos", fotos: ["paletas", "canchas", "padel"], dur: 90, bloques: [["17:00", "24:30"]], units: cs(2), p: P(24000, 30000, 32000), ocup: 30, cancel: 6, desc: "Dos canchas al aire libre con buena luz de noche. Turnos de 90 minutos todos los días.", ame: ["vest", "est", "buf", "led"] },
    { id: "valleuco", rubro: "padel", name: "Valle de Uco Pádel", zona: "tunuyan", fotos: ["canchas", "paletas", "padel"], dur: 90, bloques: [["16:00", "23:30"]], units: cs(2, [1, 2]), p: P(22000, 28000, 30000), ocup: 28, cancel: 6, desc: "Dos canchas techadas para jugar con cualquier clima, con la cordillera de fondo.", ame: ["vest", "est", "palas", "mate"] },
    { id: "potrero", rubro: "futbol", name: "El Potrero Fútbol 5", zona: "tunuyan", fotos: ["futbol", "futbolnoche"], dur: 60, bloques: [["18:00", "24:00"]], units: cs(3), p: P(38000, 48000, 52000), ocup: 40, cancel: 12, desc: "Tres canchas de césped sintético con luz. El precio es por cancha, para el equipo completo, en turnos de 60 minutos.", ame: ["cesped", "luz", "vest", "est", "buf"] },
    { id: "laquinta", rubro: "futbol", name: "La Quinta Fútbol", zona: "tupungato", fotos: ["futbolnoche", "futbol"], dur: 60, bloques: [["18:00", "24:00"]], units: cs(2), p: P(34000, 44000, 46000), ocup: 36, cancel: 6, desc: "Dos canchas con parrilla para el tercer tiempo. El precio es por cancha.", ame: ["cesped", "luz", "parr", "vest"] },
    { id: "loscerros", rubro: "futbol", name: "Complejo Los Cerros", zona: "san-carlos", fotos: ["futbol", "futbolnoche"], dur: 60, bloques: [["18:00", "24:00"]], units: cs(2), p: P(30000, 40000, 42000), ocup: 30, cancel: 6, desc: "Complejo en San Carlos con dos canchas de fútbol 5. El precio es por cancha.", ame: ["cesped", "luz", "est", "buf"] },
    { id: "parque", rubro: "tenis", name: "Tenis Club Parque", zona: "tunuyan", fotos: ["tenis", "tenis2"], dur: 60, bloques: [["09:00", "13:00"], ["16:00", "21:00"]], units: cs(4), p: P(12000, 14000, 16000), ocup: 28, cancel: 12, desc: "Cuatro canchas de polvo de ladrillo en el corazón de la ciudad. Turnos de una hora, mañana y tarde.", ame: ["polvo", "vest", "raq", "est"] },
    { id: "nogales", rubro: "tenis", name: "Los Nogales Tenis", zona: "tupungato", fotos: ["tenis2", "tenis"], dur: 60, bloques: [["09:00", "13:00"], ["16:00", "21:00"]], units: cs(2), p: P(10000, 12000, 14000), ocup: 24, cancel: 6, desc: "Dos canchas rodeadas de álamos. Un lugar tranquilo para jugar sin apuro.", ame: ["polvo", "raq", "est", "mate"] },
    { id: "donruiz", rubro: "barberia", name: "Barbería Don Ruiz", zona: "tunuyan", fotos: ["barberia", "barbero", "peine"], dur: 45, bloques: [["10:00", "13:00"], ["17:00", "21:00"]], units: ["Ruiz", "Nahuel", "Fede"], svcs: BARB(14000, 18000, 10000), ocup: 38, cancel: 6, desc: "Barbería clásica con tres sillones. De 13 a 17 cerramos por la siesta.", ame: ["wifi", "mate", "qr", "aire"] },
    { id: "navaja", rubro: "barberia", name: "Corte & Navaja", zona: "san-carlos", fotos: ["barbero", "peine", "barberia"], dur: 45, bloques: [["10:00", "13:00"], ["17:00", "21:00"]], units: ["Lucho", "Gabi"], svcs: BARB(12000, 16000, 9000), ocup: 36, cancel: 6, desc: "Dos barberos, turnos de 45 minutos y afeitado con navaja.", ame: ["mate", "qr", "tv", "aire"] },
    { id: "gaucho", rubro: "barberia", name: "Barbería El Gaucho", zona: "tupungato", fotos: ["peine", "barberia", "barbero"], dur: 45, bloques: [["10:00", "13:00"], ["17:00", "21:00"]], units: ["Tomás", "Beto"], svcs: BARB(11000, 15000, 8000), ocup: 30, cancel: 6, desc: "Barbería de barrio en el Valle de Uco. Reservá y no esperes.", ame: ["wifi", "mate", "qr"] },
  ];
  VENUES.forEach((v) => { v.svcs = v.svcs || [{ id: "turno", n: `Turno de ${v.dur} min`, min: v.dur, p: v.p }]; });
  const venue = (id) => VENUES.find((v) => v.id === id);
  const minPrecio = (v) => Math.min(...v.svcs.flatMap((s) => Object.values(s.p)));
  const senaDe = (p) => Math.round((p * SENA) / 50) * 50;
  const precioDe = (svc, di, start) => (di.finde ? svc.p.finde : start >= 20 * 60 ? svc.p.noche : svc.p.dia);


  // ---------- Estado ----------
  const S = { page: "home", hs: "padel", rubro: "padel", zona: "", dia: 0, franja: "", techada: false, svc: "", nav: 0, ys: {}, f: null, carrito: store.get("carrito", []), turnos: store.get("turnos", []) };
  const hoyKey = () => dayInfo(0).key;
  const limpiar = () => { // saca lo que ya pasó
    const n = nowM();
    S.carrito = S.carrito.filter((it) => it.key >= hoyKey() && !(it.key === hoyKey() && toMin(it.t) <= n.min));
  };
  limpiar();
  const guardar = () => { store.set("carrito", S.carrito); store.set("turnos", S.turnos); badges(); };

  // ---------- Disponibilidad (cada turno tiene su propia capacidad) ----------
  const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  const usado = (vid, key, t, unit) => S.carrito.concat(S.turnos).some((x) => x.vid === vid && x.key === key && x.t === t && x.unit === unit);
  const slotsFor = (v, dayI) => {
    const di = dayInfo(dayI), now = nowM(), out = [];
    v.bloques.forEach(([a, b]) => {
      for (let t = toMin(a); t + v.dur <= toMin(b); t += v.dur) {
        if (dayI === 0 && t < now.min + 30) continue;
        const ts = fmt(t);
        const occ = v.ocup + (t >= 20 * 60 ? 16 : 0) + (di.finde ? 12 : 0);
        const libres = v.units.filter((u) => hash(`${v.id}|${di.key}|${ts}|${u}`) % 100 >= occ && !usado(v.id, di.key, ts, u));
        out.push({ t: ts, start: t, end: fmt(t + v.dur), franja: franjaDe(t), libres, total: v.units.length });
      }
    });
    return out;
  };
  const esTech = (u) => /techada/.test(u);
  const techOn = () => S.techada && S.rubro === "padel";
  // Turnos libres con los filtros del home (franja y, si corresponde, cancha techada)
  const libresF = (v, d, fr = S.franja) => slotsFor(v, d)
    .map((s) => (techOn() ? { ...s, libres: s.libres.filter(esTech) } : s))
    .filter((s) => s.libres.length && (!fr || s.franja === fr));
  const matchV = (v) => v.rubro === S.rubro && (!S.zona || v.zona === S.zona) && (!techOn() || v.units.some(esTech));
  const quedan = (s, v) => (s.libres.length === 1 ? `Último${v.rubro === "barberia" ? "" : " lugar"}` : `${s.libres.length} libres`);
  const franjasDe = (rubro) => {
    const set = new Set();
    VENUES.filter((v) => v.rubro === rubro).forEach((v) => v.bloques.forEach(([a, b]) => { for (let t = toMin(a); t + v.dur <= toMin(b); t += v.dur) set.add(franjaDe(t)); }));
    return ["manana", "tarde", "noche"].filter((f) => set.has(f));
  };
  const turnosHoy = (rubro) => VENUES.filter((v) => v.rubro === rubro).reduce((a, v) => a + slotsFor(v, 0).filter((s) => s.libres.length).length, 0);

  // ---------- Navegación ----------
  const TITLES = { home: "Bookea · Reservá turnos en segundos", ficha: "Reservar · Bookea", carrito: "Carrito · Bookea", turnos: "Mis turnos · Bookea", resultados: "Turnos disponibles · Bookea", negocios: "Sumá tu negocio · Bookea" };
  function go(page, p = {}, replace = false) {
    S.ys[S.page] = window.scrollY;
    const st = { page, ...p };
    try { history[replace ? "replaceState" : "pushState"](st, "", location.pathname + location.search); if (!replace) S.nav++; } catch {}
    show(st);
  }
  function show(st) {
    const page = st.page || "home";
    if (page === "ficha") {
      const v = venue(st.v); if (!v) return go("home", {}, true);
      const svc0 = v.svcs.find((s) => s.id === S.svc) || v.svcs[0];
      S.f = { v: v.id, dia: st.dia ?? 0, svc: svc0.id, t: st.t || null, unit: "any" };
      if (S.f.t && !slotsFor(v, S.f.dia).some((s) => s.t === S.f.t && s.libres.length)) S.f.t = null;
    }
    S.page = page;
    $$(".page").forEach((el) => (el.hidden = el.dataset.page !== page));
    ({ home: renderHome, resultados: renderResultados, ficha: renderFicha, carrito: renderCarrito, turnos: renderTurnos, negocios: () => {} })[page](st);
    const el = $("#page-" + page); el.classList.remove("is-in"); void el.offsetWidth; el.classList.add("is-in");
    revelar(el);
    $$(".tabbar [data-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === (page === "resultados" ? "home" : page)));
    document.title = TITLES[page];
    if (!st.keepScroll) window.scrollTo(0, st.restore ? S.ys[page] || 0 : 0);
  }
  window.addEventListener("popstate", (e) => { S.nav = Math.max(0, S.nav - 1); show({ ...(e.state || { page: "home" }), restore: true }); });

  // ---------- Inicio: rubros chicos + filtros abiertos + Buscar ----------
  const diaCorto = (i) => (i === 0 ? "hoy" : i === 1 ? "mañana" : `el ${DOWL[dayInfo(i).dow]} ${dayInfo(i).d}/${dayInfo(i).m}`);
  function btnx(act, attrs, pressed, label, small = "") { return `<button type="button" class="chipx" data-act="${act}" ${attrs} aria-pressed="${pressed}">${label}${small ? `<small>${small}</small>` : ""}</button>`; }
  const SVCS = { corte: "Corte", "corte-barba": "Corte y barba", barba: "Barba" };
  const cardV = (v) => `<button type="button" class="vcard" data-act="ficha" data-v="${v.id}"><span class="vcard__ph">${img(v.fotos[0], v.name, 'loading="lazy"')}<span class="tag">${RUBROS[v.rubro].n}</span></span>
    <span class="vcard__t"><span><span class="vcard__n">${esc(v.name)}</span><span class="vcard__z">${ZONAS[v.zona]}</span></span><span class="vcard__p"><small>desde</small>${money(minPrecio(v))}</span></span></button>`;
  const zonaOpts = (rubro) => {
    const vs = rubro ? VENUES.filter((v) => v.rubro === rubro) : VENUES;
    return `<option value="">Todas las zonas</option>` + Object.entries(REG).map(([reg, ks]) => {
      const op = ks.filter((k) => vs.some((v) => v.zona === k)).map((k) => `<option value="${k}">${ZONAS[k]}</option>`).join("");
      return op ? `<optgroup label="${reg}">${op}</optgroup>` : "";
    }).join("");
  };
  const franjaOpts = (rubro) => `<option value="">Todo el día</option>` + franjasDe(rubro).map((f) => `<option value="${f}">${FRANJAS[f]}</option>`).join("");
  // Buscador del home (selects)
  function renderBuscador() {
    $("#f-rubros").innerHTML = Object.entries(RUBROS).map(([k, r]) => `<button type="button" class="rubro" data-act="tile" data-k="${k}" aria-pressed="${k === S.rubro}">${img(r.img, "")}<span class="rubro__n">${r.n}</span></button>`).join("");
    $("#f-zona").innerHTML = zonaOpts(S.rubro); $("#f-zona").value = S.zona;
    $("#f-dia").innerHTML = Array.from({ length: 7 }, (_, i) => `<option value="${i}">${dayFull(i)}</option>`).join(""); $("#f-dia").value = S.dia;
    $("#f-franja").innerHTML = franjaOpts(S.rubro); $("#f-franja").value = S.franja;
  }
  // Libres ahora + lugares, con switch de categoría
  function renderDestacados() {
    const k = S.hs, R = RUBROS[k];
    $("#hs-switch").innerHTML = Object.entries(RUBROS).map(([key, r]) => `<button type="button" class="pill" data-act="hs" data-k="${key}" aria-pressed="${key === k}">${r.n}</button>`).join("");
    const vs = VENUES.filter((v) => v.rubro === k), cand = [];
    for (let d = 0; d < 3 && cand.length < 10; d++) vs.forEach((v) => { const s = slotsFor(v, d).find((x) => x.libres.length); if (s && !cand.some((c) => c.v === v)) cand.push({ v, s, d }); });
    cand.sort((a, b) => a.d - b.d || a.s.start - b.s.start);
    $("#rail-now").innerHTML = cand.map(slotCard).join("") || `<p style="color:var(--ink-500)">Por ahora no quedan turnos de ${R.n.toLowerCase()}. Probá con otro día en el buscador.</p>`;
    $("#dest-t").textContent = `${R.n}: para reservar hoy`;
    $("#grid-dest").innerHTML = vs.map(cardV).join("");
    revelar($("#page-home"));
  }
  function renderHome() { renderBuscador(); renderDestacados(); }
  const franjasHTML = (rubro) => btnx("franja-h", 'data-k=""', S.franja === "", "Todo el día") + franjasDe(rubro).map((f) => btnx("franja-h", `data-k="${f}"`, S.franja === f, FRANJAS[f])).join("");
  const extraHTML = () => S.rubro === "padel" ? btnx("techada-h", "", S.techada, "Solo techadas")
    : S.rubro === "barberia" ? btnx("svc-h", 'data-k=""', S.svc === "", "Cualquier servicio") + Object.entries(SVCS).map(([k, n]) => btnx("svc-h", `data-k="${k}"`, S.svc === k, n)).join("") : "";
  const precioCard = (v) => { const sv = v.svcs.find((s) => s.id === S.svc); return sv ? Math.min(...Object.values(sv.p)) : minPrecio(v); };
  const slotCard = ({ v, s, d }) => {
    const di = dayInfo(d), sv = v.svcs.find((x) => x.id === S.svc) || v.svcs[0];
    return `<button type="button" class="now" data-act="open-slot" data-v="${v.id}" data-dia="${d}" data-t="${s.t}">
      <span class="eyebrow">${RUBROS[v.rubro].n}</span><span class="now__time">${s.t}<small>${d === 0 ? "hoy" : d === 1 ? "mañana" : DOW3[di.dow]}</small></span>
      <span class="now__name">${esc(v.name)}</span><span class="vcard__z">${ZONAS[v.zona]}</span>
      <span class="now__meta"><span><span class="dot"></span>${quedan(s, v)}</span><b class="mono" style="font-weight:500">${money(precioDe(sv, di, s.start))}</b></span></button>`;
  };

  // ---------- Resultados: lugares con preview de horarios ----------
  function renderResultados() { listaResultados(); revelar($("#r-list")); }
  function listaResultados() {
    const R = RUBROS[S.rubro], vs0 = VENUES.filter((v) => v.rubro === S.rubro);
    $("#r-rubros").innerHTML = Object.entries(RUBROS).map(([k, r]) => `<button type="button" class="pill" data-act="tile" data-k="${k}" aria-pressed="${k === S.rubro}">${r.n}</button>`).join("")
      + (extraHTML() ? `<span class="sep" aria-hidden="true"></span>${extraHTML().replace(/chipx/g, "pill")}` : "");
    $("#r-dias").innerHTML = Array.from({ length: 7 }, (_, i) => { const d = dayInfo(i); return `<button type="button" class="day${i === S.dia ? " is-on" : ""}" data-act="dia-h" data-i="${i}" aria-pressed="${i === S.dia}"><span>${dayShort(i)}</span><b>${d.d}</b></button>`; }).join("");
    $("#r-franjas").innerHTML = franjasHTML(S.rubro).replace(/chipx/g, "pill");
    const zs = $("#r-zona"); zs.innerHTML = zonaOpts(S.rubro); zs.value = S.zona;

    const lista = vs0.filter(matchV).map((v) => ({ v, sl: libresF(v, S.dia) })).sort((a, b) => b.sl.length - a.sl.length);
    const con = lista.filter((x) => x.sl.length).length;
    $("#r-t").textContent = `Turnos de ${R.n.toLowerCase()}${S.zona ? " en " + ZONAS[S.zona] : ""}`;
    $("#r-s").textContent = `${dayFull(S.dia)}${S.franja ? " · " + FRANJAS[S.franja].toLowerCase() : ""} · ${con} ${con === 1 ? "lugar con turnos libres" : "lugares con turnos libres"}`;
    const box = $("#r-list");
    if (!lista.length) { box.innerHTML = `<div class="empty"><h3>No hay lugares con esos filtros</h3><p>Probá con otra zona o quitá los filtros.</p><button type="button" class="btn btn--ink" data-act="reset-f">Quitar filtros</button></div>`; return; }
    if (!con) {
      let sig = -1;
      for (let d = S.dia + 1; d < 7 && sig < 0; d++) if (lista.some((x) => libresF(x.v, d).length)) sig = d;
      box.innerHTML = `<div class="empty"><h3>No quedan turnos ${S.franja ? "en esa franja" : "ese día"}</h3><p>${sig >= 0 ? `El próximo día con lugar es ${dayFull(sig).toLowerCase()}.` : "Probá con otra franja o zona."}</p>${sig >= 0 ? `<button type="button" class="btn btn--primary" data-act="dia-h" data-i="${sig}">Ver ${dayFull(sig).toLowerCase()}</button>` : `<button type="button" class="btn btn--ink" data-act="reset-f">Quitar filtros</button>`}</div>`;
      return;
    }
    box.innerHTML = lista.map(({ v, sl }) => `<article class="rcard${sl.length ? "" : " is-empty"}"><button type="button" class="rcard__ph" data-act="ficha" data-v="${v.id}" data-dia="${S.dia}" aria-label="Ver ${esc(v.name)}">${img(v.fotos[0], "", 'loading="lazy"')}<span class="tag">${R.n}</span></button>
        <div class="rcard__b"><div class="rcard__top"><div><h3>${esc(v.name)}</h3><p>${ZONAS[v.zona]} · ${v.units.length} ${R.uns}</p></div><div class="rcard__price"><small>desde</small>${money(precioCard(v))}</div></div>
        ${sl.length ? `<div class="qslots">${sl.slice(0, 6).map((s) => `<button type="button" class="qslot" data-act="open-slot" data-v="${v.id}" data-dia="${S.dia}" data-t="${s.t}">${s.t}<small class="${s.libres.length === 1 ? "last" : ""}">${quedan(s, v)}</small></button>`).join("")}</div>` : `<p style="color:var(--ink-500);font-size:14px"><span class="dot dot--off"></span>Sin turnos libres para este filtro</p>`}
        <div class="rcard__foot"><button type="button" class="link" data-act="ficha" data-v="${v.id}" data-dia="${S.dia}">${sl.length > 6 ? `Ver los ${sl.length} horarios` : "Ver el lugar"}</button></div></div></article>`).join("");
  }
  function elegirRubro(k) {
    if (S.rubro !== k) { S.rubro = k; S.techada = false; S.svc = ""; S.franja = ""; if (S.zona && !VENUES.some((v) => v.rubro === k && v.zona === S.zona)) S.zona = ""; }
    S.page === "resultados" ? renderResultados() : renderBuscador();
  }
  const refrescar = () => (S.page === "resultados" ? renderResultados() : renderBuscador());

  // ---------- Ficha: perfil del lugar ----------
  const curSvc = () => venue(S.f.v).svcs.find((s) => s.id === S.f.svc);
  const AMI = `<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>`;
  const mapSVG = (seed) => {
    const h = hash(seed), r = (i, m) => ((h >>> (i * 4)) & 255) / 255 * m;
    const roads = [0, 1, 2, 3, 4].map((i) => `<path d="M${r(i, 200) - 40} ${r(i + 1, 240)} Q ${200 + r(i + 2, 300)} ${r(i + 3, 240)} ${660 + r(i, 40)} ${r(i + 5, 240)}" stroke="#fff" stroke-width="${8 + (i % 3) * 5}" fill="none" stroke-linecap="round"/>`).join("");
    const cross = [0, 1, 2, 3].map((i) => `<path d="M${80 + i * 150 + r(i, 70)} -10 L ${120 + i * 150 + r(i + 2, 90)} 250" stroke="#fff" stroke-width="${6 + (i % 2) * 4}" fill="none"/>`).join("");
    return `<svg viewBox="0 0 640 240" role="img" aria-label="Zona aproximada del lugar"><rect width="640" height="240" fill="#e9eef0"/><rect x="${40 + r(7, 300)}" y="${20 + r(8, 80)}" width="150" height="80" rx="30" fill="#d3e8e1"/><rect x="${360 + r(9, 100)}" y="${130 + r(6, 40)}" width="120" height="70" rx="26" fill="#d3e8e1"/>${roads}${cross}<circle cx="320" cy="122" r="58" fill="#e4572e" fill-opacity=".16" stroke="#e4572e" stroke-opacity=".5"/><circle cx="320" cy="122" r="11" fill="#e4572e" stroke="#fff" stroke-width="4"/></svg>`;
  };
  const horarios = (v) => v.bloques.map(([a, b]) => `${a} a ${fmt(toMin(b))}`).join(" y ");
  function renderFicha() {
    const v = venue(S.f.v), R = RUBROS[v.rubro], sv0 = v.svcs[0], fotos = v.fotos.slice(0, 3);
    const filas = v.rubro === "barberia"
      ? v.svcs.map((s) => `<tr><th scope="row">${s.n}<small>${s.min} min</small></th><td>${money(s.p.dia)}</td></tr>`).join("")
      : `<tr><th scope="row">Lun a vie · hasta las 20<small>seña ${money(senaDe(sv0.p.dia))}</small></th><td>${money(sv0.p.dia)}</td></tr><tr><th scope="row">Lun a vie · desde las 20<small>seña ${money(senaDe(sv0.p.noche))}</small></th><td>${money(sv0.p.noche)}</td></tr><tr><th scope="row">Sáb y dom<small>seña ${money(senaDe(sv0.p.finde))}</small></th><td>${money(sv0.p.finde)}</td></tr>`;
    $("#ficha-root").innerHTML = `
      <a class="back" href="#" data-act="back"><svg class="icon"><use href="#i-back"/></svg>Volver</a>
      <div class="ficha">
        <div class="ficha__head">
          <p class="eyebrow">${R.n}</p><h1>${esc(v.name)}</h1>
          <div class="facts"><span><svg class="icon"><use href="#i-pin"/></svg>${ZONAS[v.zona]}</span><span><svg class="icon"><use href="#i-clock"/></svg>Turnos de ${v.dur} min</span><span><svg class="icon"><use href="#i-shield"/></svg>Seña ${Math.round(SENA * 100)} %</span></div>
          <div class="gal${fotos.length < 2 ? " is-solo" : fotos.length === 2 ? " is-duo" : ""}">${fotos.map((k) => `<figure>${img(k, "")}</figure>`).join("")}</div>
        </div>
        <aside class="ficha__side"><div class="book" id="book"></div></aside>
        <div class="ficha__rest">
          <div class="blk"><h2>Cupos de la semana</h2><div class="cupos" id="cupos"></div><p class="note">Tocá un día para ver sus horarios. Cada horario tiene su propio cupo.</p></div>
          <div class="blk"><h2>Sobre el lugar</h2><p>${esc(v.desc)} ${v.units.length} ${R.uns}: ${v.units.map(esc).join(", ")}.</p></div>
          <div class="blk"><h2>Lo que ofrece</h2><ul class="ame">${v.ame.map((k) => `<li>${AMI}${AM[k]}</li>`).join("")}</ul></div>
          <div class="blk"><h2>${v.rubro === "barberia" ? "Servicios y precios" : "Precios por horario"}</h2><table class="ptable"><caption class="sr-only">Precios</caption><tbody>${filas}</tbody></table></div>
          <div class="blk"><h2>Dónde queda</h2><div class="mapbox">${mapSVG(v.id)}<div class="mapbox__t"><b>${ZONAS[v.zona]}</b>Valle de Uco, Mendoza</div></div><p class="mapnote">Ubicación aproximada. La dirección exacta te llega al confirmar el turno.</p></div>
          <div class="blk"><h2>Información adicional</h2><dl class="dl">
            <div><dt>Horarios</dt><dd>Todos los días · ${horarios(v)}</dd></div>
            <div><dt>Llegada</dt><dd>Llegá 10 minutos antes para empezar a horario.</dd></div>
            <div><dt>Pagos</dt><dd>Seña del ${Math.round(SENA * 100)} % online con Mercado Pago. El resto lo abonás en el lugar.</dd></div>
            <div><dt>Cancelación</dt><dd>Hasta ${v.cancel} h antes, la seña se devuelve. Después, queda para el negocio.</dd></div>
            <div><dt>Cómo reservás</dt><dd>Elegís día y horario, pagás la seña y el turno queda en Mis turnos. Te avisamos por WhatsApp.</dd></div></dl>
            <span class="demo">Negocio de ejemplo · demo</span></div>
        </div>
      </div>
      <div class="mbar" id="mbar"></div>`;
    renderBook();
  }
  function renderCupos() {
    const v = venue(S.f.v);
    $("#cupos").innerHTML = Array.from({ length: 7 }, (_, i) => {
      const sl = slotsFor(v, i), n = sl.filter((s) => s.libres.length).length, tot = sl.length || 1, d = dayInfo(i);
      return `<button type="button" class="cupo${i === S.f.dia ? " is-on" : ""}${n ? "" : " is-zero"}" data-act="f-dia" data-i="${i}" aria-pressed="${i === S.f.dia}"><span>${i === 0 ? "Hoy" : i === 1 ? "Mañ" : DOW3[d.dow]}</span><b>${d.d}</b><i style="--p:${Math.round((n / tot) * 100)}%"></i><small>${n ? `${n} libres` : "completo"}</small></button>`;
    }).join("");
  }
  function renderBook() {
    const v = venue(S.f.v), f = S.f, R = RUBROS[v.rubro], di = dayInfo(f.dia), svc = curSvc();
    const sl = slotsFor(v, f.dia), sel = sl.find((s) => s.t === f.t && s.libres.length);
    if (!sel) f.t = null;
    const grupos = ["manana", "tarde", "noche"].map((g) => [g, sl.filter((s) => s.franja === g)]).filter(([, a]) => a.length);
    const precio = sel ? precioDe(svc, di, sel.start) : null, sena = precio ? senaDe(precio) : 0;
    if (sel && f.unit !== "any" && !sel.libres.includes(f.unit)) f.unit = "any";
    const unitTxt = sel ? (f.unit === "any" ? sel.libres[0] : f.unit) : "";
    $("#book").innerHTML = `
      <div class="book__price"><b>${money(precio ?? minPrecio(v))}</b><span>${precio ? "el turno" : "desde, por turno"}</span></div>
      <span class="eyebrow book__l" style="margin-top:0">Día</span>
      <div class="days" role="group" aria-label="Día">${Array.from({ length: 7 }, (_, i) => { const d = dayInfo(i); return `<button type="button" class="day${i === f.dia ? " is-on" : ""}" data-act="f-dia" data-i="${i}" aria-pressed="${i === f.dia}"><span>${dayShort(i)}</span><b>${d.d}</b></button>`; }).join("")}</div>
      ${v.svcs.length > 1 ? `<label class="book__l eyebrow" for="f-svc" style="margin-bottom:6px">Servicio</label><select class="sel" id="f-svc">${v.svcs.map((s) => `<option value="${s.id}"${s.id === f.svc ? " selected" : ""}>${s.n} · ${s.min} min · ${money(precioDe(s, di, 18 * 60))}</option>`).join("")}</select>` : ""}
      <span class="eyebrow book__l">Horario</span>
      ${sl.length ? grupos.map(([g, a]) => `${grupos.length > 1 ? `<p class="slots__g">${FRANJAS[g]}</p>` : ""}<div class="slots">${a.map((s) => `<button type="button" class="slot${s.t === f.t ? " is-on" : ""}" data-act="f-slot" data-t="${s.t}" ${s.libres.length ? "" : "disabled"} aria-pressed="${s.t === f.t}"><b>${s.t}</b><small class="${s.libres.length === 1 ? "last" : ""}">${s.libres.length ? quedan(s, v) : "Completo"}</small></button>`).join("")}</div>`).join("") : `<p class="book__empty">Ya no quedan turnos para ${dayFull(f.dia).toLowerCase()}. Probá otro día.</p>`}
      ${sel && sel.libres.length > 1 ? `<span class="eyebrow book__l">${R.un}</span><div class="units" role="group" aria-label="${R.un}"><button type="button" class="unit${f.unit === "any" ? " is-on" : ""}" data-act="f-unit" data-u="any">Cualquiera</button>${sel.libres.map((u) => `<button type="button" class="unit${f.unit === u ? " is-on" : ""}" data-act="f-unit" data-u="${esc(u)}">${esc(u)}</button>`).join("")}</div>` : ""}
      ${sel ? `<div class="sum"><div><span>${esc(unitTxt)} · ${keyLabel(di.key)} · ${sel.t}–${sel.end}</span></div><div><span>Seña ahora (${Math.round(SENA * 100)} %)</span><b>${money(sena)}</b></div><div><span>En el lugar</span><b>${money(precio - sena)}</b></div></div>` : ""}
      <button type="button" class="btn btn--primary btn--lg btn--block" data-act="reservar" ${sel ? "" : "disabled"}>${sel ? "Reservar turno" : "Elegí un horario"}</button>
      <p class="book__hint">Todavía no se cobra nada.</p>`;
    $("#mbar").innerHTML = sel
      ? `<div class="mbar__t"><b>${money(sena)} <span style="display:inline;font-weight:400">de seña</span></b><span>${keyLabel(di.key)} · ${sel.t} · ${esc(unitTxt)}</span></div><button type="button" class="btn btn--primary" data-act="reservar">Reservar</button>`
      : `<div class="mbar__t"><b>Desde ${money(minPrecio(v))}</b><span>Elegí día y horario</span></div><button type="button" class="btn btn--primary" data-act="scroll-book">Ver horarios</button>`;
    renderCupos();
  }
  function reservar() {
    const v = venue(S.f.v), f = S.f, di = dayInfo(f.dia), svc = curSvc();
    const s = slotsFor(v, f.dia).find((x) => x.t === f.t);
    if (!s || !s.libres.length) { toast("Ese horario se acaba de ocupar"); return renderBook(); }
    const unit = f.unit !== "any" && s.libres.includes(f.unit) ? f.unit : s.libres[0];
    const precio = precioDe(svc, di, s.start), sena = senaDe(precio);
    S.carrito.push({ id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), vid: v.id, svc: svc.id, key: di.key, t: s.t, end: s.end, unit, precio, sena, cancel: v.cancel });
    guardar();
    go("carrito");
  }

  // ---------- Carrito ----------
  const itemHTML = (it, acciones) => {
    const v = venue(it.vid), R = RUBROS[v.rubro], svc = v.svcs.find((s) => s.id === it.svc) || v.svcs[0];
    return `<li class="item"><div class="item__ph">${img(v.fotos[0], "")}</div><div>
      <h3>${esc(v.name)}</h3><p>${R.n}${v.rubro === "barberia" ? " · " + svc.n : ""} · ${esc(it.unit)}</p>
      <div class="item__row"><span class="item__when">${keyLabel(it.key)} · ${it.t}–${it.end}</span><span class="item__p"><b>${money(it.precio)}</b>seña ${money(it.sena)}</span></div>
      ${acciones}</div></li>`;
  };
  function renderCarrito() {
    limpiar();
    const root = $("#carrito-root"), c = S.carrito;
    if (!c.length) { root.innerHTML = `<h1>Carrito</h1><p class="sub">Todavía no elegiste ningún turno.</p><div class="empty"><h3>Tu carrito está vacío</h3><p>Buscá un turno y agregalo para pagar la seña.</p><button type="button" class="btn btn--primary" data-go="home" data-focus="pick">Buscar turnos</button></div>`; return; }
    const total = c.reduce((a, i) => a + i.precio, 0), sena = c.reduce((a, i) => a + i.sena, 0), minCancel = Math.max(...c.map((i) => i.cancel));
    const u = store.get("contacto", { nombre: "", wa: "" });
    root.innerHTML = `<h1>Carrito</h1><p class="sub">Revisá tus turnos antes de pagar la seña.</p>
      <div class="two"><div>
        <ul class="items">${c.map((it) => itemHTML(it, `<button type="button" class="item__x" data-act="rm" data-id="${it.id}" style="margin-top:8px">Quitar</button>`)).join("")}</ul>
        <div class="panel"><h2>Tus datos</h2><div class="fields">
          <label class="field"><span>Nombre</span><input id="c-nombre" autocomplete="name" value="${esc(u.nombre)}" aria-describedby="c-nombre-e" /><p class="err" id="c-nombre-e" hidden>Escribí tu nombre.</p></label>
          <label class="field"><span>WhatsApp</span><input id="c-wa" type="tel" inputmode="tel" autocomplete="tel" placeholder="261 555 1234" value="${esc(u.wa)}" aria-describedby="c-wa-e" /><p class="err" id="c-wa-e" hidden>Escribí un número de WhatsApp válido.</p></label>
        </div><p class="note">Te mandamos la confirmación y el recordatorio por WhatsApp.</p></div>
      </div>
      <aside><div class="panel panel--sum"><h2>Resumen</h2><div class="pay">
        <div><span>${c.length} ${c.length === 1 ? "turno" : "turnos"}</span><b>${money(total)}</b></div>
        <div><span>En el lugar</span><b>${money(total - sena)}</b></div>
        <div class="big"><span>Seña ahora</span><b>${money(sena)}</b></div></div>
        <button type="button" class="btn btn--primary btn--lg btn--block" data-act="pay" style="margin-top:18px"><span class="mp">Pagar seña con Mercado Pago</span></button>
        <p class="note note--ok"><svg class="icon"><use href="#i-shield"/></svg><span>Podés cancelar hasta ${minCancel} h antes y la seña se devuelve (según cada lugar).</span></p>
        <p class="note">Demo: los negocios son de ejemplo y no se cobra nada. En la versión real, acá se abre el pago de Mercado Pago.</p>
        <button type="button" class="link" data-go="home" data-focus="pick" style="margin-top:12px;font-size:14px">Seguir buscando</button></div></aside></div>`;
  }
  const valNombre = () => { const f = $("#c-nombre"), bad = f.value.trim().length < 2; f.classList.toggle("is-invalid", bad); $("#c-nombre-e").hidden = !bad; return bad; };
  const valWa = () => { const f = $("#c-wa"), bad = f.value.replace(/\D/g, "").length < 8; f.classList.toggle("is-invalid", bad); $("#c-wa-e").hidden = !bad; return bad; };
  function pagar() {
    const malos = [valNombre(), valWa()].filter(Boolean).length;
    if (malos) { (valNombre() ? $("#c-nombre") : $("#c-wa")).focus(); return; }
    const contacto = { nombre: $("#c-nombre").value.trim(), wa: $("#c-wa").value.trim() };
    store.set("contacto", contacto);
    const ov = document.createElement("div"); ov.className = "mpov"; ov.setAttribute("role", "alertdialog"); ov.setAttribute("aria-live", "polite");
    ov.innerHTML = `<div class="mpov__in"><div class="spin"></div><h2>Te llevamos a Mercado Pago</h2><p>Un momento, estamos preparando el pago de tu seña.</p></div>`;
    document.body.appendChild(ov);
    const dur = reduce ? 300 : 1500;
    setTimeout(() => {
      ov.innerHTML = `<div class="mpov__in"><div class="okc"><svg class="icon"><use href="#i-check"/></svg></div><h2>¡Turno confirmado!</h2><p>Es una demo: no se cobró nada.</p></div>`;
      setTimeout(() => {
        const nuevos = S.carrito.map((it) => ({ ...it, code: "BK-" + hash(it.id + Date.now()).toString(36).toUpperCase().slice(0, 4), nombre: contacto.nombre, pagado: true }));
        S.turnos = S.turnos.concat(nuevos); S.carrito = []; guardar();
        ov.remove(); go("turnos", { nuevos: nuevos.map((n) => n.id) }); toast("Turno confirmado (demo, sin cobro).");
      }, reduce ? 300 : 1200);
    }, dur);
  }

  // ---------- Mis turnos ----------
  const cuando = (it) => new Date(`${it.key}T${it.t}:00-03:00`);
  function renderTurnos(st = {}) {
    const root = $("#turnos-root"), lista = S.turnos.slice().sort((a, b) => cuando(a) - cuando(b));
    if (!lista.length) { root.innerHTML = `<h1>Mis turnos</h1><p class="sub">Acá vas a ver tus turnos confirmados.</p><div class="empty"><h3>Todavía no tenés turnos</h3><p>Reservá el primero en segundos.</p><button type="button" class="btn btn--primary" data-go="home" data-focus="pick">Buscar turnos</button></div>`; return; }
    const ahora = Date.now();
    root.innerHTML = `<h1>Mis turnos</h1><p class="sub">Tus turnos confirmados, con la seña ya paga.</p>` + lista.map((it) => {
      const v = venue(it.vid), R = RUBROS[v.rubro], svc = v.svcs.find((s) => s.id === it.svc) || v.svcs[0], pasado = cuando(it).getTime() + 3600e3 < ahora;
      const txt = encodeURIComponent(`Turno en ${v.name}: ${keyLabel(it.key)} ${it.t} hs (${it.unit}). Código ${it.code}.`);
      return `<article class="tcard${st.nuevos && st.nuevos.includes(it.id) ? " is-new" : ""}"><div class="tcard__h"><span class="code">${it.code}</span><span class="status"${pasado ? ' style="color:var(--ink-500);background:var(--ink-100)"' : ""}>${pasado ? "Finalizado" : "Confirmado"}</span></div>
        <div class="tcard__b"><div><h3>${esc(v.name)}</h3><div class="tcard__when">${keyLabel(it.key)} · ${it.t}–${it.end}</div><p>${R.n}${v.rubro === "barberia" ? " · " + svc.n : ""} · ${esc(it.unit)} · ${ZONAS[v.zona]}</p></div>
        <div class="tcard__act"><a class="btn btn--line btn--s" href="https://wa.me/?text=${txt}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-wa"/></svg>Compartir</a>${pasado ? "" : `<button type="button" class="btn btn--line btn--s" data-act="cancel" data-id="${it.id}">Cancelar</button>`}</div></div>
        <div class="tcard__money"><span>Seña pagada <b>${money(it.sena)}</b></span><span>A pagar en el lugar <b>${money(it.precio - it.sena)}</b></span></div></article>`;
    }).join("");
  }
  function cancelar(id) {
    const it = S.turnos.find((x) => x.id === id); if (!it) return;
    const horas = (cuando(it) - Date.now()) / 3600e3, devuelve = horas > it.cancel;
    const dlg = $("#dlg");
    $("#dlg-t").textContent = "¿Cancelar este turno?";
    $("#dlg-p").textContent = devuelve ? `Cancelás con más de ${it.cancel} h de anticipación: la seña de ${money(it.sena)} se devuelve y el turno se libera.` : `Faltan menos de ${it.cancel} h: la seña de ${money(it.sena)} queda para el negocio y el turno se libera.`;
    $("#dlg-si").onclick = () => { S.turnos = S.turnos.filter((x) => x.id !== id); guardar(); dlg.close(); renderTurnos(); toast(devuelve ? "Turno cancelado. La seña vuelve." : "Turno cancelado."); };
    $("#dlg-no").onclick = () => dlg.close();
    dlg.showModal();
  }

  // ---------- Detalles ----------
  function badges() {
    const upcoming = S.turnos.filter((t) => cuando(t).getTime() + 3600e3 >= Date.now()).length, nc = S.carrito.length;
    $$("[data-count]").forEach((b) => {
      const n = b.dataset.count === "carrito" ? nc : upcoming;
      if (b.textContent !== String(n) && n > 0) { b.classList.remove("is-sube"); void b.offsetWidth; b.classList.add("is-sube"); }
      b.textContent = n; if (b.closest(".tabbar")) b.hidden = !n;
    });
    $("#t-turnos").hidden = !upcoming; $("#t-carrito").hidden = !nc; // el header solo muestra lo que tiene algo
  }
  let tt;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("is-on"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("is-on"), 2600); }
  const scrollTo = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); };

  // ---------- Eventos ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act],[data-go],[data-scroll],[data-copy],[data-step]"); if (!t) return;
    const a = t.dataset.act, d = t.dataset;
    if ((t.tagName === "A" && t.getAttribute("href") === "#") || d.scroll) e.preventDefault();
    if (a) {
      switch (a) {
        case "tile": elegirRubro(d.k); break;
        case "hs": S.hs = d.k; renderDestacados(); break;
        case "dia-h": S.dia = +d.i; refrescar(); break;
        case "franja-h": S.franja = d.k; refrescar(); break;
        case "zona-h": S.zona = d.k; refrescar(); break;
        case "techada-h": S.techada = !S.techada; refrescar(); break;
        case "svc-h": S.svc = d.k; refrescar(); break;
        case "reset-f": S.zona = ""; S.franja = ""; S.techada = false; S.svc = ""; S.dia = 0; refrescar(); break;
        case "ficha": go("ficha", { v: d.v, dia: d.dia ? +d.dia : 0 }); break;
        case "open-slot": go("ficha", { v: d.v, dia: +d.dia, t: d.t }); break;
        case "back": e.preventDefault(); if (S.nav > 0) history.back(); else go("home", { restore: true }); break;
        case "f-dia": S.f.dia = +d.i; renderBook(); break;
        case "f-slot": S.f.t = d.t; S.f.unit = "any"; renderBook(); break;
        case "f-unit": S.f.unit = d.u; renderBook(); break;
        case "reservar": reservar(); break;
        case "scroll-book": $("#book").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); break;
        case "rm": S.carrito = S.carrito.filter((x) => x.id !== d.id); guardar(); renderCarrito(); toast("Turno quitado del carrito"); break;
        case "pay": pagar(); break;
        case "cancel": cancelar(d.id); break;
      }
      return;
    }
    if (d.go) {
      go(d.go);
      if (d.focus === "pick") requestAnimationFrame(() => scrollTo("pick"));
      if (d.scroll) requestAnimationFrame(() => scrollTo(d.scroll));
      return;
    }
    if (d.scroll) { scrollTo(d.scroll); return; }
    if (d.copy) copiar(t);
    if (d.step) { horas = Math.min(48, Math.max(1, horas + +d.step)); nota(); }
  });
  document.addEventListener("submit", (e) => { if (e.target.id === "finder") { e.preventDefault(); go("resultados"); } });
  document.addEventListener("change", (e) => { if (e.target.id === "r-zona") { S.zona = e.target.value; renderResultados(); }
    if (e.target.id === "f-zona") S.zona = e.target.value;
    if (e.target.id === "f-dia") S.dia = +e.target.value;
    if (e.target.id === "f-franja") S.franja = e.target.value; if (e.target.id === "f-svc") { S.f.svc = e.target.value; renderBook(); } });
  document.addEventListener("input", (e) => { if (e.target.id === "c-nombre" && e.target.classList.contains("is-invalid")) valNombre(); if (e.target.id === "c-wa" && e.target.classList.contains("is-invalid")) valWa(); });

  // ---------- Sumá tu negocio: reglas, copiar, alta ----------
  let horas = 6, devuelve = true;
  const nota = () => { $("#hrs").textContent = `${horas} h`; $("#rule-note").textContent = devuelve ? `Si cancela con más de ${horas} h, la seña vuelve sola.` : "Si cancela, la seña queda para vos y el turno se libera."; };
  const sw = $(".switch");
  if (sw) sw.addEventListener("click", () => { devuelve = !devuelve; sw.setAttribute("aria-checked", String(devuelve)); nota(); });
  async function copiar(b) {
    const txt = b.dataset.copy, orig = b.textContent;
    try { await navigator.clipboard.writeText(txt); b.textContent = "Copiado"; }
    catch { const r = document.createRange(), t = b.previousElementSibling; if (t) { r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } b.textContent = "Seleccionado"; }
    setTimeout(() => (b.textContent = orig), 1600);
  }
  // Primer paso del registro: sigue en el panel (admin.html) con los datos cargados
  const form = $("#form-sumate");
  if (form) {
    const msg = $(".form__msg", form);
    const marcar = (f) => { const bad = !f.value.trim(); f.classList.toggle("is-invalid", bad); f.setAttribute("aria-invalid", String(bad)); $("#" + f.id + "-err").hidden = !bad; return bad; };
    $$("[required]", form).forEach((f) => f.addEventListener("input", () => { if (f.getAttribute("aria-invalid") === "true") marcar(f); }));
    form.addEventListener("submit", (e) => {
      const malos = $$("[required]", form).filter(marcar);
      if (malos.length) { e.preventDefault(); msg.textContent = malos.length === 1 ? "Falta completar un campo." : `Faltan completar ${malos.length} campos.`; msg.className = "form__msg err"; malos[0].focus(); return; }
      msg.textContent = ""; msg.className = "form__msg";
      try { sessionStorage.setItem("bookea:alta", JSON.stringify(Object.fromEntries($$("[required]", form).map((f) => [f.name, f.value.trim()])))); } catch {}
    });
  }

  // ---------- Arranque ----------
  // Pantalla de carga: se ve al menos 1,5 s (0,6 s con "reducir movimiento"), espera la carga y tiene un tope de 4 s
  const splash = $(".splash");
  const arrancar = () => {
    if (listoMov) return;
    listoMov = true;
    document.documentElement.classList.add("is-ready");
    if (splash) { splash.classList.add("is-out"); setTimeout(() => splash.remove(), 1000); }
    pendientes.splice(0).forEach(revelar);
  };
  if (splash) {
    const minimo = new Promise((ok) => setTimeout(ok, Math.max(0, (reduce ? 600 : 1500) - performance.now())));
    const cargada = new Promise((ok) => (document.readyState === "complete" ? ok() : addEventListener("load", ok, { once: true })));
    Promise.all([minimo, cargada]).then(arrancar);
    setTimeout(arrancar, Math.max(0, 4000 - performance.now()));
  } else arrancar();
  $("#year").textContent = new Date().getFullYear();
  badges();
  // En pantallas táctiles, que :active (el apretado de botones y tarjetas) funcione también en iPhone
  document.addEventListener("touchstart", () => {}, { passive: true });
  // Links que llegan con datos: resultados de un rubro, o una sección de la parte para negocios
  const inicial = (() => {
    const q = new URLSearchParams(location.search), h = location.hash.slice(1);
    if (RUBROS[q.get("rubro")]) {
      S.rubro = S.hs = q.get("rubro");
      if (ZONAS[q.get("zona")]) S.zona = q.get("zona");
      const d = parseInt(q.get("dia"), 10); if (d >= 0 && d < 7) S.dia = d;
      if (q.get("franja") && FRANJAS[q.get("franja")]) S.franja = q.get("franja");
      return { page: "resultados" };
    }
    if (["sumate", "como-funciona", "funciones", "preguntas"].includes(h)) return { page: "negocios", ir: h };
    if (h === "pick" || h === "reservar") return { page: "home", ir: "pick" };
    return { page: "home" };
  })();
  try { history.scrollRestoration = "manual"; history.replaceState({ page: inicial.page }, "", location.pathname); } catch {}
  show({ page: inicial.page });
  if (inicial.ir) requestAnimationFrame(() => scrollTo(inicial.ir));
  // Un link con # a la misma página (por ejemplo bookea.ar/#sumate con el sitio ya abierto) no recarga:
  // se resuelve acá, reemplazando la entrada del historial para que "atrás" no quede en el mismo lugar
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    const page = ["sumate", "como-funciona", "funciones", "preguntas"].includes(h) ? "negocios" : h === "pick" || h === "reservar" ? "home" : "";
    if (!page) return;
    go(page, {}, true);
    requestAnimationFrame(() => scrollTo(h === "reservar" ? "pick" : h));
  });
})();
