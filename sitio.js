// Bookea — frente público: buscar → resultados → ficha del lugar → pagar la seña (el turno queda guardado 10 minutos) → Mis turnos,
// y la parte para negocios ("Sumá tu negocio" sigue en admin.html?alta=1, el registro del panel).
// Sin frameworks. Los lugares de la lista son ejemplos; los negocios de verdad (de la base) se abren con su link
// (bookea.ar/su-link). El pago con Mercado Pago todavía está simulado: no se cobra nada.
// Links que siguen andando: index.html?rubro=padel&zona=&dia=0&franja= (y reservar.html, que redirige acá)
// abre los resultados; #sumate, #como-funciona, #funciones y #preguntas abren la parte para negocios.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // espacio que no se corta (\u00a0): el "$" nunca queda solo al final de un renglón
  const money = (n) => "$\u00a0" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Movimiento: tarjetas y secciones suben a su lugar al aparecer (clase .rise, en sitio.css) ----------
  // Espera a que suba la pantalla de carga; con "reducir movimiento" no hace nada.
  const SUBEN = [".sec__head", ".now", ".vcard", ".rcard", ".ex", ".cell", ".join", ".faq h2", ".faq details", ".blk", ".chk__turno", ".pasos li", ".okban", ".tcard", ".panel", ".band", ".foot__top > *", ".empty"].join(", ");
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
  // ---------- Secciones: Deportes y Servicios (pedido del dueño, 19/11) ----------
  // Dos pestañas arriba del buscador que cambian toda la página: rubros, fotos, "Libres ahora", lugares y resultados.
  const SECCIONES = {
    deportes: { n: "Deportes", rubros: ["padel", "futbol", "tenis"], collage: ["canchas", "tenis2", "futbolnoche"] },
    servicios: { n: "Servicios", rubros: ["barberia"], collage: ["barbero", "peine", "barberia"] },
  };
  const secDe = (rubro) => (RUBROS[rubro] && RUBROS[rubro].sec) || Object.keys(SECCIONES).find((k) => SECCIONES[k].rubros.includes(rubro)) || "deportes";
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
  // SOLO_LINK: negocios de verdad que se abren con su link (bookea.ar/su-link) pero todavía no van en la lista
  const SOLO_LINK = [];
  const venue = (id) => VENUES.find((v) => v.id === id) || SOLO_LINK.find((v) => v.id === id);
  const minPrecio = (v) => Math.min(...v.svcs.flatMap((s) => Object.values(s.p)));

  // ---------- Negocios de verdad: los de la base, con lo que cargaron en Mi negocio ----------
  // Llegan de cuenta.js (lugares_publicos de supabase/esquema.sql) con id "n-" + su link. Los que ya cobran la seña con
  // Mercado Pago van a la lista junto a los de ejemplo (si su rubro es uno del buscador); el de un link se abre aunque
  // todavía no esté en la lista. Sus horarios, precios, seña y cancelación son los de su panel, y los horarios ocupados
  // son los de su agenda (la base los manda sin decir de quién son).
  const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const RUBRO_BASE = (t) => { const x = sinTildes(t); return /padel/.test(x) ? "padel" : /futbol|\bf5\b/.test(x) ? "futbol" : /tenis/.test(x) ? "tenis" : /barber/.test(x) ? "barberia" : ""; };
  // Un rubro que no está en el buscador (por ejemplo, peluquería) se muestra con su nombre, sin sumarse al buscador
  const rubroDe = (t) => {
    const k = RUBRO_BASE(t); if (k) return k;
    const x = sinTildes(t) || "turnos", key = "x-" + x.replace(/[^a-z0-9]+/g, "-").slice(0, 24), dep = /cancha|voley|basquet|hockey|squash|golf|deport/.test(x);
    if (!RUBROS[key]) RUBROS[key] = { n: cap(String(t || "Turnos").trim()), img: dep ? "canchas" : "peine", un: dep ? "Cancha" : "Lugar", uns: dep ? "canchas" : "lugares", sec: dep ? "deportes" : "servicios" };
    return key;
  };
  // La ciudad que cargó: una de las zonas del buscador o una nueva ("Otras zonas")
  const zonaDe = (ciudad) => {
    const c = String(ciudad || "").trim(), x = sinTildes(c), k = Object.keys(ZONAS).find((z) => sinTildes(ZONAS[z]) === x);
    if (k) return k;
    const key = "z-" + (x.replace(/[^a-z0-9]+/g, "-").slice(0, 30) || "sin-ciudad");
    if (!ZONAS[key]) { ZONAS[key] = c || "Sin ciudad"; (REG["Otras zonas"] = REG["Otras zonas"] || []).push(key); }
    return key;
  };
  const MAPS = /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i; // como el panel y los mails
  const hhmm = (t) => (/^\d{1,2}:\d{2}$/.test(t || "") ? toMin(t) : null);
  const sumarDia = (key, n) => new Date(Date.parse(key + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
  // Los horarios ocupados: "cancha|fecha de la agenda|minuto"
  const ocupDe = (lista) => new Set((lista || []).map(([rec, fecha, min]) => `${rec}|${String(fecha).slice(0, 10)}|${+min}`));
  // Su página (bookea.ar/nombre): frase, historia, logo, portada, galería y redes. Las fotos, solo las de Bookea (Supabase Storage).
  const FOTO_OK = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/negocios\/[0-9a-f-]{36}\/[a-z0-9._-]+$/i;
  const fotoOk = (u) => (FOTO_OK.test(u || "") ? u : "");
  const usuario = (h) => String(h || "").replace(/[^a-z0-9._-]/gi, "").slice(0, 60);
  const paginaDeFila = (pg) => {
    pg = pg && typeof pg === "object" ? pg : {};
    return {
      frase: String(pg.frase || "").trim(), historia: String(pg.historia || "").trim(), logo: fotoOk(pg.logo), portada: fotoOk(pg.portada),
      galeria: (Array.isArray(pg.galeria) ? pg.galeria : []).map(fotoOk).filter(Boolean).slice(0, 8),
      instagram: usuario(pg.instagram), tiktok: usuario(pg.tiktok), facebook: usuario(pg.facebook), whatsapp: String(pg.whatsapp || "").trim(),
    };
  };
  const lugarDeFila = (f) => {
    const id = "n-" + f.slug, rubro = rubroDe(f.rubro), dur = Math.max(5, Math.round(+f.duracion) || 60), units = [], recIds = {};
    (f.recursos || []).forEach((r) => {
      let u = String(r.nombre || "").trim() || RUBROS[rubro].un;
      if (String(r.detalle || "").trim()) u += " · " + String(r.detalle).trim().toLowerCase();
      while (recIds[u]) u += " (2)";
      units.push(u); recIds[u] = String(r.id);
    });
    const franjas = (f.franjas || []).map((x) => ({ desde: x.desde, hasta: x.hasta, precio: Math.max(0, Math.round(+x.precio) || 0) }));
    const foto = /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(f.foto || "") ? f.foto : "";
    if (foto) IMG[id] = foto;
    const p = {}; (franjas.length ? franjas : [{ precio: 0 }]).forEach((x, i) => (p[i] = x.precio));
    return {
      id, real: true, nid: f.id, slug: f.slug, publicado: !!f.publicado, rubro, name: String(f.nombre || ""), zona: zonaDe(f.ciudad),
      fotos: foto ? [id] : [], dur, units, recIds, horario: Array.isArray(f.horario) ? f.horario : [], bloques: [],
      senaPct: Math.max(0, Math.min(100, +f.senaPct || 0)), cancel: Math.max(0, Math.round(+f.cancelarHoras) || 0), devuelve: f.devolverSena !== false,
      desc: String(f.descripcion || "").trim(), ame: [], direccion: String(f.direccion || "").trim(), ciudad: String(f.ciudad || "").trim(),
      mapa: MAPS.test(f.mapa || "") ? f.mapa : "", ocup: ocupDe(f.ocupados), pagina: paginaDeFila(f.pagina),
      svcs: [{ id: "turno", n: `Turno de ${dur} min`, min: dur, p, franjas }],
    };
  };
  // Los minutos en que empieza cada turno de un día (los de ejemplo tienen el mismo horario todos los días; los de
  // verdad, el de su panel, y un turno de las 00:30 que sigue a la noche es de ese mismo día de la agenda)
  const iniciosDe = (v, dow) => {
    const out = [];
    if (!v.real) { v.bloques.forEach(([a, b]) => { for (let t = toMin(a); t + v.dur <= toMin(b); t += v.dur) out.push(t); }); return out; }
    const h = v.horario[dow], a = h && !h.cerrado ? hhmm(h.abre) : null; let c = h ? hhmm(h.cierra) : null;
    if (a === null || c === null) return out;
    if (c <= a) c += 1440;
    for (let t = a; t + v.dur <= c; t += v.dur) out.push(t);
    return out;
  };
  // Precio: los de ejemplo, por día, noche y fin de semana; los de verdad, por sus franjas (igual que el panel y la base)
  const precioFr = (franjas, min) => {
    const m = min % 1440;
    for (const f of franjas) {
      const d = hhmm(f.desde) || 0; let h = hhmm(f.hasta) || 0; if (h <= d) h += 1440;
      const mm = m < d ? m + 1440 : m;
      if (mm >= d && mm < h) return f.precio;
    }
    return franjas.length ? franjas[franjas.length - 1].precio : 0;
  };
  const precioDe = (svc, di, start) => (svc.franjas ? precioFr(svc.franjas, start) : di.finde ? svc.p.finde : start >= 20 * 60 ? svc.p.noche : svc.p.dia);
  const senaDe = (p, v) => (v && v.real ? Math.round((p * v.senaPct) / 100 / 100) * 100 : Math.round((p * SENA) / 50) * 50);
  const pctDe = (v) => (v && v.real ? v.senaPct : Math.round(SENA * 100));
  // La regla para cancelar, como la lee el cliente
  const reglaCancelar = (devuelve, horas) => (devuelve === false ? "Si cancelás, el horario se libera, pero en este lugar la seña no se devuelve."
    : horas ? `Hasta ${horas} h antes, la seña se devuelve. Después, queda para el negocio.` : "Hasta que empiece el turno, la seña se devuelve.");
  // "Lun a vie · 18:00 a 01:00", "Dom · Cerrado" (los de verdad) o "Todos los días · 17:00 a 00:30" (los de ejemplo)
  const DIAC = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const horariosDe = (v) => {
    if (!v.real) return [["Todos los días", v.bloques.map(([a, b]) => `${a} a ${fmt(toMin(b))}`).join(" y ")]];
    const txt = (h) => (!h || h.cerrado || hhmm(h.abre) === null || hhmm(h.cierra) === null ? "Cerrado" : `${h.abre} a ${h.cierra}`), grupos = [];
    [1, 2, 3, 4, 5, 6, 0].forEach((d) => { const t = txt(v.horario[d]), g = grupos[grupos.length - 1]; if (g && g.t === t) g.dias.push(d); else grupos.push({ t, dias: [d] }); });
    if (grupos.length === 1) return [["Todos los días", grupos[0].t]];
    return grupos.map(({ t, dias }) => [dias.length === 1 ? DIAC[dias[0]] : `${DIAC[dias[0]]} ${dias.length === 2 ? "y" : "a"} ${DIAC[dias[dias.length - 1]].toLowerCase()}`, t]);
  };
  // "Cómo llegar": su link de Google Maps, o uno armado con el nombre, la dirección y la ciudad (como el panel)
  const comoLlegar = (v) => v.mapa || (v.direccion || v.ciudad ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([v.name, v.direccion, v.ciudad].filter(Boolean).join(", ")) : "");
  const dondeReal = (v) => `<div class="dir"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg><div><b>${esc(v.direccion || ZONAS[v.zona])}</b>${v.direccion && v.ciudad ? `<span>${esc(v.ciudad)}</span>` : ""}</div></div>
    ${comoLlegar(v) ? `<a class="btn btn--line btn--s dir__ir" href="${esc(comoLlegar(v))}" target="_blank" rel="noopener">Cómo llegar</a>` : ""}`;
  // La foto de tapa de un lugar en las tarjetas: la suya, o (uno de verdad sin foto) sus iniciales en noche y crema.
  // Nunca la foto genérica del rubro, que haría pensar que es su lugar.
  const portada = (v, alt = "", extra = "") => (v.fotos.length ? img(v.fotos[0], alt, extra) : `<span class="portada" aria-hidden="true">${esc(iniciales(v.name))}</span>`);
  // Un turno de un lugar que la página no tiene cargado (por ejemplo, el de un negocio que todavía no está en la lista)
  const lugarDeTurno = (it) => venue(it.vid) || (() => {
    const rubro = rubroDe(it.rubro);
    return { id: it.vid, real: true, name: it.lugar || "Lugar", rubro, zona: zonaDe(it.zona), fotos: [], units: [], svcs: [{ id: it.svc, n: it.servicio || "Turno", min: 0, p: {} }] };
  })();


  // ---------- Estado ----------
  // res: el turno que se está por pagar (uno solo). Queda guardado HOLD (10 minutos) mientras se paga la seña.
  // vencida: el último que se venció sin pagar (para ofrecer volver a reservarlo).
  const HOLD = 10 * 60e3;
  // yo: el cliente con la cuenta abierta (o null). email: entró con una cuenta que todavía no tiene sus datos de cliente.
  // turnos: los de su cuenta (los trae cuenta.js). modoCu: qué muestra la caja de la cuenta ("nueva", "entrar").
  // pend: el email que espera confirmación (la cuenta recién creada, en modo nube).
  const S = { page: "home", hs: "padel", rubro: "padel", zona: "", dia: 0, franja: "", techada: false, svc: "", nav: 0, ys: {}, f: null, sec: "deportes", ult: { deportes: "padel", servicios: "barberia" }, res: store.get("reserva", null), vencida: null, turnos: [], yo: null, email: "", modoCu: "nueva", pend: "" };
  // Cuentas de los clientes (cuenta.js): con config.js completo, en la base; si no, en este navegador
  const CU = window.BookeaCuenta.crear(window.BOOKEA_CONFIG || {});
  const hoyKey = () => dayInfo(0).key;
  const diaDe = (key) => Math.round((Date.parse(key) - Date.parse(hoyKey())) / 864e5); // 0 = hoy
  const vigente = () => (S.res && S.res.vence > Date.now() ? S.res : null);
  if (S.res && !vigente()) S.res = null; // se venció con la página cerrada
  try { localStorage.removeItem("bookea:carrito"); } catch {} // ya no hay carrito: cada turno se paga al reservarlo
  const guardar = () => { store.set("reserva", S.res); badges(); }; // los turnos los guarda cuenta.js

  // ---------- Las direcciones de cada negocio (pedido del dueño, 21/11) ----------
  // bookea.ar/nombre es la página del negocio (su presentación) y bookea.ar/nombre/reservar, sus turnos para reservar.
  // En GitHub Pages llegan por 404.html como ?pagina=nombre y ?lugar=nombre; en un servidor que sirve esta misma página
  // en cualquier dirección (Cloudflare Pages), llegan tal cual. El <base> de index.html busca los archivos en la raíz.
  // Fuera de bookea.ar (la vista previa, una copia en la compu) la dirección no cambia.
  const LIMPIAS = /^https?:$/.test(location.protocol) && new URL(".", document.baseURI).pathname === "/";
  const Q = new URLSearchParams(location.search);
  const RUTA = LIMPIAS ? /^\/([a-z0-9]{1,30})(\/reservar)?\/?$/i.exec(location.pathname) : null;
  const LINK = sinTildes(Q.get("lugar") || Q.get("pagina") || (RUTA ? RUTA[1] : "")).replace(/[^a-z0-9]/g, "").slice(0, 30);
  const LINK_VER = Q.get("lugar") || (RUTA && RUTA[2]) ? "ficha" : "local";
  // La dirección de cada pantalla: la de un negocio de verdad lleva su nombre; las demás, la del inicio
  const rutaDe = (st) => {
    if (!LIMPIAS) return location.pathname + location.search;
    const v = (st.page === "ficha" || st.page === "local") && venue(st.v);
    return v && v.real ? `/${v.slug}${st.page === "ficha" ? "/reservar" : ""}` : "/";
  };
  // Los negocios de verdad se piden a la base al abrir la página (con config.js; en modo de prueba no hay ninguno),
  // y también el del link con que se llegó, aunque todavía no esté en la lista.
  let realesOk = false;
  const cargaReales = CU.lugares(LINK).then((r) => {
    if (!r.ok) return;
    r.lista.forEach((f) => {
      const v = lugarDeFila(f);
      if (venue(v.id)) return;
      (v.publicado && RUBRO_BASE(f.rubro) ? VENUES : SOLO_LINK).push(v);
    });
  }).catch(() => {}).finally(() => { realesOk = true; });
  // Al abrir la ficha de uno de verdad (y después de un "ya lo reservó otro"), sus horarios ocupados al momento
  const refrescarOcupados = (v) => CU.ocupados(v.slug).then((r) => {
    if (!r.ok) return;
    v.ocup = ocupDe(r.lista);
    if (S.page === "ficha" && S.f && S.f.v === v.id) renderBook();
  });

  // ---------- Disponibilidad (cada turno tiene su propia capacidad) ----------
  const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  // El turno guardado no se descuenta acá: en este demo solo lo ve quien lo guardó, y si lo vuelve a elegir
  // sigue con el mismo (reservar() lo reconoce). En la versión real, la base lo bloquea para los demás.
  const usado = (vid, key, t, unit) => S.turnos.some((x) => x.vid === vid && x.key === key && x.t === t && x.unit === unit);
  // En los de verdad, libres son las canchas sin turno en su agenda; en los de ejemplo, un cupo inventado fijo por horario
  const slotsFor = (v, dayI) => {
    const di = dayInfo(dayI), now = nowM(), out = [];
    iniciosDe(v, di.dow).forEach((t) => {
      if (dayI === 0 && t < now.min + 30) return;
      const ts = fmt(t);
      let libres;
      if (v.real) {
        const kReal = t >= 1440 ? sumarDia(di.key, 1) : di.key;
        libres = v.units.filter((u) => !v.ocup.has(`${v.recIds[u]}|${di.key}|${t}`) && !usado(v.id, kReal, ts, u));
      } else {
        const occ = v.ocup + (t >= 20 * 60 ? 16 : 0) + (di.finde ? 12 : 0);
        libres = v.units.filter((u) => hash(`${v.id}|${di.key}|${ts}|${u}`) % 100 >= occ && !usado(v.id, di.key, ts, u));
      }
      out.push({ t: ts, start: t, end: fmt(t + v.dur), franja: franjaDe(t), libres, total: v.units.length });
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
    VENUES.filter((v) => v.rubro === rubro).forEach((v) => [0, 1, 2, 3, 4, 5, 6].forEach((d) => iniciosDe(v, d).forEach((t) => set.add(franjaDe(t)))));
    return ["manana", "tarde", "noche"].filter((f) => set.has(f));
  };
  const turnosHoy = (rubro) => VENUES.filter((v) => v.rubro === rubro).reduce((a, v) => a + slotsFor(v, 0).filter((s) => s.libres.length).length, 0);

  // ---------- Navegación ----------
  const TITLES = { home: "Bookea · Reservá turnos en segundos", ficha: "Reservar · Bookea", pago: "Pagá la seña · Bookea", turnos: "Mis turnos · Bookea", resultados: "Turnos disponibles · Bookea", negocios: "Sumá tu negocio · Bookea", local: "Bookea" };
  function go(page, p = {}, replace = false) {
    S.ys[S.page] = window.scrollY;
    const st = { page, ...p };
    try { history[replace ? "replaceState" : "pushState"](st, "", rutaDe(st)); if (!replace) S.nav++; } catch {}
    show(st);
  }
  function show(st) {
    let page = st.page === "carrito" ? "pago" : st.page || "home"; // "carrito": historial de antes del 18/11
    if (!TITLES[page]) page = "home";
    // un negocio de verdad (o el turno por pagar en uno) que todavía no llegó de la base: se espera y se sigue
    if (!realesOk && (((page === "ficha" || page === "local") && !venue(st.v) && /^n-/.test(st.v || "")) || (page === "pago" && vigente() && !venue(S.res.vid)))) {
      cargaReales.then(() => show(st)); return;
    }
    if (page === "local" && !venue(st.v)) return go("home", {}, true);
    if (page === "ficha") {
      const v = venue(st.v); if (!v) return go("home", {}, true);
      if (v.real) refrescarOcupados(v);
      const svc0 = v.svcs.find((s) => s.id === S.svc) || v.svcs[0];
      S.f = { v: v.id, dia: st.dia ?? 0, abierto: st.dia != null, svc: svc0.id, t: st.t || null, unit: "any" };
      if (S.f.t && !slotsFor(v, S.f.dia).some((s) => s.t === S.f.t && s.libres.length)) S.f.t = null;
    }
    // Sin cuenta abierta: en Mis turnos (o si este navegador ya tuvo una cuenta) se ofrece entrar; al pagar por primera vez, crearla
    if (!S.yo && (page === "pago" || page === "turnos")) S.modoCu = page === "turnos" || store.get("tuvo-cuenta", false) ? "entrar" : "nueva";
    S.page = page;
    document.body.classList.remove("con-irpagar");
    $$(".page").forEach((el) => (el.hidden = el.dataset.page !== page));
    ({ home: renderHome, resultados: renderResultados, ficha: renderFicha, pago: renderPago, turnos: renderTurnos, negocios: () => {}, local: renderLocal })[page](st);
    pintarHold();
    const el = $("#page-" + page); el.classList.remove("is-in"); void el.offsetWidth; el.classList.add("is-in");
    revelar(el);
    $$(".tabbar [data-tab]").forEach((b) => b.classList.toggle("is-on", b.dataset.tab === (page === "resultados" || page === "local" ? "home" : page)));
    const vt = (page === "ficha" || page === "local") && venue(st.v);
    document.title = vt && vt.real ? (page === "local" ? `${vt.name} · Bookea` : `Reservar en ${vt.name} · Bookea`) : TITLES[page];
    if (!st.keepScroll) window.scrollTo(0, st.restore ? S.ys[page] || 0 : 0);
  }
  window.addEventListener("popstate", (e) => { S.nav = Math.max(0, S.nav - 1); show({ ...(e.state || { page: "home" }), restore: true }); });

  // ---------- Inicio: rubros chicos + filtros abiertos + Buscar ----------
  const diaCorto = (i) => (i === 0 ? "hoy" : i === 1 ? "mañana" : `el ${DOWL[dayInfo(i).dow]} ${dayInfo(i).d}/${dayInfo(i).m}`);
  function btnx(act, attrs, pressed, label, small = "") { return `<button type="button" class="chipx" data-act="${act}" ${attrs} aria-pressed="${pressed}">${label}${small ? `<small>${small}</small>` : ""}</button>`; }
  const SVCS = { corte: "Corte", "corte-barba": "Corte y barba", barba: "Barba" };
  const cardV = (v) => `<button type="button" class="vcard" data-act="ficha" data-v="${v.id}"><span class="vcard__ph">${portada(v, v.name, 'loading="lazy"')}<span class="tag">${RUBROS[v.rubro].n}</span></span>
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
  // Las dos secciones (Deportes | Servicios): el mismo control en el buscador, en "Libres ahora" y en los resultados
  // Se dibuja una sola vez y después solo se marca la elegida: así el fondo blanco se desliza de una pestaña a la otra
  function pintarSecs() {
    const i = Object.keys(SECCIONES).indexOf(S.sec);
    ["#f-secs", "#hs-secs", "#r-secs"].forEach((sel) => {
      const box = $(sel); if (!box) return;
      if (!box.firstElementChild) box.innerHTML = `<div class="secs" role="group" aria-label="Sección">${Object.entries(SECCIONES).map(([k, s]) => `<button type="button" data-act="sec" data-k="${k}">${s.n}</button>`).join("")}</div>`;
      const s = box.firstElementChild; s.style.setProperty("--i", i);
      $$("button", s).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === S.sec)));
    });
  }
  let filaDe = "";
  function renderBuscador() {
    const rs = SECCIONES[S.sec].rubros, fr = $("#f-rubros");
    // al cambiar de sección, la fila vieja se va (una copia encima que se desvanece) mientras entra la nueva
    const cambia = filaDe && filaDe !== S.sec && !reduce && fr.offsetWidth;
    if (cambia) {
      const viejo = fr.cloneNode(true);
      viejo.removeAttribute("id"); viejo.setAttribute("aria-hidden", "true"); viejo.inert = true; viejo.classList.add("rubros--sale");
      viejo.style.cssText = `position:absolute;left:${fr.offsetLeft}px;top:${fr.offsetTop}px;width:${fr.offsetWidth}px;margin:0`;
      fr.parentElement.appendChild(viejo);
      setTimeout(() => viejo.remove(), 450);
    }
    filaDe = S.sec;
    fr.dataset.n = rs.length;
    // la fila de fotos mide siempre lo mismo: con tres rubros el primero va más ancho; con uno o dos, un molde invisible fija el alto
    fr.innerHTML = rs.map((k) => `<button type="button" class="rubro" data-act="tile" data-k="${k}" aria-pressed="${k === S.rubro}">${img(RUBROS[k].img, "")}<span class="rubro__n">${RUBROS[k].n}</span></button>`).join("")
      + (rs.length <= 2 ? `<span class="rubro rubro--molde" aria-hidden="true"></span>` : "");
    if (cambia) { fr.classList.remove("rubros--entra"); void fr.offsetWidth; fr.classList.add("rubros--entra"); }
    pintarSecs();
    $("#f-zona").innerHTML = zonaOpts(S.rubro); $("#f-zona").value = S.zona;
    $("#f-dia").innerHTML = Array.from({ length: 7 }, (_, i) => `<option value="${i}">${dayFull(i)}</option>`).join(""); $("#f-dia").value = S.dia;
    $("#f-franja").innerHTML = franjaOpts(S.rubro); $("#f-franja").value = S.franja;
    pintarCollage();
  }
  // Las tres fotos de al lado del buscador son de la sección elegida
  let collageDe = "";
  // Al cambiar de sección, la foto nueva aparece encima de la vieja y se funde (una tras otra), y después la vieja se saca
  function pintarCollage() {
    if (S.sec === collageDe) return;
    const primera = !collageDe; collageDe = S.sec;
    $$(".collage figure").forEach((fig, i) => {
      const src = IMG[SECCIONES[S.sec].collage[i]], fotos = $$("img", fig), ult = fotos[fotos.length - 1];
      if (ult.getAttribute("src") === src) return;
      if (primera || reduce) { fotos.forEach((x, j) => (j < fotos.length - 1 ? x.remove() : (x.src = src))); return; }
      const nueva = ult.cloneNode(); nueva.src = src; nueva.className = "foto-nueva"; nueva.style.animationDelay = `${i * 120}ms`;
      fig.appendChild(nueva);
      setTimeout(() => { $$("img", fig).forEach((x) => x !== nueva && fig.lastElementChild === nueva && x.remove()); nueva.className = "foto-lista"; nueva.style.animationDelay = ""; }, 1150 + i * 120);
    });
  }
  function elegirSeccion(k) {
    if (!SECCIONES[k]) return;
    elegirRubro(S.ult[k]);
    S.hs = S.rubro;
    if (S.page === "home") renderDestacados();
  }
  // Libres ahora + lugares, con switch de categoría
  function renderDestacados() {
    if (!SECCIONES[S.sec].rubros.includes(S.hs)) S.hs = S.rubro;
    const k = S.hs, R = RUBROS[k];
    pintarSecs();
    const hs = $("#hs-switch");
    if (!hs.firstElementChild) hs.innerHTML = Object.entries(SECCIONES).map(([sk, s]) => `<div class="hs-grupo" data-sec="${sk}">${s.rubros.map((key) => `<button type="button" class="pill" data-act="hs" data-k="${key}">${RUBROS[key].n}</button>`).join("")}</div>`).join("");
    $$(".hs-grupo", hs).forEach((g) => { const on = g.dataset.sec === S.sec; g.classList.toggle("is-on", on); g.inert = !on; g.setAttribute("aria-hidden", String(!on)); });
    $$(".pill", hs).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === k)));
    const vs = VENUES.filter((v) => v.rubro === k);
    // con pocos lugares (hoy, las barberías), dos horarios de cada uno para que la fila llegue al borde
    $("#rail-now").innerHTML = proximos(k, vs.length < 4 ? 2 : 1).map(slotCard).join("") || `<p style="color:var(--ink-500)">Por ahora no quedan turnos de ${R.n.toLowerCase()}. Probá con otro día en el buscador.</p>`;
    $("#dest-t").textContent = `${R.n}: para reservar hoy`;
    $("#grid-dest").innerHTML = vs.map(cardV).join("");
    revelar($("#page-home"));
  }
  function renderHome() { renderBuscador(); renderDestacados(); }
  // El próximo turno libre de cada lugar de un rubro (hoy y los dos días que siguen), del más cercano al más lejano
  // (porLugar: cuántos horarios de cada lugar; "Libres ahora" del inicio usa uno, las otras pantallas dos para llenar el ancho)
  function proximos(rubro, porLugar = 1) {
    const cand = [];
    for (let d = 0; d < 3 && cand.length < 10; d++) VENUES.filter((v) => v.rubro === rubro).forEach((v) => {
      const ya = cand.filter((c) => c.v === v).length;
      slotsFor(v, d).filter((x) => x.libres.length).slice(0, porLugar - ya).forEach((s) => cand.push({ v, s, d }));
    });
    return cand.sort((a, b) => a.d - b.d || a.s.start - b.s.start).slice(0, 10);
  }
  // "Libres ahora" para las pantallas que quedarían vacías (pagar sin turno guardado, Mis turnos): siempre hay turnos a la vista
  const masLibres = (rubro, titulo) => {
    const c = proximos(rubro, 2); if (!c.length) return "";
    return `<div class="mas"><div class="sec__head"><div><p class="eyebrow">En vivo</p><h2>${titulo}</h2></div><button type="button" class="link" data-go="home" data-focus="pick">Buscar otro día u hora</button></div><div class="rail">${c.map(slotCard).join("")}</div></div>`;
  };
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
    pintarSecs();
    $("#r-rubros").innerHTML = SECCIONES[S.sec].rubros.map((k) => `<button type="button" class="pill" data-act="tile" data-k="${k}" aria-pressed="${k === S.rubro}">${RUBROS[k].n}</button>`).join("")
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
    box.innerHTML = lista.map(({ v, sl }) => `<article class="rcard${sl.length ? "" : " is-empty"}"><button type="button" class="rcard__ph" data-act="ficha" data-v="${v.id}" data-dia="${S.dia}" aria-label="Ver ${esc(v.name)}">${portada(v, "", 'loading="lazy"')}<span class="tag">${R.n}</span></button>
        <div class="rcard__b"><div class="rcard__top"><div><h3>${esc(v.name)}</h3><p>${ZONAS[v.zona]} · ${v.units.length} ${R.uns}</p></div><div class="rcard__price"><small>desde</small>${money(precioCard(v))}</div></div>
        ${sl.length ? `<div class="qslots">${sl.slice(0, 6).map((s) => `<button type="button" class="qslot" data-act="open-slot" data-v="${v.id}" data-dia="${S.dia}" data-t="${s.t}">${s.t}<small class="${s.libres.length === 1 ? "last" : ""}">${quedan(s, v)}</small></button>`).join("")}</div>` : `<p style="color:var(--ink-500);font-size:14px"><span class="dot dot--off"></span>Sin turnos libres para este filtro</p>`}
        <div class="rcard__foot"><button type="button" class="link" data-act="ficha" data-v="${v.id}" data-dia="${S.dia}">${sl.length > 6 ? `Ver los ${sl.length} horarios` : "Ver el lugar"}</button></div></div></article>`).join("");
  }
  function elegirRubro(k) {
    S.sec = secDe(k); S.ult[S.sec] = k;
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
  // Las filas de la tabla de precios: por franja (los de verdad), por servicio (barberías de ejemplo) o día, noche y finde
  const preciosHTML = (v) => {
    const sv0 = v.svcs[0];
    return v.real
        ? (sv0.franjas.length ? sv0.franjas : [{ desde: "", precio: 0 }]).map((x) => `<tr><th scope="row">${x.desde ? `${esc(x.desde)} a ${esc(x.hasta)}` : "Turno"}<small>seña ${money(senaDe(x.precio, v))}</small></th><td>${money(x.precio)}</td></tr>`).join("")
        : v.rubro === "barberia"
        ? v.svcs.map((s) => `<tr><th scope="row">${s.n}<small>${s.min} min</small></th><td>${money(s.p.dia)}</td></tr>`).join("")
        : `<tr><th scope="row">Lun a vie · hasta las 20<small>seña ${money(senaDe(sv0.p.dia))}</small></th><td>${money(sv0.p.dia)}</td></tr><tr><th scope="row">Lun a vie · desde las 20<small>seña ${money(senaDe(sv0.p.noche))}</small></th><td>${money(sv0.p.noche)}</td></tr><tr><th scope="row">Sáb y dom<small>seña ${money(senaDe(sv0.p.finde))}</small></th><td>${money(sv0.p.finde)}</td></tr>`;
  };
  function renderFicha() {
    const v = venue(S.f.v), R = RUBROS[v.rubro], sv0 = v.svcs[0], fotos = v.fotos.slice(0, 3);
    const filas = preciosHTML(v);
    // Todo a lo ancho (pedido del dueño, 19/11): fotos, días y, al tocar un día, sus horarios. El resto, en dos columnas.
    $("#ficha-root").innerHTML = `
      <a class="back" href="#" data-act="back"><svg class="icon"><use href="#i-back"/></svg>Volver</a>
      <div class="ficha">
        <div class="ficha__head">
          <div${v.real ? ` class="ficha__quien"><span class="ficha__av" aria-hidden="true">${IMG[v.id] ? `<img src="${IMG[v.id]}" alt="" />` : esc(iniciales(v.name))}</span><div` : ""}><p class="eyebrow">${SECCIONES[secDe(v.rubro)].n} · ${R.n}</p><h1>${esc(v.name)}</h1>
          <div class="facts"><span><svg class="icon"><use href="#i-pin"/></svg>${ZONAS[v.zona]}</span><span><svg class="icon"><use href="#i-clock"/></svg>Turnos de ${v.dur} min</span><span><svg class="icon"><use href="#i-shield"/></svg>Seña ${pctDe(v)} %</span></div></div>${v.real ? "</div>" : ""}
          <p class="ficha__desde"><small>desde</small><b>${money(minPrecio(v))}</b><span>por turno</span></p>
        </div>
        ${v.real ? "" /* su foto es la de perfil (chica): va al lado del nombre, y los horarios suben */ : `<div class="gal${fotos.length < 2 ? " is-solo" : fotos.length === 2 ? " is-duo" : ""}">${fotos.map((k) => `<figure>${img(k, "")}</figure>`).join("")}</div>`}
        <section class="reserva" id="book" aria-labelledby="book-t"></section>
        <div class="ficha__rest">
          <div class="blk"><h2>Sobre el lugar</h2><p>${esc(v.desc)} ${v.units.length} ${R.uns}: ${v.units.map(esc).join(", ")}.</p></div>
          ${v.real ? `<div class="blk"><h2>Horarios</h2><table class="ptable"><caption class="sr-only">Horarios</caption><tbody>${horariosDe(v).map(([d, h]) => `<tr><th scope="row">${d}</th><td>${esc(h)}</td></tr>`).join("")}</tbody></table></div>`
            : `<div class="blk"><h2>Lo que ofrece</h2><ul class="ame">${v.ame.map((k) => `<li>${AMI}${AM[k]}</li>`).join("")}</ul></div>`}
          <div class="blk"><h2>${v.rubro === "barberia" ? "Servicios y precios" : "Precios por horario"}</h2><table class="ptable"><caption class="sr-only">Precios</caption><tbody>${filas}</tbody></table></div>
          <div class="blk"><h2>Dónde queda</h2>${v.real ? dondeReal(v) : `<div class="mapbox">${mapSVG(v.id)}<div class="mapbox__t"><b>${ZONAS[v.zona]}</b>Valle de Uco, Mendoza</div></div><p class="mapnote">Ubicación aproximada. La dirección exacta te llega al confirmar el turno.</p>`}</div>
          <div class="blk blk--ancho"><h2>Información adicional</h2><dl class="dl">
            ${v.real ? "" : `<div><dt>Horarios</dt><dd>Todos los días · ${horarios(v)}</dd></div>`}
            <div><dt>Llegada</dt><dd>Llegá 10 minutos antes para empezar a horario.</dd></div>
            <div><dt>Pagos</dt><dd>Seña del ${pctDe(v)} % online con Mercado Pago. El resto lo abonás en el lugar.</dd></div>
            <div><dt>Cancelación</dt><dd>${reglaCancelar(v.devuelve, v.cancel)}</dd></div>
            <div><dt>Cómo reservás</dt><dd>Elegís día y horario, entrás con tu cuenta y pagás la seña. El turno queda en Mis turnos y te llega la confirmación por mail.</dd></div></dl>
            ${v.real ? "" : `<span class="demo">Negocio de ejemplo · demo</span>`}</div>
        </div>
      </div>
      <div class="irpagar" id="ir-pagar" role="region" aria-label="Turno elegido" hidden></div>`;
    renderBook();
  }
  // Días a todo el ancho (con su cupo); al tocar uno, sus horarios abajo; con un horario elegido, el aviso verde "Ir a pagar"
  function renderBook() {
    const v = venue(S.f.v), f = S.f, R = RUBROS[v.rubro], di = dayInfo(f.dia), svc = curSvc();
    const sl = slotsFor(v, f.dia), sel = f.abierto ? sl.find((s) => s.t === f.t && s.libres.length) : null;
    if (!sel) f.t = null;
    if (sel && !sel.libres.includes(f.unit)) f.unit = sel.libres[0]; // la primera libre queda elegida, y se ve cuál es
    // Con más de una cancha (o barbero) libre a esa hora, se elige cuál justo debajo del horario elegido (pedido del dueño, 19/11)
    const qu = v.rubro === "barberia" ? "con quién" : `${R.un.toLowerCase()}`;
    const eleccion = sel && sel.libres.length > 1 ? `<div class="eleccion" id="f-eleccion"><p class="slots__g">${v.rubro === "barberia" ? "¿Con quién?" : `¿En qué ${qu}?`} · ${sel.t}</p>
      <div class="slots" role="group" aria-label="Elegí ${v.rubro === "barberia" ? qu : `la ${qu}`} para las ${sel.t}">${sel.libres.map((u) => { const [nom, det] = u.split(" · "); return `<button type="button" class="slot slot--u${f.unit === u ? " is-on" : ""}" data-act="f-unit" data-u="${esc(u)}" aria-pressed="${f.unit === u}"><b>${esc(nom)}</b><small>${det ? esc(cap(det)) : "Libre"}</small></button>`; }).join("")}</div></div>` : "";
    const dias = Array.from({ length: 7 }, (_, i) => {
      const s7 = slotsFor(v, i), n = s7.filter((s) => s.libres.length).length, tot = s7.length || 1, d = dayInfo(i), on = f.abierto && i === f.dia;
      return `<button type="button" class="cupo${on ? " is-on" : ""}${n ? "" : " is-zero"}" data-act="f-dia" data-i="${i}" aria-pressed="${on}"><span>${i === 0 ? "Hoy" : i === 1 ? "Mañana" : DOW3[d.dow]}</span><b>${d.d}</b><i style="--p:${Math.round((n / tot) * 100)}%"></i><small>${n ? `${n} ${n === 1 ? "libre" : "libres"}` : "Completo"}</small></button>`;
    }).join("");
    const grupos = ["manana", "tarde", "noche"].map((g) => [g, sl.filter((s) => s.franja === g)]).filter(([, a]) => a.length);
    const titulo = f.dia < 2 ? `Horarios de ${diaCorto(f.dia)}` : `Horarios del ${DOWL[di.dow]} ${di.d}/${di.m}`;
    const panel = !f.abierto ? `<p class="reserva__hint">Tocá un día para ver sus horarios libres.</p>` : `
      <div class="reserva__panel" id="book-panel">
        <div class="reserva__ph"><h3>${titulo}</h3>${v.svcs.length > 1 ? `<label class="reserva__svc"><span class="eyebrow">Servicio</span><select class="sel" id="f-svc">${v.svcs.map((s) => `<option value="${s.id}"${s.id === f.svc ? " selected" : ""}>${s.n} · ${s.min} min · ${money(precioDe(s, di, 18 * 60))}</option>`).join("")}</select></label>` : ""}</div>
        ${sl.length ? grupos.map(([g, a]) => `${grupos.length > 1 ? `<p class="slots__g">${FRANJAS[g]}</p>` : ""}<div class="slots">${a.map((s) => `<button type="button" class="slot${s.t === f.t ? " is-on" : ""}" data-act="f-slot" data-t="${s.t}" ${s.libres.length ? "" : "disabled"} aria-pressed="${s.t === f.t}"><b>${s.t}</b><small class="${s.libres.length === 1 ? "last" : ""}">${s.libres.length ? quedan(s, v) : "Completo"}</small></button>`).join("")}</div>${sel && a.includes(sel) ? eleccion : ""}`).join("") : `<p class="book__empty">Ya no quedan turnos para ${dayFull(f.dia).toLowerCase()}. Probá otro día.</p>`}
      </div>`;
    $("#book").innerHTML = `
      <div class="reserva__top"><div><p class="eyebrow">Reservá tu turno</p><h2 id="book-t">Elegí el día</h2></div><p class="reserva__nota">Cada horario tiene su propio cupo. Al reservar, te lo guardamos 10 minutos para pagar la seña.</p></div>
      <div class="cupos" role="group" aria-label="Día">${dias}</div>${panel}`;
    // El aviso verde de abajo: aparece solo con un horario elegido y no tapa la lectura
    const ir = $("#ir-pagar");
    if (sel) {
      const precio = precioDe(svc, di, sel.start), sena = senaDe(precio, v), unitTxt = f.unit === "any" ? sel.libres[0] : f.unit;
      ir.innerHTML = `<div class="irpagar__t"><b>${keyLabel(di.key)} · ${sel.t}</b><span>${esc(unitTxt)}${v.svcs.length > 1 ? " · " + esc(svc.n) : ""} · seña ${money(sena)} · ${money(precio)} el turno · hasta las ${sel.end}</span></div><button type="button" class="btn irpagar__btn" data-act="reservar">Ir a pagar<svg class="icon" aria-hidden="true"><use href="#i-back"/></svg></button>`;
      if (ir.hidden) { ir.hidden = false; void ir.offsetWidth; }
      ir.classList.add("is-on");
    } else { ir.hidden = true; ir.classList.remove("is-on"); }
    document.body.classList.toggle("con-irpagar", !!sel);
  }
  function reservar() {
    const v = venue(S.f.v), f = S.f, di = dayInfo(f.dia), svc = curSvc(), r = vigente();
    // si ya tenía guardado este mismo horario, sigue con ese y con el tiempo que le queda
    if (r && r.vid === v.id && (r.fa || r.key) === di.key && r.t === f.t && r.svc === svc.id && (f.unit === "any" || f.unit === r.unit)) return go("pago");
    const s = slotsFor(v, f.dia).find((x) => x.t === f.t);
    if (!s || !s.libres.length) { toast("Ese horario se acaba de ocupar"); return renderBook(); }
    const unit = f.unit !== "any" && s.libres.includes(f.unit) ? f.unit : s.libres[0];
    const precio = precioDe(svc, di, s.start), sena = senaDe(precio, v);
    // En uno de verdad va también lo que pide la base: la cancha (rec) y el horario como en su agenda (fa y min).
    // key y t son el día y la hora de verdad: un turno de las 00:30 que sigue a la noche es del día siguiente.
    const real = v.real ? { nid: v.nid, rec: v.recIds[unit], fa: di.key, min: s.start } : {};
    S.res = { id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), vid: v.id, svc: svc.id, key: v.real && s.start >= 1440 ? sumarDia(di.key, 1) : di.key,
      t: s.t, end: s.end, unit, precio, sena, cancel: v.cancel, devuelve: v.devuelve !== false, vence: Date.now() + HOLD, ...real };
    S.vencida = null;
    guardar(); reloj();
    go("pago");
    if (r) toast("Cambiaste de turno: el anterior quedó libre");
  }

  // ---------- La página del negocio (bookea.ar/nombre): su presentación, con sus turnos para reservar ----------
  // Como la página de cada bodega de Mendoza Icons (pedido del dueño, 21/11): portada con su logo y su foto, sus turnos
  // libres, su historia con fotos, sus canchas y precios, horarios, dónde queda y sus redes. "Reservar" lleva a su ficha
  // (bookea.ar/nombre/reservar). Los de ejemplo también la tienen, con sus fotos de muestra y el cartel de ejemplo.
  const paginaDe = (v) => (v.real ? v.pagina : {
    frase: "", historia: v.desc, logo: "", portada: IMG[v.fotos[0]] || "", galeria: v.fotos.slice(1).map((k) => IMG[k]).filter(Boolean),
    instagram: "", tiktok: "", facebook: "", whatsapp: "",
  });
  const parrafos = (t) => String(t || "").split(/\n\s*\n|\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("");
  const waDe = (n) => { const d = String(n || "").replace(/\D/g, "").replace(/^0/, ""); return d ? "https://wa.me/" + (d.startsWith("54") ? d : "549" + d) : ""; };
  const RED = (ico, txt, href) => `<li><a href="${esc(href)}" target="_blank" rel="noopener"><svg class="icon" aria-hidden="true"><use href="#i-${ico}"/></svg><span>${esc(txt)}</span></a></li>`;
  function renderLocal(st) {
    const v = venue(st.v), R = RUBROS[v.rubro], pg = paginaDe(v), maps = v.real ? comoLlegar(v) : "";
    const logo = pg.logo || (v.real ? IMG[v.id] || "" : "");
    const hoy = (() => {
      if (!v.real) return horariosDe(v)[0][1];
      const h = v.horario[dayInfo(0).dow];
      return !h || h.cerrado ? "Cerrado" : `${h.abre} a ${h.cierra}`;
    })();
    // los primeros horarios libres (hoy y los dos días que siguen), hasta llenar la fila
    const libres = [];
    for (let d = 0; d < 3 && libres.length < 8; d++) slotsFor(v, d).filter((x) => x.libres.length).slice(0, 8 - libres.length).forEach((x) => libres.push({ v, s: x, d }));
    const redes = [
      pg.whatsapp && waDe(pg.whatsapp) ? RED("wa", pg.whatsapp, waDe(pg.whatsapp)) : "",
      pg.instagram ? RED("ig", "@" + pg.instagram, `https://www.instagram.com/${pg.instagram}/`) : "",
      pg.tiktok ? RED("tt", "@" + pg.tiktok, `https://www.tiktok.com/@${pg.tiktok}`) : "",
      pg.facebook ? RED("fb", pg.facebook, `https://www.facebook.com/${pg.facebook}`) : "",
    ].filter(Boolean);
    const gal = pg.galeria.slice(0, 6);
    const reservar = (txt, cls = "btn btn--primary btn--lg") => `<button type="button" class="${cls}" data-act="ficha" data-v="${v.id}">${txt}</button>`;
    const precios = `<div class="loc__precios">
              <ul class="loc__unis">${v.units.map((u) => { const [nom, det] = u.split(" · "); return `<li><b>${esc(nom)}</b><span>${det ? esc(cap(det)) : `Turnos de ${v.dur} min`}</span></li>`; }).join("")}</ul>
              <table class="ptable"><caption class="sr-only">Precios</caption><tbody>${preciosHTML(v)}</tbody></table>
            </div>`;
    // con historia y sin fotos, las canchas y los precios van al lado de la historia (la fila no queda a medias)
    const alLado = pg.historia && !gal.length;
    $("#local-root").innerHTML = `
      <div class="loc">
        <header class="loc__hero${pg.portada ? " has-foto" : ""}">
          ${pg.portada ? `<img class="loc__bg" src="${esc(pg.portada)}" alt="" />` : ""}
          <div class="wrap loc__in">
            <span class="loc__logo${logo ? " has-img" : ""}" aria-hidden="true">${logo ? `<img src="${esc(logo)}" alt="" />` : esc(iniciales(v.name))}</span>
            <p class="loc__rubro">${esc(R.n)} · ${esc(ZONAS[v.zona])}</p>
            <h1>${esc(v.name)}</h1>
            ${pg.frase ? `<p class="loc__frase">${esc(pg.frase)}</p>` : ""}
            <div class="loc__acts">${reservar("Reservar turno")}${maps ? `<a class="btn btn--lg btn--claro" href="${esc(maps)}" target="_blank" rel="noopener">Cómo llegar</a>` : ""}</div>
          </div>
          <i class="loc__franja" aria-hidden="true"></i>
        </header>
        <div class="wrap">
          <dl class="loc__datos">
            <div><dt>Turnos de</dt><dd>${v.dur} min</dd></div>
            <div><dt>Desde</dt><dd>${money(minPrecio(v))}</dd></div>
            <div><dt>${esc(cap(R.uns))}</dt><dd>${v.units.length}</dd></div>
            <div><dt>Hoy</dt><dd>${esc(hoy)}</dd></div>
          </dl>
          ${v.real ? "" : `<span class="demo">Negocio de ejemplo · demo</span>`}
          <section class="loc__sec" aria-labelledby="loc-libres">
            <div class="sec__head"><div><p class="eyebrow">Turnos libres</p><h2 id="loc-libres">Para reservar ya</h2></div>${reservar("Ver todos los horarios", "link")}</div>
            ${libres.length ? `<div class="rail">${libres.map(slotCard).join("")}</div>` : `<p class="loc__vacio">No quedan turnos libres hasta pasado mañana. ${reservar("Ver los días que siguen", "link")}</p>`}
          </section>
          ${pg.historia || gal.length ? `<section class="loc__sec loc__hist" aria-labelledby="loc-hist">
            <div class="loc__texto"><p class="eyebrow">El lugar</p><h2 id="loc-hist">${v.real ? "Nuestra historia" : "Sobre el lugar"}</h2>${parrafos(pg.historia) || `<p>${esc(v.name)} trabaja con turnos en Bookea.</p>`}</div>
            ${gal.length ? `<div class="loc__gal n${gal.length}">${gal.map((u) => `<figure><img src="${esc(u)}" alt="" loading="lazy" /></figure>`).join("")}</div>`
              : `<div class="loc__lado"><p class="eyebrow">${esc(R.n)}</p><h2 id="loc-uni">${esc(cap(R.uns))} y precios</h2>${precios}</div>`}
          </section>` : ""}
          ${alLado ? "" : `<section class="loc__sec" aria-labelledby="loc-uni">
            <div class="sec__head"><div><p class="eyebrow">${esc(R.n)}</p><h2 id="loc-uni">${esc(cap(R.uns))} y precios</h2></div></div>
            ${precios}
          </section>`}
          <section class="loc__sec loc__info">
            <div><h2>Horarios</h2><table class="ptable"><caption class="sr-only">Horarios</caption><tbody>${horariosDe(v).map(([d, h]) => `<tr><th scope="row">${d}</th><td>${esc(h)}</td></tr>`).join("")}</tbody></table></div>
            <div><h2>Dónde queda</h2>${v.real ? dondeReal(v) : `<div class="mapbox">${mapSVG(v.id)}<div class="mapbox__t"><b>${ZONAS[v.zona]}</b>Valle de Uco, Mendoza</div></div>`}</div>
            ${redes.length ? `<div><h2>Contacto</h2><ul class="loc__redes">${redes.join("")}</ul></div>` : ""}
          </section>
        </div>
        <section class="loc__cta" aria-labelledby="loc-cta">
          <div class="wrap"><h2 id="loc-cta">Reservá tu turno en ${esc(v.name)}</h2><p>Elegís el día y el horario, pagás la seña y te llega la confirmación por mail.</p>${reservar("Ver horarios libres")}</div>
        </section>
      </div>`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc && v.real) desc.setAttribute("content", (pg.frase || pg.historia || `${v.name}: reservá tu turno en Bookea.`).slice(0, 160));
  }

  // ---------- Pagar la seña: un solo turno, guardado 10 minutos ----------
  const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  let tic = null;
  // Un solo reloj para todo: la pantalla de pago, su barra de abajo y el aviso "Pagar" de arriba
  function reloj() {
    clearInterval(tic); tic = null;
    if (vigente()) {
      const paso = () => {
        const r = vigente();
        if (!r) return vencer();
        const falta = r.vence - Date.now();
        $$("[data-reloj]").forEach((el) => (el.textContent = mmss(falta)));
        $$(".reloj, .hold").forEach((el) => el.classList.toggle("is-poco", falta <= 120e3));
      };
      paso(); tic = setInterval(paso, 1000);
    }
    pintarHold();
  }
  function vencer() {
    clearInterval(tic); tic = null;
    if (!S.res) return pintarHold();
    S.vencida = S.res; S.res = null; guardar(); pintarHold();
    if (S.page === "pago") renderPago(); else toast("Se terminó el tiempo: el turno que tenías guardado quedó libre");
  }
  // Mientras hay un turno guardado: "Pagar" con el tiempo que queda, arriba en la compu y en una barra en el celular
  // (no en la pantalla de pago, que ya lo muestra, ni en la ficha del celular, que tiene su propia barra)
  function pintarHold() {
    const hay = !!vigente();
    $("#t-pago").hidden = !hay || S.page === "pago";
    const barra = hay && S.page !== "pago" && S.page !== "ficha";
    $("#hold-bar").hidden = !barra;
    document.body.classList.toggle("con-hold", barra);
  }
  function renderPago() {
    const root = $("#pago-root"), r = vigente();
    if (!r) return sinTurno(root);
    const v = venue(r.vid);
    if (!v) { S.res = null; guardar(); return sinTurno(root); } // el lugar ya no está en la página
    const R = RUBROS[v.rubro], svc = v.svcs.find((s) => s.id === r.svc) || v.svcs[0];
    const quien = v.rubro === "barberia" ? `Con ${esc(r.unit)}` : esc(r.unit);
    root.innerHTML = `
      <a class="back" href="#" data-act="back"><svg class="icon"><use href="#i-back"/></svg>Volver</a>
      <div class="chk">
        <div class="chk__head">
          <div><p class="eyebrow">Último paso</p><h1>Confirmá tu turno</h1></div>
          <p class="reloj" role="timer"><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg><span>Te guardamos el turno</span><b data-reloj>${mmss(r.vence - Date.now())}</b></p>
        </div>
        <article class="chk__turno">
          <div class="chk__ph">${portada(v)}<span class="tag">${R.n}</span></div>
          <div class="chk__b">
            <h2>${esc(v.name)}</h2>
            <p class="chk__when"><span>${keyLabel(r.key)} ·</span> <span>${r.t}–${r.end}</span></p>
            <ul class="chk__facts">
              <li><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg>${ZONAS[v.zona]}</li>
              <li><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg>${v.rubro === "barberia" ? esc(svc.n) + " · " : ""}${svc.min} min</li>
              <li><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>${quien}</li>
            </ul>
            <button type="button" class="link" data-act="cambiar">Cambiar horario</button>
          </div>
        </article>
        ${cuentaHTML("pago")}
        <aside class="chk__side"><div class="panel panel--sum"><h2>Resumen</h2><div class="pay">
          <div><span>Turno</span><b>${money(r.precio)}</b></div>
          <div><span>En el lugar</span><b>${money(r.precio - r.sena)}</b></div>
          <div class="big"><span>Seña ahora (${pctDe(v)} %)</span><b>${money(r.sena)}</b></div></div>
          <button type="button" class="btn btn--primary btn--lg btn--block" data-act="pay" style="margin-top:18px"><span class="mp">Pagar seña con Mercado Pago</span></button>
          <p class="note note--ok"><svg class="icon" aria-hidden="true"><use href="#i-shield"/></svg><span>${r.devuelve === false ? "Si cancelás, el horario se libera, pero en este lugar la seña no se devuelve." : r.cancel ? `Podés cancelar hasta ${r.cancel} h antes y la seña se devuelve.` : "Podés cancelar hasta que empiece y la seña se devuelve."}</span></p>
          <p class="note">${v.real ? "Bookea está en prueba: todavía no se cobra la seña. El turno queda reservado igual en la agenda del lugar." : "Demo: los negocios son de ejemplo y no se cobra nada. En la versión real, acá se abre el pago de Mercado Pago."}</p></div>
          <div class="panel chk__mapa"><h2>Dónde queda</h2>${v.real ? dondeReal(v) : `<div class="mapbox">${mapSVG(v.id)}<div class="mapbox__t"><b>${ZONAS[v.zona]}</b>Valle de Uco, Mendoza</div></div>`}<p class="mapnote">Los datos del turno te llegan por mail al confirmar.</p></div></aside>
        <div class="pasos"><h2>Cómo sigue</h2><ol>
          <li><span class="pasos__n">1</span><b>Pagás la seña</b><span>${money(r.sena)} con Mercado Pago. El turno queda confirmado en el momento.</span></li>
          <li><span class="pasos__n">2</span><b>Te llega por mail</b><span>La confirmación con el día, la hora, ${v.rubro === "barberia" ? "con quién" : "la cancha"} y el código del turno. También queda en Mis turnos.</span></li>
          <li><span class="pasos__n">3</span><b>El resto, en el lugar</b><span>${money(r.precio - r.sena)} el día del turno. Llegá 10 minutos antes.</span></li>
        </ol></div>
      </div>
      <div class="mbar"><div class="mbar__t"><b>${money(r.sena)} <span style="display:inline;font-weight:400">de seña</span></b><span>Guardado por <b class="mbar__reloj" data-reloj>${mmss(r.vence - Date.now())}</b></span></div><button type="button" class="btn btn--primary" data-act="pay">Pagar seña</button></div>`;
    reloj();
  }
  // Sin turno guardado: se venció el tiempo (y se puede volver a guardar) o se llegó sin elegir ninguno
  function sinTurno(root) {
    const v = S.vencida && venue(S.vencida.vid), x = v ? S.vencida : null, rubro = v ? v.rubro : S.rubro;
    root.innerHTML = `<div class="aviso${x ? " aviso--vencio" : ""}">
        <span class="aviso__ic"><svg class="icon" aria-hidden="true"><use href="#i-clock"/></svg></span>
        <div><h1>${x ? "Se terminó el tiempo" : "No tenés ningún turno por pagar"}</h1>
          <p>${x ? `El turno de ${keyLabel(x.key).toLowerCase()} a las ${x.t} en ${esc(v.name)} volvió a quedar libre. Si sigue libre, lo guardamos de nuevo por 10 minutos.` : "Elegí un horario y reservalo: te lo guardamos 10 minutos mientras pagás la seña."}</p>
          <div class="aviso__acts">${x ? `<button type="button" class="btn btn--primary" data-act="otra-vez">Volver a reservarlo</button>` : ""}<button type="button" class="btn ${x ? "btn--line" : "btn--primary"}" data-go="home" data-focus="pick">Buscar turnos</button></div></div>
        ${x ? `<div class="aviso__turno"><div class="aviso__ph">${portada(v)}<span class="tag">${RUBROS[v.rubro].n}</span></div><div class="aviso__b"><b>${esc(v.name)}</b><span class="aviso__when">${keyLabel(x.key)} · ${x.t}–${x.end}</span><span>${esc(x.unit)} · seña ${money(x.sena)}</span></div></div>` : ""}
      </div>${masLibres(rubro, `Libres ahora: ${RUBROS[rubro].n.toLowerCase()}`)}`;
  }
  function otraVez() {
    const x = S.vencida; if (!x) return;
    const v = venue(x.vid); if (!v) { S.vencida = null; return go("home", {}, true); }
    const dia = diaDe(x.fa || x.key), s = dia >= 0 && dia < 7 ? slotsFor(v, dia).find((y) => y.t === x.t) : null;
    if (!s || !s.libres.length) { S.vencida = null; toast("Ese horario ya se ocupó: elegí otro"); return go("ficha", { v: v.id, dia: Math.max(0, Math.min(6, dia)) }, true); }
    S.res = { ...x, unit: s.libres.includes(x.unit) ? x.unit : s.libres[0], vence: Date.now() + HOLD }; S.vencida = null;
    guardar(); renderPago(); revelar($("#page-pago")); window.scrollTo(0, 0);
  }
  // ---------- La cuenta del cliente: hace falta para pagar la seña (cuenta.js) ----------
  // Nombre, email, celular y contraseña. Se crea o se abre en la misma pantalla de pago (o en Mis turnos),
  // sin perder el turno guardado. En modo nube, una cuenta nueva confirma su email antes de entrar.
  const MSJ = {
    credenciales: "El email o la contraseña no coinciden. Revisalos y probá de nuevo.",
    "sin-confirmar": "Todavía no confirmaste tu email. Abrí el mail que te mandamos (fijate también en spam o promociones).",
    existe: "Ya hay una cuenta con ese email. Entrá con tu contraseña.",
    "clave-debil": "Esa contraseña es muy fácil de adivinar. Usá 8 o más caracteres, con letras y números.",
    "email-invalido": "Ese email no parece válido. Revisalo.",
    "email-no-autorizado": "Por ahora no podemos mandar mails a esa dirección. Probá con otro email.",
    muchos: "Hubo muchos intentos seguidos. Esperá un minuto y probá de nuevo.",
    ocupado: "Ese horario lo acaba de reservar otra persona. Elegí otro.",
    pasado: "Ese horario ya pasó. Elegí otro.",
    "no-disponible": "Ese horario ya no está disponible. Elegí otro.",
    limite: "Ya tenés 10 turnos por delante. Cancelá alguno para reservar otro.",
    "sin-datos": "Completá tu nombre y tu celular para reservar.",
    negocio: "Esta cuenta también maneja un negocio en el panel. Para borrarla, escribinos a hola@bookea.ar.",
    "no-existe": "Ese turno ya no está. Actualizamos la lista.",
    invalido: "Revisá los datos: hay algo que no está bien.",
    local: "En esta versión de prueba no se mandan mails.",
    "sin-base": "Todavía no podemos guardar cuentas: falta un paso de configuración. Probá en un rato.",
    sesion: "Se cerró tu sesión. Entrá de nuevo con tu email y tu contraseña.",
    libreria: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
    red: "No pudimos conectarnos. Revisá tu conexión y probá de nuevo.",
    otro: "Algo salió mal. Probá de nuevo en un rato.",
  };
  const msj = (e) => MSJ[e] || MSJ.otro;
  const iniciales = (n) => (String(n).trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("") || "?").toUpperCase();
  // Lo que pide la ley de datos personales (Disposición 10/2008 de la AAIP) en el formulario donde se piden
  const LEGAL = `<p class="legal">Bookea usa tus datos para tus turnos y no los vende. Podés verlos, corregirlos o borrarlos desde Mis turnos. El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326. La Agencia de Acceso a la Información Pública, Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>`;
  const campo = (id, rotulo, extra, error, ayuda = "") => `<label class="field"><span>${rotulo}</span><input id="${id}" ${extra} aria-describedby="${id}-e" /><p class="err" id="${id}-e" hidden>${error}</p>${ayuda}</label>`;
  const campoClave = (auto) => `<label class="field"><span>Contraseña</span><span class="clave"><input id="cu-clave" type="password" autocomplete="${auto}" minlength="8" aria-describedby="cu-clave-e" /><button type="button" class="clave__ver" data-act="cu-ver" aria-pressed="false" aria-label="Mostrar la contraseña">Ver</button></span><p class="err" id="cu-clave-e" hidden>${auto === "new-password" ? "Usá 8 caracteres o más." : "Escribí tu contraseña."}</p></label>`;
  const casillas = () => `<label class="check"><input type="checkbox" id="cu-acepto" aria-describedby="cu-acepto-e" /><span>Acepto las <a href="privacidad.html#condiciones" target="_blank" rel="noopener">condiciones de uso</a> y la <a href="privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</span></label><p class="err" id="cu-acepto-e" hidden>Para seguir, tenés que aceptarlas.</p>
    <label class="check"><input type="checkbox" id="cu-promos" /><span>Quiero recibir promociones de Bookea por mail <small>(opcional)</small>.</span></label>`;
  function cuentaHTML(donde) {
    const pago = donde === "pago", cls = `panel cuenta${pago ? " chk__datos" : ""}`;
    if (S.yo) {
      return `<div class="${cls} cuenta--yo" id="cuenta"><h2>Tus datos</h2>
        <div class="yo"><span class="yo__av" aria-hidden="true">${esc(iniciales(S.yo.nombre))}</span><div class="yo__t"><b>${esc(S.yo.nombre)}</b><span>${esc(S.yo.email)}${S.yo.celular ? ` · ${esc(S.yo.celular)}` : ""}</span></div>
        <button type="button" class="link yo__salir" data-act="cu-salir">No soy yo</button></div>
        <p class="note">Te mandamos la confirmación del turno a <b>${esc(S.yo.email)}</b>.</p></div>`;
    }
    if (S.pend) {
      return `<div class="${cls} cuenta--mail" id="cuenta"><span class="cuenta__ic" aria-hidden="true"><svg class="icon"><use href="#i-mail"/></svg></span><div>
        <h2>Confirmá tu email</h2>
        <p class="cuenta__lead">Te mandamos un mail a <b>${esc(S.pend)}</b>. Tocá <b>Confirmar mi email</b> y volvé acá${pago ? ": el turno sigue guardado mientras corre el tiempo" : ""}.</p>
        <div class="cuenta__acts"><button type="button" class="btn btn--ink" data-act="cu-ya">Ya lo confirmé</button><button type="button" class="btn btn--line" data-act="cu-otro">Usar otro email</button></div>
        <p class="note">¿No llegó? Fijate en spam o en promociones.</p><p class="cuenta__msg" id="cu-msg" role="alert" hidden></p></div></div>`;
    }
    if (S.email) { // entró con una cuenta que ya existía (por ejemplo, la de su negocio) y le faltan sus datos de cliente
      return `<div class="${cls}" id="cuenta"><h2>Completá tus datos</h2>
        <p class="cuenta__lead">Entraste como <b>${esc(S.email)}</b>. Para reservar, sumá tu nombre y tu celular. <button type="button" class="link" data-act="cu-salir">No soy yo</button></p>
        <form id="f-cuenta" class="cuenta__f" data-modo="datos" novalidate><div class="fields">
          ${campo("cu-nombre", "Nombre y apellido", 'autocomplete="name"', "Escribí tu nombre y apellido.")}
          ${campo("cu-cel", "Celular", 'type="tel" inputmode="tel" autocomplete="tel" placeholder="261 555 1234"', "Escribí tu celular, con la característica.")}
        </div>${casillas()}
        <button type="submit" class="btn btn--ink btn--block">Guardar y seguir</button><p class="cuenta__msg" id="cu-msg" role="alert" hidden></p></form>${LEGAL}</div>`;
    }
    const nueva = S.modoCu === "nueva";
    const lead = nueva
      ? (pago ? "Para pagar la seña necesitás una cuenta: ahí quedan tus turnos y te mandamos la confirmación por mail." : "Con tu cuenta ves tus turnos desde cualquier celular o compu.")
      : (pago ? "Entrá con tu email y tu contraseña para pagar la seña." : "Entrá con tu email y tu contraseña para ver tus turnos.");
    return `<div class="${cls}" id="cuenta">
      <div class="cuenta__top"><h2>${nueva ? "Creá tu cuenta" : "Entrá a tu cuenta"}</h2>
        <div class="secs cuenta__modo" role="group" aria-label="Tu cuenta" style="--i:${nueva ? 0 : 1}"><button type="button" data-act="cu-modo" data-k="nueva" aria-pressed="${nueva}">Soy nuevo</button><button type="button" data-act="cu-modo" data-k="entrar" aria-pressed="${!nueva}">Ya tengo cuenta</button></div></div>
      <p class="cuenta__lead">${lead}</p>
      <form id="f-cuenta" class="cuenta__f" data-modo="${nueva ? "nueva" : "entrar"}" novalidate><div class="fields">
        ${nueva ? campo("cu-nombre", "Nombre y apellido", 'autocomplete="name"', "Escribí tu nombre y apellido.") : ""}
        ${campo("cu-email", "Email", 'type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"', "Escribí un email válido.")}
        ${nueva ? campo("cu-cel", "Celular", 'type="tel" inputmode="tel" autocomplete="tel" placeholder="261 555 1234"', "Escribí tu celular, con la característica.") : ""}
        ${campoClave(nueva ? "new-password" : "current-password")}
      </div>${nueva ? casillas() : ""}
      <button type="submit" class="btn btn--ink btn--block">${nueva ? "Crear cuenta" : "Entrar"}</button>
      ${nueva ? "" : `<button type="button" class="link cuenta__olvido" data-act="cu-olvido">¿Te olvidaste la contraseña?</button>`}
      <p class="cuenta__msg" id="cu-msg" role="alert" hidden></p></form>${nueva ? LEGAL : ""}</div>`;
  }
  // Volver a dibujar la caja de la cuenta (y lo que depende de ella) en la pantalla abierta
  function pintarCuenta() {
    badges();
    if (S.page === "pago") renderPago();
    else if (S.page === "turnos") renderTurnos();
  }
  // Con la cuenta abierta: sus turnos
  async function aplicar(r) {
    S.yo = (r && r.ok && r.cliente) || null;
    S.email = r && r.ok && !r.cliente && r.email ? r.email : "";
    if (S.yo || S.email) { S.pend = ""; store.set("tuvo-cuenta", true); }
    if (S.yo) { const t = await CU.turnos(); S.turnos = t.ok ? t.lista.filter((x) => venue(x.vid) || x.lugar) : []; }
    else S.turnos = [];
    pintarCuenta();
  }
  const avisoCu = (texto, ok = false) => {
    const m = $("#cu-msg"); if (!m) return toast(texto);
    m.textContent = texto; m.hidden = false; m.classList.toggle("is-ok", ok);
  };
  const marcar = (id, bad) => { const f = $("#" + id); if (!f) return bad; f.classList.toggle("is-invalid", bad); f.setAttribute("aria-invalid", String(bad)); const e = $("#" + id + "-e"); if (e) e.hidden = !bad; return bad; };
  const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const valCuenta = (modo) => {
    const v = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
    const malos = [];
    if (modo !== "entrar" && marcar("cu-nombre", v("cu-nombre").length < 2)) malos.push("cu-nombre");
    if (modo !== "datos" && marcar("cu-email", !emailOk(v("cu-email")))) malos.push("cu-email");
    if (modo !== "entrar" && marcar("cu-cel", v("cu-cel").replace(/\D/g, "").length < 8)) malos.push("cu-cel");
    if (modo !== "datos" && marcar("cu-clave", modo === "nueva" ? $("#cu-clave").value.length < 8 : !$("#cu-clave").value)) malos.push("cu-clave");
    if (modo !== "entrar" && marcar("cu-acepto", !$("#cu-acepto").checked)) malos.push("cu-acepto");
    return malos;
  };
  let enviando = false;
  async function enviarCuenta(form) {
    if (enviando) return;
    const modo = form.dataset.modo, malos = valCuenta(modo);
    if (malos.length) { $("#" + malos[0]).focus(); return; }
    const v = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
    const btn = $("button[type=submit]", form), txt = btn.textContent;
    enviando = true; btn.disabled = true; btn.textContent = modo === "nueva" ? "Creando tu cuenta…" : modo === "entrar" ? "Entrando…" : "Guardando…";
    const fin = () => { enviando = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = txt; } };
    let r;
    if (modo === "nueva") r = await CU.registrar({ nombre: v("cu-nombre"), email: v("cu-email").toLowerCase(), celular: v("cu-cel"), clave: $("#cu-clave").value, promos: $("#cu-promos").checked });
    else if (modo === "entrar") r = await CU.ingresar(v("cu-email").toLowerCase(), $("#cu-clave").value);
    else r = await CU.guardarDatos({ nombre: v("cu-nombre"), celular: v("cu-cel"), promos: $("#cu-promos").checked });
    fin();
    if (!r.ok) {
      if (r.error === "existe") { // que entre con esa cuenta, con el email ya escrito
        const correo = v("cu-email"); S.modoCu = "entrar"; pintarCuenta();
        if ($("#cu-email")) { $("#cu-email").value = correo; $("#cu-clave").focus(); }
      }
      if (r.error === "sin-confirmar") { S.pend = v("cu-email").toLowerCase(); pintarCuenta(); }
      return avisoCu(msj(r.error));
    }
    if (r.confirmar) { S.pend = v("cu-email").toLowerCase(); pintarCuenta(); $("#cuenta").scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" }); return; }
    await aplicar(r);
    if (S.yo) toast(modo === "nueva" ? `¡Listo, ${S.yo.nombre.split(" ")[0]}! Tu cuenta está creada.` : modo === "entrar" ? `Hola, ${S.yo.nombre.split(" ")[0]}.` : "Tus datos quedaron guardados.");
    if (S.page === "pago" && S.yo && vigente()) requestAnimationFrame(() => { const b = $(".chk__side [data-act=pay]"); if (b && innerWidth >= 940) b.focus({ preventScroll: true }); });
  }
  // Recién confirmó el email (en otra pestaña o en este mismo navegador): se fija si ya hay sesión
  async function yaConfirme() {
    const r = await CU.iniciar();
    if (r.ok && (r.cliente || r.email)) return aplicar(r);
    // lo confirmó en otro celular o compu (o todavía no): que entre con su email y su contraseña
    const correo = S.pend; S.pend = ""; S.modoCu = "entrar"; pintarCuenta();
    if ($("#cu-email")) { $("#cu-email").value = correo; $("#cu-clave").focus(); }
    avisoCu("Entrá con tu email y tu contraseña. Si todavía no confirmaste, tocá el botón del mail que te mandamos.");
  }
  // ¿Pagar sin cuenta? Primero la cuenta
  function pedirCuenta() {
    const caja = $("#cuenta"); if (!caja) return;
    caja.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    avisoCu(S.pend ? "Confirmá tu email para pagar la seña." : S.email ? "Completá tus datos para pagar la seña." : S.modoCu === "nueva" ? "Primero creá tu cuenta (o entrá con la tuya) y después pagás la seña." : "Primero entrá con tu cuenta y después pagás la seña.");
    const f = $("#cuenta input"); if (f) setTimeout(() => f.focus({ preventScroll: true }), reduce ? 0 : 350);
  }
  async function olvido() {
    const correo = ($("#cu-email") || { value: "" }).value.trim();
    if (marcar("cu-email", !emailOk(correo))) { avisoCu("Escribí tu email y te mandamos un link para elegir otra contraseña."); return $("#cu-email").focus(); }
    const r = await CU.recuperar(correo.toLowerCase());
    avisoCu(r.ok ? `Te mandamos un mail a ${correo} con un link para elegir otra contraseña.` : msj(r.error), r.ok);
  }
  async function salirCuenta() {
    await CU.salir();
    S.yo = null; S.email = ""; S.pend = ""; S.turnos = []; S.modoCu = "entrar";
    pintarCuenta(); toast("Cerraste tu sesión.");
  }

  // ---------- Pagar (simulado: en la versión real, acá se abre Mercado Pago) ----------
  const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let pagando = false;
  async function pagar() {
    const r = vigente(); if (!r) return vencer();
    if (!S.yo) return pedirCuenta();
    if (pagando) return;
    pagando = true;
    clearInterval(tic); tic = null; // ya está pagando: el tiempo no corre más
    const v = venue(r.vid), svc = v.svcs.find((s) => s.id === r.svc) || v.svcs[0];
    const ov = document.createElement("div"); ov.className = "mpov"; ov.setAttribute("role", "alertdialog"); ov.setAttribute("aria-live", "polite");
    ov.innerHTML = `<div class="mpov__in"><div class="spin"></div><h2>Te llevamos a Mercado Pago</h2><p>Un momento, estamos preparando el pago de tu seña.</p></div>`;
    document.body.appendChild(ov);
    const { vence, ...turno } = r;
    const pedido = CU.reservar({ ...turno, lugar: v.name, zona: ZONAS[v.zona], rubro: RUBROS[v.rubro].n, servicio: svc.n });
    await espera(reduce ? 300 : 1500);
    const res = await pedido;
    if (!res.ok) {
      ov.remove(); pagando = false;
      if (res.error === "ocupado" || res.error === "pasado" || res.error === "no-disponible") { // ese horario ya no se puede: a elegir otro
        S.res = null; guardar(); reloj(); toast(msj(res.error));
        return go("ficha", { v: r.vid, dia: Math.max(0, Math.min(6, diaDe(r.key))) }, true);
      }
      reloj(); // el turno sigue guardado con el tiempo que le quedaba
      if (res.error === "sesion" || res.error === "sin-datos") { S.yo = null; await aplicar(await CU.iniciar()); }
      return avisoCu(msj(res.error));
    }
    ov.innerHTML = `<div class="mpov__in"><div class="okc"><svg class="icon"><use href="#i-check"/></svg></div><h2>¡Turno confirmado!</h2><p>${v.real ? "Bookea está en prueba: no se cobró la seña." : "Es una demo: no se cobró nada."}</p></div>`;
    if (v.real) v.ocup.add(`${r.rec}|${r.fa}|${r.min}`); // ya está en su agenda
    await espera(reduce ? 300 : 1200);
    S.turnos = S.turnos.concat(res.turno); S.res = null; S.vencida = null; guardar(); reloj();
    ov.remove(); pagando = false;
    go("turnos", { nuevos: [res.turno.id] }); toast(v.real ? "Turno confirmado. Bookea está en prueba: no se cobró la seña." : "Turno confirmado (demo, sin cobro).");
  }

  // ---------- Mis turnos ----------
  const cuando = (it) => new Date(`${it.key}T${it.t}:00-03:00`);
  function renderTurnos(st = {}) {
    const root = $("#turnos-root"), lista = S.turnos.slice().sort((a, b) => cuando(a) - cuando(b));
    // abajo, siempre, turnos libres del último rubro reservado: la pantalla no queda vacía
    const ult = lista.length ? lugarDeTurno(lista[lista.length - 1]) : null, rubro = ult && SECCIONES[secDe(ult.rubro)].rubros.includes(ult.rubro) ? ult.rubro : S.rubro;
    const mas = masLibres(rubro, `Reservá otro: ${RUBROS[rubro].n.toLowerCase()}`);
    // Sin cuenta abierta: para entrar (o, si todavía no tiene, cómo se crea)
    if (!S.yo) {
      root.innerHTML = `<h1>Mis turnos</h1><p class="sub">${S.pend ? "Confirmá tu email para entrar." : S.email ? "Completá tus datos para ver y reservar turnos." : "Entrá con tu cuenta para ver tus turnos."}</p>
        <div class="mt mt--fuera">${cuentaHTML("turnos")}
          <aside class="mt__aside"><h2>¿Todavía no tenés cuenta?</h2><p>Se crea cuando reservás tu primer turno: elegís el horario y, antes de pagar la seña, ponés tu nombre, tu email, tu celular y una contraseña.</p>
            <button type="button" class="btn btn--primary" data-go="home" data-focus="pick">Buscar turnos</button>
            <p class="mt__neg">¿Tenés un negocio? <a class="link" href="admin.html">Entrá al panel</a></p></aside></div>${mas}`;
      return;
    }
    const cuenta = miCuentaHTML();
    if (!lista.length) { root.innerHTML = `<h1>Mis turnos</h1><p class="sub">Acá vas a ver tus turnos confirmados.</p><div class="mt"><div class="mt__lista"><div class="empty"><h3>Todavía no tenés turnos</h3><p>Reservá el primero en segundos.</p><button type="button" class="btn btn--primary" data-go="home" data-focus="pick">Buscar turnos</button></div></div>${cuenta}</div>${mas}`; return; }
    const ahora = Date.now();
    const listo = st.nuevos ? `<div class="okban"><span class="okban__ic"><svg class="icon" aria-hidden="true"><use href="#i-check"/></svg></span><div><b>¡Listo, tu turno está confirmado!</b><span>Te mandamos los datos por mail a ${esc(S.yo.email)}. El resto lo pagás en el lugar.</span></div><button type="button" class="btn btn--ink btn--s" data-go="home" data-focus="pick">Reservar otro turno</button></div>` : "";
    root.innerHTML = `<h1>Mis turnos</h1><p class="sub">Tus turnos confirmados, con la seña ya paga.</p>${listo}<div class="mt"><div class="mt__lista">` + lista.map((it) => {
      const v = lugarDeTurno(it), R = RUBROS[v.rubro], svc = v.svcs.find((s) => s.id === it.svc) || v.svcs[0], pasado = cuando(it).getTime() + 3600e3 < ahora;
      const txt = encodeURIComponent(`Turno en ${v.name}: ${keyLabel(it.key)} ${it.t} hs (${it.unit}). Código ${it.code}.`);
      return `<article class="tcard${st.nuevos && st.nuevos.includes(it.id) ? " is-new" : ""}"><div class="tcard__h"><span class="code">${it.code}</span><span class="status"${pasado ? ' style="color:var(--ink-500);background:var(--ink-100)"' : ""}>${pasado ? "Finalizado" : "Confirmado"}</span></div>
        <div class="tcard__b"><div><h3>${esc(v.name)}</h3><div class="tcard__when">${keyLabel(it.key)} · ${it.t}–${it.end}</div><p>${R.n}${v.rubro === "barberia" ? " · " + svc.n : ""} · ${esc(it.unit)} · ${ZONAS[v.zona]}</p></div>
        <div class="tcard__act"><a class="btn btn--line btn--s" href="https://wa.me/?text=${txt}" target="_blank" rel="noopener"><svg class="icon"><use href="#i-wa"/></svg>Compartir</a>${pasado ? "" : `<button type="button" class="btn btn--line btn--s" data-act="cancel" data-id="${it.id}">Cancelar</button>`}</div></div>
        <div class="tcard__money"><span>Seña pagada <b>${money(it.sena)}</b></span><span>A pagar en el lugar <b>${money(it.precio - it.sena)}</b></span></div></article>`;
    }).join("") + `</div>${cuenta}</div>` + mas;
  }
  // Tu cuenta, al lado de los turnos: ver, corregir o borrar tus datos (Ley 25.326), contraseña y salir
  const miCuentaHTML = () => {
    const y = S.yo;
    return `<aside class="panel micuenta" aria-labelledby="mc-t">
      <h2 id="mc-t">Tu cuenta</h2>
      <div class="yo"><span class="yo__av" aria-hidden="true">${esc(iniciales(y.nombre))}</span><div class="yo__t"><b>${esc(y.nombre)}</b><span>${esc(y.email)}</span>${y.celular ? `<span>${esc(y.celular)}</span>` : ""}</div></div>
      <p class="micuenta__promo"><span class="dot${y.promos ? "" : " dot--off"}"></span>${y.promos ? "Recibís promociones de Bookea por mail." : "No recibís promociones de Bookea."}</p>
      <div class="micuenta__acts"><button type="button" class="btn btn--line btn--s" data-act="cu-editar">Corregir mis datos</button>${CU.modo === "nube" ? `<button type="button" class="btn btn--line btn--s" data-act="cu-clave">Cambiar contraseña</button>` : ""}<button type="button" class="btn btn--line btn--s" data-act="cu-salir">Salir</button></div>
      <p class="micuenta__pie"><a class="link" href="privacidad.html" target="_blank" rel="noopener">Cómo cuidamos tus datos</a><button type="button" class="link link--peligro" data-act="cu-borrar">Borrar mi cuenta</button></p>
    </aside>`;
  };
  function cancelar(id) {
    const it = S.turnos.find((x) => x.id === id); if (!it) return;
    const horas = (cuando(it) - Date.now()) / 3600e3, devuelve = it.devuelve !== false && horas > it.cancel;
    const dlg = $("#dlg");
    $("#dlg-t").textContent = "¿Cancelar este turno?";
    $("#dlg-p").textContent = it.devuelve === false ? `En este lugar la seña no se devuelve: la seña de ${money(it.sena)} queda para el negocio y el turno se libera.` : devuelve ? `Cancelás con más de ${it.cancel} h de anticipación: la seña de ${money(it.sena)} se devuelve y el turno se libera.` : `Faltan menos de ${it.cancel} h: la seña de ${money(it.sena)} queda para el negocio y el turno se libera.`;
    $("#dlg-si").textContent = "Cancelar turno";
    $("#dlg-si").onclick = async () => {
      const b = $("#dlg-si"); b.disabled = true;
      const r = await CU.cancelar(id);
      b.disabled = false; dlg.close();
      if (!r.ok && r.error !== "no-existe") return toast(msj(r.error));
      S.turnos = S.turnos.filter((x) => x.id !== id); badges(); renderTurnos();
      toast(!r.ok ? msj(r.error) : r.devuelve ? "Turno cancelado. La seña vuelve." : "Turno cancelado.");
    };
    $("#dlg-no").onclick = () => dlg.close();
    dlg.showModal();
  }
  // Borrar la cuenta: se van los datos y los turnos (la base lo hace; en modo de prueba, este navegador)
  function borrarCuenta() {
    const dlg = $("#dlg");
    $("#dlg-t").textContent = "¿Borrar tu cuenta?";
    $("#dlg-p").textContent = `Se borran tus datos (${S.yo.email}) y todos tus turnos${S.turnos.length ? ", también los que tenés por delante" : ""}. No se puede deshacer.`;
    $("#dlg-si").textContent = "Borrar mi cuenta";
    $("#dlg-si").onclick = async () => {
      const b = $("#dlg-si"); b.disabled = true;
      const r = await CU.borrar();
      b.disabled = false; dlg.close();
      if (!r.ok) return toast(msj(r.error));
      S.yo = null; S.email = ""; S.turnos = []; S.modoCu = "nueva";
      try { localStorage.removeItem("bookea:tuvo-cuenta"); } catch {}
      pintarCuenta(); toast("Borramos tu cuenta y tus datos.");
    };
    $("#dlg-no").onclick = () => dlg.close();
    dlg.showModal();
  }
  // Corregir nombre, celular y promociones (el email es el de la cuenta: no se cambia acá)
  function editarDatos() {
    const dlg = $("#dlg-datos");
    $("#dd-nombre").value = S.yo.nombre; $("#dd-cel").value = S.yo.celular; $("#dd-promos").checked = !!S.yo.promos;
    $("#dd-email").textContent = S.yo.email;
    ["dd-nombre", "dd-cel"].forEach((id) => marcar(id, false)); $("#dd-msg").hidden = true;
    dlg.showModal();
  }
  async function guardarDatos(form) {
    const nom = $("#dd-nombre").value.trim(), cel = $("#dd-cel").value.trim();
    const malos = [marcar("dd-nombre", nom.length < 2) && "dd-nombre", marcar("dd-cel", cel.replace(/\D/g, "").length < 8) && "dd-cel"].filter(Boolean);
    if (malos.length) return $("#" + malos[0]).focus();
    const btn = $("button[type=submit]", form); btn.disabled = true;
    const r = await CU.guardarDatos({ nombre: nom, celular: cel, promos: $("#dd-promos").checked });
    btn.disabled = false;
    if (!r.ok) { $("#dd-msg").textContent = msj(r.error); $("#dd-msg").hidden = false; return; }
    S.yo = r.cliente; $("#dlg-datos").close(); pintarCuenta(); toast("Tus datos quedaron guardados.");
  }
  // Volvió con el link de "elegí una contraseña nueva" (modo nube)
  function pedirClaveNueva() { const d = $("#dlg-clave"); if (d && !d.open) { $("#dc-msg").hidden = true; d.showModal(); } }
  async function guardarClave(form) {
    const f = $("#dc-clave");
    if (marcar("dc-clave", f.value.length < 8)) return f.focus();
    const btn = $("button[type=submit]", form); btn.disabled = true;
    const r = await CU.ponerClave(f.value);
    btn.disabled = false;
    if (!r.ok) { $("#dc-msg").textContent = msj(r.error); $("#dc-msg").hidden = false; return; }
    $("#dlg-clave").close(); f.value = "";
    await aplicar(r); toast("Listo: tu contraseña nueva quedó guardada.");
    if (vigente() && S.page !== "pago") go("pago");
  }

  // ---------- Detalles ----------
  function badges() {
    const n = S.turnos.filter((t) => cuando(t).getTime() + 3600e3 >= Date.now()).length;
    $$('[data-count="turnos"]').forEach((b) => {
      if (b.textContent !== String(n) && n > 0) { b.classList.remove("is-sube"); void b.offsetWidth; b.classList.add("is-sube"); }
      b.textContent = n; b.hidden = !n;
    });
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
        case "sec": elegirSeccion(d.k); break;
        case "dia-h": S.dia = +d.i; refrescar(); break;
        case "franja-h": S.franja = d.k; refrescar(); break;
        case "zona-h": S.zona = d.k; refrescar(); break;
        case "techada-h": S.techada = !S.techada; refrescar(); break;
        case "svc-h": S.svc = d.k; refrescar(); break;
        case "reset-f": S.zona = ""; S.franja = ""; S.techada = false; S.svc = ""; S.dia = 0; refrescar(); break;
        case "ficha": go("ficha", { v: d.v, dia: d.dia !== undefined ? +d.dia : null }); break;
        case "open-slot": go("ficha", { v: d.v, dia: +d.dia, t: d.t }); break;
        case "back": e.preventDefault(); if (S.nav > 0) history.back(); else go("home", { restore: true }); break;
        case "f-dia": {
          S.f.dia = +d.i; S.f.abierto = true; renderBook();
          const pn = $("#book-panel");
          if (pn) { pn.classList.add("aparece"); pn.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" }); }
          break;
        }
        case "f-slot": {
          S.f.t = d.t; S.f.unit = "any"; renderBook();
          // la elección de cancha no queda abajo del aviso verde ni fuera de la pantalla
          const el = $("#f-eleccion"), ir = $("#ir-pagar");
          if (el) requestAnimationFrame(() => {
            const tope = innerHeight - (ir && !ir.hidden ? ir.offsetHeight + 28 : 12), abajo = el.getBoundingClientRect().bottom;
            if (abajo > tope) window.scrollBy({ top: abajo - tope, behavior: reduce ? "auto" : "smooth" });
          });
          break;
        }
        case "f-unit": S.f.unit = d.u; renderBook(); break;
        case "reservar": reservar(); break;
        case "pay": pagar(); break;
        case "cambiar": { const x = vigente(); if (x) go("ficha", { v: x.vid, dia: diaDe(x.key), t: x.t }); break; }
        case "otra-vez": otraVez(); break;
        case "cancel": cancelar(d.id); break;
        // la cuenta del cliente
        case "cu-modo": {
          const correo = $("#cu-email") ? $("#cu-email").value : "";
          S.modoCu = d.k; pintarCuenta();
          if ($("#cu-email")) $("#cu-email").value = correo; // lo que ya escribió no se pierde al cambiar
          const f = $(S.modoCu === "nueva" ? "#cu-nombre" : "#cu-email"); if (f && !e.detail) f.focus();
          break;
        }
        case "cu-ver": {
          const f = $("#cu-clave"), ver = f.type === "password";
          f.type = ver ? "text" : "password"; t.setAttribute("aria-pressed", String(ver));
          t.textContent = ver ? "Ocultar" : "Ver"; t.setAttribute("aria-label", ver ? "Ocultar la contraseña" : "Mostrar la contraseña");
          break;
        }
        case "cu-olvido": olvido(); break;
        case "cu-ya": yaConfirme(); break;
        case "cu-otro": S.pend = ""; S.modoCu = "nueva"; pintarCuenta(); break;
        case "cu-salir": salirCuenta(); break;
        case "cu-editar": editarDatos(); break;
        case "cu-clave": CU.recuperar(S.yo.email).then((r) => toast(r.ok ? `Te mandamos un mail a ${S.yo.email} para elegir otra contraseña.` : msj(r.error))); break;
        case "cu-borrar": borrarCuenta(); break;
        case "dlg-cerrar": t.closest("dialog").close(); break;
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
  document.addEventListener("submit", (e) => {
    const id = e.target.id;
    if (id === "finder") { e.preventDefault(); go("resultados"); }
    if (id === "f-cuenta") { e.preventDefault(); enviarCuenta(e.target); }
    if (id === "f-datos") { e.preventDefault(); guardarDatos(e.target); }
    if (id === "f-clave") { e.preventDefault(); guardarClave(e.target); }
  });
  document.addEventListener("change", (e) => { if (e.target.id === "r-zona") { S.zona = e.target.value; renderResultados(); }
    if (e.target.id === "f-zona") S.zona = e.target.value;
    if (e.target.id === "f-dia") S.dia = +e.target.value;
    if (e.target.id === "f-franja") S.franja = e.target.value; if (e.target.id === "f-svc") { S.f.svc = e.target.value; renderBook(); } });
  // El aviso de un campo se va apenas se corrige
  document.addEventListener("input", (e) => {
    const f = e.target;
    if (!/^(cu|dd|dc)-/.test(f.id) || f.getAttribute("aria-invalid") !== "true") return;
    const v = f.value.trim();
    const bien = f.id.endsWith("nombre") ? v.length >= 2 : f.id.endsWith("cel") ? v.replace(/\D/g, "").length >= 8 : f.id.endsWith("email") ? emailOk(v)
      : f.id === "cu-clave" ? (S.modoCu === "nueva" ? f.value.length >= 8 : !!f.value) : f.id === "dc-clave" ? f.value.length >= 8 : f.id === "cu-acepto" ? f.checked : true;
    if (bien) marcar(f.id, false);
  });
  document.addEventListener("change", (e) => { if (e.target.id === "cu-acepto" && e.target.checked) marcar("cu-acepto", false); });

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
  badges(); reloj(); // si quedó un turno guardado de antes, sigue corriendo su tiempo
  // En pantallas táctiles, que :active (el apretado de botones y tarjetas) funcione también en iPhone
  document.addEventListener("touchstart", () => {}, { passive: true });
  // Links que llegan con datos: resultados de un rubro, o una sección de la parte para negocios
  const inicial = (() => {
    const q = new URLSearchParams(location.search), h = location.hash.slice(1);
    if (RUBROS[q.get("rubro")]) {
      S.rubro = S.hs = q.get("rubro"); S.sec = secDe(S.rubro); S.ult[S.sec] = S.rubro;
      if (ZONAS[q.get("zona")]) S.zona = q.get("zona");
      const d = parseInt(q.get("dia"), 10); if (d >= 0 && d < 7) S.dia = d;
      if (q.get("franja") && FRANJAS[q.get("franja")]) S.franja = q.get("franja");
      return { page: "resultados" };
    }
    if (["sumate", "como-funciona", "funciones", "preguntas"].includes(h)) return { page: "negocios", ir: h };
    if (h === "pick" || h === "reservar") return { page: "home", ir: "pick" };
    if (h === "mis-turnos") return { page: "turnos" }; // el botón de los mails de cada turno
    return { page: "home" };
  })();
  try { history.scrollRestoration = "manual"; history.replaceState({ page: inicial.page }, "", LIMPIAS ? (RUTA ? location.pathname : "/") : /^https?:$/.test(location.protocol) ? location.pathname.replace(/\/index\.html$/, "/") : location.pathname); } catch {}
  show({ page: inicial.page });
  if (inicial.ir) requestAnimationFrame(() => scrollTo(inicial.ir));
  // bookea.ar/nombre: la página del negocio; bookea.ar/nombre/reservar: sus turnos. Apenas llega de la base.
  if (LINK) cargaReales.then(() => {
    const v = venue("n-" + LINK) || venue(LINK);
    if (v) go(LINK_VER, { v: v.id }, true);
    else { go("home", {}, true); toast("No encontramos ese lugar. Buscá entre los turnos libres."); }
  });
  // Si llegaron negocios de verdad para la lista, se suman a lo que se ve
  cargaReales.then(() => { if (VENUES.some((v) => v.real)) { if (S.page === "home") renderHome(); else if (S.page === "resultados") renderResultados(); } });
  // Un link con # a la misma página (por ejemplo bookea.ar/#sumate con el sitio ya abierto) no recarga:
  // se resuelve acá, reemplazando la entrada del historial para que "atrás" no quede en el mismo lugar
  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    const page = ["sumate", "como-funciona", "funciones", "preguntas"].includes(h) ? "negocios" : h === "pick" || h === "reservar" ? "home" : h === "mis-turnos" ? "turnos" : "";
    if (!page) return;
    go(page, {}, true);
    if (page !== "turnos") requestAnimationFrame(() => scrollTo(h === "reservar" ? "pick" : h));
  });

  // ---------- La cuenta del cliente, al abrir la página ----------
  // Si quedó abierta en este navegador, se trae con sus turnos. Si se llega desde un link de un mail:
  // "confirmada" (recién confirmó su email) → a pagar el turno guardado, o a Mis turnos; "clave" → elegir otra contraseña.
  CU.alRecuperar(pedirClaveNueva);
  CU.iniciar().then(async (r) => {
    await aplicar(r);
    if (CU.vuelta === "confirmada") {
      if (S.yo) { toast("Tu email quedó confirmado."); if (vigente()) go("pago", {}, true); else if (S.page !== "turnos") go("turnos", {}, true); }
      else { toast(r.linkVencido ? "Ese link ya se usó o venció. Entrá con tu email y tu contraseña." : "Tu email quedó confirmado. Entrá con tu email y tu contraseña."); S.modoCu = "entrar"; go(vigente() ? "pago" : "turnos", {}, true); }
    }
    if (CU.vuelta === "clave") {
      if (S.yo || S.email) pedirClaveNueva();
      else if (r.linkVencido) { toast("Ese link ya se usó o venció. Pedí otro desde «¿Te olvidaste la contraseña?»."); go("turnos", {}, true); }
    }
  });
})();
