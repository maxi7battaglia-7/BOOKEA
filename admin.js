// Bookea — panel del negocio.
// Vista previa sin servidor: las cuentas, el negocio y las reservas se guardan en este navegador (localStorage).
// Las contraseñas se guardan como hash SHA-256 con sal, nunca en texto. En la versión real todo esto vive en el servidor.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const plata = (n) => "$ " + Math.round(n).toLocaleString("es-AR");
  const compacto = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
  const pad2 = (n) => String(n).padStart(2, "0");
  const pct = (n) => Math.round(n * 100) + " %";
  const ico = (n, cls = "") => `<svg class="ico${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const tilde = () => `<svg class="tilde dibujar" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19.5 7"/></svg>`;
  const iniciales = (t) => String(t || "").replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "B";

  const CLAVE = "bookea:panel:v1", CLAVE_SES = "bookea:panel:sesion", CLAVE_VISTA = "bookea:panel:vista";
  const local = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const sesion = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch {} },
  };

  // ---------- Fechas, en hora de Argentina ----------
  const TZ = "America/Argentina/Buenos_Aires";
  const ahora = () => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(new Date()).map((x) => [x.type, x.value]));
      return { fecha: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
    } catch { const d = new Date(); return { fecha: d.toISOString().slice(0, 10), min: d.getHours() * 60 + d.getMinutes() }; }
  };
  const aD = (iso) => new Date(iso + "T12:00:00Z");
  const aISO = (d) => d.toISOString().slice(0, 10);
  const sumar = (iso, n) => { const d = aD(iso); d.setUTCDate(d.getUTCDate() + n); return aISO(d); };
  const dow = (iso) => aD(iso).getUTCDay();
  const lunesDe = (iso) => sumar(iso, -((dow(iso) + 6) % 7));
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const DIAS_C = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const largo = (iso) => { const d = aD(iso); return mayus(`${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`); };
  const corto = (iso) => { const d = aD(iso); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
  const aMin = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
  const aHora = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
  const diasEntre = (a, b) => Math.round((aD(b) - aD(a)) / 864e5);

  // ---------- Reglas del negocio ----------
  const horarioDe = (neg, iso) => neg.horario[dow(iso)];
  const slotsDe = (neg, iso) => {
    const h = horarioDe(neg, iso);
    if (!h || h.cerrado) return [];
    const a = aMin(h.abre); let c = aMin(h.cierra); if (c <= a) c += 1440;
    const out = [];
    for (let t = a; t + neg.duracion <= c; t += neg.duracion) out.push(t);
    return out;
  };
  const precioDe = (neg, min) => {
    const m = min % 1440;
    for (const f of neg.franjas) {
      const d = aMin(f.desde); let h = aMin(f.hasta); if (h <= d) h += 1440;
      const mm = m < d ? m + 1440 : m;
      if (mm >= d && mm < h) return +f.precio || 0;
    }
    return neg.franjas.length ? +neg.franjas[neg.franjas.length - 1].precio || 0 : 0;
  };
  const senaDe = (neg, precio) => Math.round((precio * neg.senaPct) / 100 / 100) * 100;
  const ocupa = (r) => r.estado !== "cancelada";
  const esTurno = (r) => r.estado !== "bloqueo";
  const ingreso = (r) =>
    r.estado === "jugada" ? r.precio
    : r.estado === "ausente" ? r.sena
    : r.estado === "cancelada" ? (r.retenida ? r.sena : 0)
    : r.estado === "confirmada" ? r.sena : 0;
  const ETQ = { confirmada: "Seña cobrada", jugada: "Pagado", ausente: "No vino", cancelada: "Cancelado", bloqueo: "Bloqueado" };
  const etiqueta = (r) => (r.estado === "confirmada" && !r.sena ? "Sin seña" : ETQ[r.estado]);
  const ORIGEN = { link: "por el link", telefono: "por teléfono", fijo: "turno fijo" };
  const unidad = (neg) => (/p[aá]del|f[uú]tbol|tenis|cancha|v[oó]ley|b[aá]squet/i.test(neg.rubro) ? "Cancha" : "Lugar");

  // ---------- Datos de ejemplo ----------
  const azar = (semilla) => () => { semilla |= 0; semilla = (semilla + 0x6d2b79f5) | 0; let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const NOMBRES = ["Martina G.", "Nico R.", "Sofi L.", "Juan P.", "Agus M.", "Caro B.", "Lucas F.", "Vale T.", "Tomi S.", "Flor D.", "Mati A.", "Cami R.", "Fede C.", "Juli N.", "Pau V.", "Santi O.", "Ana K.", "Bruno E.", "Meli H.", "Gonza Z.", "Lu P.", "Joaco I.", "Rocío M.", "Maxi B."];
  const CLIENTES = NOMBRES.map((nombre, i) => ({ nombre, wa: `2622 4${pad2((i * 37) % 100)} ${1000 + ((i * 7919) % 9000)}` }));
  const FIJOS = [
    { nombre: "Los del martes", wa: "2622 455 2010", dia: 2, hora: "21:00", rec: "r1" },
    { nombre: "Los del jueves", wa: "2622 433 7788", dia: 4, hora: "19:30", rec: "r2" },
  ];
  const negocioDemo = () => ({
    id: "n1", nombre: "Los Álamos Pádel", rubro: "Pádel", ciudad: "Tunuyán", direccion: "Av. San Martín 1450",
    whatsapp: "2622 55 1234", slug: "losalamos", foto: "", mapa: "",
    descripcion: "Tres canchas de pádel: dos de blindex y una techada para los días de lluvia. Vestuarios con duchas, estacionamiento y buffet. Si no tenés paleta, te prestamos una.",
    recursos: [{ id: "r1", nombre: "Cancha 1", detalle: "Blindex" }, { id: "r2", nombre: "Cancha 2", detalle: "Blindex" }, { id: "r3", nombre: "Cancha 3", detalle: "Techada" }],
    duracion: 90,
    horario: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ abre: d === 0 ? "10:30" : "09:00", cierra: "00:30", cerrado: false })),
    franjas: [{ desde: "09:00", hasta: "17:00", precio: 24000 }, { desde: "17:00", hasta: "20:00", precio: 28000 }, { desde: "20:00", hasta: "00:30", precio: 34000 }],
    senaPct: 25, cancelarHoras: 6, devolverSena: true,
  });
  const reservasDemo = (neg) => {
    const r = azar(20261105), hoy = ahora(), out = [];
    let n = 1;
    for (let d = -42; d <= 14; d++) {
      const f = sumar(hoy.fecha, d), wd = dow(f);
      for (const t of slotsDe(neg, f)) for (const rec of neg.recursos) {
        const fijo = FIJOS.find((x) => x.dia === wd && aMin(x.hora) === t && x.rec === rec.id);
        let p = t >= 1080 ? 0.82 : t >= 900 ? 0.45 : 0.2;
        if (wd === 0 || wd === 6) p += 0.12;
        if (d > 2) p *= Math.max(0.2, 0.8 - (d - 2) * 0.05);
        if (!fijo && r() > p) continue;
        const cli = fijo || CLIENTES[Math.floor(r() * CLIENTES.length)];
        const precio = precioDe(neg, t);
        const origen = fijo ? "fijo" : r() < 0.75 ? "link" : "telefono";
        const sena = origen === "telefono" && r() < 0.5 ? 0 : senaDe(neg, precio);
        const pasado = f < hoy.fecha || (f === hoy.fecha && t + neg.duracion <= hoy.min);
        let estado = "confirmada", retenida = false;
        if (pasado && f === hoy.fecha) {
          r(); // hoy: el dueño todavía no marcó si pagaron o faltaron
        } else if (pasado) {
          const x = r();
          estado = x < 0.86 ? "jugada" : x < 0.93 ? "ausente" : "cancelada";
          if (estado === "cancelada") retenida = r() < 0.4;
        } else if (r() < 0.03) estado = "cancelada";
        if (estado === "ausente" && !sena) estado = "jugada";
        out.push({ id: "b" + n++, recurso: rec.id, fecha: f, hora: t, cliente: cli.nombre, wa: cli.wa, precio, sena, estado, retenida, origen, nota: "" });
      }
    }
    // un bloqueo de ejemplo: torneo el sábado que viene en la cancha 3
    const sab = sumar(hoy.fecha, ((6 - dow(hoy.fecha) + 7) % 7) || 7);
    for (const t of slotsDe(neg, sab).filter((t) => t >= 900 && t < 1170)) {
      const i = out.findIndex((x) => x.fecha === sab && x.hora === t && x.recurso === "r3");
      if (i >= 0) out.splice(i, 1);
      out.push({ id: "b" + n++, recurso: "r3", fecha: sab, hora: t, cliente: "", wa: "", precio: 0, sena: 0, estado: "bloqueo", retenida: false, origen: "", nota: "Torneo del club" });
    }
    return out;
  };

  // ---------- Contraseñas ----------
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const nuevaSal = () => hex(crypto.getRandomValues(new Uint8Array(12)));
  const hashear = async (clave, sal) => {
    const datos = new TextEncoder().encode(`${sal}:${clave}`);
    if (crypto.subtle) return hex(await crypto.subtle.digest("SHA-256", datos));
    let h = 2166136261; for (const b of datos) { h ^= b; h = Math.imul(h, 16777619); } // respaldo si el navegador no tiene crypto.subtle
    return "fnv" + (h >>> 0).toString(16);
  };

  // ---------- Base de datos local ----------
  let DB = null;
  const guardar = () => local.set(CLAVE, JSON.stringify(DB));
  const cargar = async () => {
    try { DB = JSON.parse(local.get(CLAVE)); } catch { DB = null; }
    const hoy = ahora().fecha;
    if (!DB || DB.version !== 1) {
      const neg = negocioDemo(), sal = nuevaSal();
      DB = {
        version: 1, semilla: hoy, demoTocado: false,
        cuentas: [{ usuario: "losalamos", nombre: "Martín", negocio: "n1", sal, hash: await hashear("bookea2026", sal) }],
        negocios: { n1: neg }, reservas: { n1: reservasDemo(neg) }, sig: 100000,
      };
      guardar();
    } else if (!DB.demoTocado && DB.negocios.n1 && diasEntre(DB.semilla, hoy) > 1) {
      // los datos de ejemplo se corren solos al día de hoy mientras nadie los toque
      DB.reservas.n1 = reservasDemo(DB.negocios.n1); DB.semilla = hoy; guardar();
    }
  };
  const nuevoId = () => "b" + DB.sig++;

  // ---------- Sesión ----------
  let YO = null, NEG = null, RES = null;
  const tocar = () => { if (NEG && NEG.id === "n1") DB.demoTocado = true; guardar(); };
  const entrar = (usuario, vistaInicial) => {
    YO = DB.cuentas.find((c) => c.usuario === usuario);
    if (!YO) { sesion.del(CLAVE_SES); return mostrarEntrada(); }
    NEG = DB.negocios[YO.negocio]; RES = DB.reservas[YO.negocio] || (DB.reservas[YO.negocio] = []);
    $("#entrada").hidden = true; $("#panel").hidden = false;
    pintarLado();
    ir(vistaInicial || "agenda", { foco: false });
  };
  const salir = () => {
    sesion.del(CLAVE_SES); sesion.del(CLAVE_VISTA); YO = NEG = RES = null;
    mostrarEntrada(); aviso("Cerraste sesión.");
  };
  const mostrarEntrada = (cual = "ingresar") => {
    $("#panel").hidden = true; $("#entrada").hidden = false;
    $("#f-ingresar").hidden = cual !== "ingresar"; $("#f-registro").hidden = cual !== "registro";
    const f = cual === "ingresar" ? $("#i-usuario") : $("#r-nombre");
    f && f.focus({ preventScroll: true });
  };
  const pintarLado = () => {
    $("#lado-neg").textContent = NEG.nombre;
    $("#lado-det").textContent = [NEG.rubro, NEG.ciudad].filter(Boolean).join(" · ") || "Completá los datos en Mi negocio";
    $("#lado-mono").innerHTML = NEG.foto ? `<img src="${NEG.foto}" alt="" />` : esc(iniciales(NEG.nombre));
    $("#lado-av").textContent = iniciales(YO.nombre).slice(0, 1);
    $("#lado-user").innerHTML = `<b>${esc(YO.nombre)}</b>${esc(YO.usuario)}`;
  };

  // ---------- Aviso ----------
  let avisoT;
  const aviso = (txt) => {
    const a = $("#aviso"); a.innerHTML = tilde() + `<span>${esc(txt)}</span>`; a.classList.add("is-on");
    clearTimeout(avisoT); avisoT = setTimeout(() => a.classList.remove("is-on"), 3200);
  };

  // ---------- Bienvenida al iniciar sesión ----------
  // Como la carga del sitio: la B se arma sobre fondo noche, saluda y la persiana sube mostrando el panel.
  // Dura menos de 3 segundos y se saltea con un toque o una tecla.
  const B_SVG = `<svg class="bienv__b" viewBox="0 0 1000 1000"><defs><mask id="bv-panzas" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">
    <path d="M391,180 H520 A175,175 0 0 1 520,530 H391 Z" fill="#fff"/><path d="M391,426 H545 A197,197 0 0 1 545,820 H391 Z" fill="#fff"/>
    <path d="M391,284 H520 A71,71 0 0 1 520,426 H391 Z" fill="#000"/><path d="M391,530 H545 A93,93 0 0 1 545,716 H391 Z" fill="#000"/></mask></defs>
    <g transform="translate(8,0)"><g mask="url(#bv-panzas)"><polygon class="sp-verde" points="0,0 1000,0 1000,553.38 0,377.06" fill="#1fa08c"/>
    <polygon class="sp-naranja" points="0,377.06 1000,553.38 1000,1000 0,1000" fill="#e4572e"/></g>
    <rect class="sp-asta" x="255" y="180" width="136" height="640" fill="#f5ecd7"/></g></svg>`;
  const bienvenida = (hola, sub, despues) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const v = document.createElement("div");
    v.className = "bienv"; v.setAttribute("aria-hidden", "true");
    v.innerHTML = `<div class="bienv__in">${B_SVG}<p class="bienv__hola">${esc(hola)}</p><p class="bienv__sub">${esc(sub)}</p></div>`;
    document.body.append(v);
    // lectores de pantalla: el saludo se anuncia sin mostrar el aviso
    $("#aviso").textContent = `${hola} ${sub}`;
    let fuera = false;
    const irse = () => {
      if (fuera) return;
      fuera = true;
      document.removeEventListener("keydown", irse);
      v.classList.add("is-out");
      const p = $("#panel");
      if (!reduce) { p.classList.add("is-llega"); setTimeout(() => p.classList.remove("is-llega"), 1400); }
      setTimeout(() => { v.remove(); despues && despues(); }, reduce ? 320 : 800);
    };
    const t = setTimeout(irse, reduce ? 900 : 1900);
    v.addEventListener("click", () => { clearTimeout(t); irse(); });
    document.addEventListener("keydown", irse);
  };

  // ---------- Entrada: ingresar ----------
  let fallos = 0, bloqueadoHasta = 0;
  $$("[data-ver]").forEach((b) => b.addEventListener("click", () => {
    const i = document.getElementById(b.dataset.ver), ver = i.type === "password";
    i.type = ver ? "text" : "password"; b.textContent = ver ? "Ocultar" : "Mostrar"; b.setAttribute("aria-pressed", String(ver));
  }));
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => mostrarEntrada(b.dataset.ir)));
  $("#f-ingresar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#i-msg"), u = $("#i-usuario").value.trim().toLowerCase(), c = $("#i-clave").value;
    if (Date.now() < bloqueadoHasta) { msg.textContent = `Probaste muchas veces. Esperá ${Math.ceil((bloqueadoHasta - Date.now()) / 1000)} segundos.`; return; }
    if (!u || !c) { msg.textContent = "Escribí tu usuario y tu contraseña."; return; }
    const cuenta = DB.cuentas.find((x) => x.usuario === u);
    const ok = cuenta && (await hashear(c, cuenta.sal)) === cuenta.hash;
    if (!ok) {
      fallos++;
      if (fallos >= 5) { bloqueadoHasta = Date.now() + 30000; fallos = 0; msg.textContent = "Probaste muchas veces. Esperá 30 segundos."; }
      else msg.textContent = "El usuario o la contraseña no coinciden.";
      $("#i-clave").select();
      return;
    }
    fallos = 0; msg.textContent = ""; $("#i-clave").value = "";
    entrar(u, "agenda");
    bienvenida(`Hola, ${YO.nombre.split(" ")[0]}.`, NEG.nombre);
  });

  // ---------- Entrada: crear cuenta ----------
  const marcar = (input, errId, texto) => {
    const err = document.getElementById(errId);
    if (texto) { if (texto !== true) err.textContent = texto; err.hidden = false; input.classList.add("is-invalid"); input.setAttribute("aria-invalid", "true"); }
    else { err.hidden = true; input.classList.remove("is-invalid"); input.removeAttribute("aria-invalid"); }
    return !texto;
  };
  const slugDe = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "minegocio";
  const negocioNuevo = (id, nombre, rubro) => {
    let slug = slugDe(nombre), k = 2;
    const usados = new Set(Object.values(DB.negocios).map((n) => n.slug));
    while (usados.has(slug)) slug = slugDe(nombre) + k++;
    const neg = {
      id, nombre, rubro, ciudad: "", direccion: "", whatsapp: "", slug, foto: "", descripcion: "", mapa: "", recursos: [], duracion: 60,
      horario: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ abre: "09:00", cierra: "21:00", cerrado: d === 0 })),
      franjas: [{ desde: "09:00", hasta: "18:00", precio: 10000 }, { desde: "18:00", hasta: "21:00", precio: 12000 }],
      senaPct: 30, cancelarHoras: 12, devolverSena: true,
    };
    neg.recursos = [{ id: "r1", nombre: `${unidad(neg)} 1`, detalle: "" }];
    return neg;
  };
  $("#f-registro").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id) => document.getElementById(id);
    const nombre = v("r-nombre").value.trim(), negocio = v("r-negocio").value.trim(), rubro = v("r-rubro").value.trim();
    const usuario = v("r-usuario").value.trim().toLowerCase(), clave = v("r-clave").value, clave2 = v("r-clave2").value;
    const checks = [
      marcar(v("r-nombre"), "r-nombre-err", !nombre),
      marcar(v("r-negocio"), "r-negocio-err", !negocio),
      marcar(v("r-rubro"), "r-rubro-err", !rubro),
      marcar(v("r-usuario"), "r-usuario-err",
        !/^[a-z0-9._-]{3,20}$/.test(usuario) ? "Usá entre 3 y 20 letras o números, sin espacios."
        : DB.cuentas.some((c) => c.usuario === usuario) ? "Ese usuario ya existe. Probá con otro." : false),
      marcar(v("r-clave"), "r-clave-err", clave.length < 8),
      marcar(v("r-clave2"), "r-clave2-err", clave2 !== clave || !clave2),
    ];
    if (checks.includes(false)) { const p = $(".is-invalid", e.target); p && p.focus(); return; }
    const id = "n" + Date.now().toString(36), sal = nuevaSal();
    DB.negocios[id] = negocioNuevo(id, negocio, rubro);
    DB.reservas[id] = [];
    DB.cuentas.push({ usuario, nombre, negocio: id, sal, hash: await hashear(clave, sal) });
    guardar();
    e.target.reset();
    entrar(usuario, "negocio");
    bienvenida(`Hola, ${nombre.split(" ")[0]}.`, "Tu cuenta está lista.", () => aviso("Completá los datos de tu negocio."));
  });

  // ---------- Navegación del panel ----------
  const VISTAS = {};
  let vistaActual = "agenda";
  const ir = (v, { foco = true } = {}) => {
    if (!VISTAS[v]) v = "agenda";
    vistaActual = v;
    $$(".menu__i").forEach((b) => (b.dataset.vista === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    VISTAS[v]();
    if (foco) { window.scrollTo(0, 0); $("#vista").focus({ preventScroll: true }); }
  };
  $$(".menu__i").forEach((b) => b.addEventListener("click", () => ir(b.dataset.vista)));
  $("#salir").addEventListener("click", salir);

  // ---------- Diálogo ----------
  const dlg = $("#dlg");
  const abrirDlg = (html) => {
    $("#dlg-in").innerHTML = html;
    if (!dlg.open) dlg.showModal();
    const t = $("#dlg-t"); if (t) { t.setAttribute("tabindex", "-1"); t.focus(); }
  };
  const cerrarDlg = () => dlg.open && dlg.close();
  dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-cerrar]")) cerrarDlg(); });
  const cabezaDlg = (k, t) => `<div class="dlg__top"><div><p class="dlg__k">${esc(k)}</p><h2 class="dlg__t" id="dlg-t">${esc(t)}</h2></div><button type="button" class="dlg__x" data-cerrar aria-label="Cerrar">${ico("x")}</button></div>`;

  // ---------- Resúmenes ----------
  const capacidad = (desde, hasta) => {
    let total = 0;
    for (let f = desde; f <= hasta; f = sumar(f, 1)) total += slotsDe(NEG, f).length * NEG.recursos.length;
    return total;
  };
  const resumen = (desde, hasta) => {
    const lista = RES.filter((r) => r.fecha >= desde && r.fecha <= hasta);
    const turnos = lista.filter((r) => ocupa(r) && esTurno(r));
    const bloq = lista.filter((r) => r.estado === "bloqueo").length;
    const capR = Math.max(0, capacidad(desde, hasta) - bloq), cap = Math.max(1, capR);
    return {
      lista, turnos: turnos.length, cap: capR, ocupacion: Math.min(1, turnos.length / cap),
      cobrado: lista.reduce((s, r) => s + ingreso(r), 0),
      senas: lista.filter((r) => r.sena && (r.estado !== "cancelada" || r.retenida)).reduce((s, r) => s + r.sena, 0),
      porCobrar: lista.filter((r) => r.estado === "confirmada").reduce((s, r) => s + (r.precio - r.sena), 0),
      jugados: lista.filter((r) => r.estado === "jugada").length,
      ausentes: lista.filter((r) => r.estado === "ausente"),
    };
  };
  // Cada cifra dice qué es (rótulo), cuánto (valor) y contra qué o por qué (una frase corta).
  const kpi = (k, v, n = "", { lider = false, barra = null } = {}) =>
    `<div class="kpi${lider ? " kpi--lider" : ""}"><p class="kpi__k">${k}</p><p class="kpi__v">${v}</p>${barra !== null ? `<span class="kpi__barra" aria-hidden="true"><i style="width:${Math.round(barra * 100)}%"></i></span>` : ""}${n ? `<p class="kpi__n">${n}</p>` : ""}</div>`;
  const kpis = (celdas) => `<div class="kpis kpis--${celdas.length}" style="--k:${celdas.length}">${celdas.join("")}</div>`;
  // Segmentados: la pastilla oscura se desliza de la opción anterior a la nueva
  const SEG = {};
  const animarSegs = () => $$(".seg[data-seg]").forEach((g) => {
    const on = $('[aria-pressed="true"]', g); if (!on) return;
    let p = $(".seg__p", g); if (!p) { p = document.createElement("span"); p.className = "seg__p"; p.setAttribute("aria-hidden", "true"); g.prepend(p); }
    const nuevo = { x: on.offsetLeft, w: on.offsetWidth }, antes = SEG[g.dataset.seg] || nuevo;
    p.style.transition = "none"; p.style.translate = `${antes.x}px 0`; p.style.width = `${antes.w}px`;
    g.classList.add("is-listo"); void p.offsetWidth; p.style.transition = "";
    p.style.translate = `${nuevo.x}px 0`; p.style.width = `${nuevo.w}px`;
    SEG[g.dataset.seg] = nuevo;
  });
  let RECIEN = null; // el turno que se acaba de cambiar hace "pop" en la grilla

  // ---------- Agenda ----------
  const AG = { fecha: ahora().fecha, modo: "dia" };
  let cerrarCalFuera = null; // escucha "tocar afuera" del calendario abierto
  const horasDelDia = (f) => {
    const s = new Set(slotsDe(NEG, f));
    RES.forEach((r) => { if (r.fecha === f && ocupa(r)) s.add(r.hora); }); // turnos viejos que quedaron fuera de la grilla
    return [...s].sort((a, b) => a - b);
  };
  const nombreRec = (id) => (NEG.recursos.find((r) => r.id === id) || { nombre: "Sin lugar" }).nombre;

  // Un turno con seña o sin seña que ya terminó y todavía no se marcó si pagaron el resto o si faltaron.
  const terminado = (r, hoy) => r.fecha < hoy.fecha || (r.fecha === hoy.fecha && r.hora + NEG.duracion <= hoy.min);
  const pendientes = () => { const hoy = ahora(); return RES.filter((r) => r.estado === "confirmada" && terminado(r, hoy)).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora - b.hora); };
  const proximos = () => {
    const hoy = ahora();
    return RES.filter((r) => r.estado === "confirmada" && (r.fecha > hoy.fecha || (r.fecha === hoy.fecha && r.hora >= hoy.min)))
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora - b.hora).slice(0, 5);
  };
  const cuandoCorto = (f, hoy) => (f === hoy ? "Hoy" : f === sumar(hoy, 1) ? "Mañana" : f === sumar(hoy, -1) ? "Ayer" : `${DIAS_C[dow(f)]} ${corto(f)}`);
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // La frase debajo del título: lo que más importa de ese día, armada con los datos.
  const fraseAgenda = (f, hoy, R, esDia) => {
    if (!esDia) return `Esta semana tenés <b>${plural(R.turnos, "turno", "turnos")}</b> y <b>${plural(Math.max(0, R.cap - R.turnos), "horario libre", "horarios libres")}</b>.`;
    if (!slotsDe(NEG, f).length) return "Ese día el negocio está cerrado. Podés cambiar el horario en Mi negocio.";
    const del = RES.filter((r) => r.fecha === f && ocupa(r) && esTurno(r)).sort((a, b) => a.hora - b.hora);
    const tomadas = new Set(RES.filter((r) => r.fecha === f && ocupa(r)).map((r) => `${r.recurso}|${r.hora}`));
    const libresDesde = (m) => slotsDe(NEG, f).filter((t) => t >= m).reduce((n, t) => n + NEG.recursos.filter((rec) => !tomadas.has(`${rec.id}|${t}`)).length, 0);
    if (f === hoy.fecha) {
      const prox = del.find((r) => r.hora >= hoy.min), libres = libresDesde(hoy.min);
      const p1 = prox ? `El próximo turno es a las <b>${aHora(prox.hora)}</b>: ${esc(prox.cliente)} en ${esc(nombreRec(prox.recurso))}.` : "No quedan turnos por hoy.";
      return `${p1} Te ${libres === 1 ? "queda" : "quedan"} <b>${plural(libres, "horario libre", "horarios libres")}</b> hoy.`;
    }
    if (f < hoy.fecha) return `Ese día hubo <b>${plural(del.length, "turno", "turnos")}</b>.`;
    return `Ese día tenés <b>${plural(del.length, "turno", "turnos")}</b> y <b>${plural(libresDesde(0), "horario libre", "horarios libres")}</b>.`;
  };

  // El riel: lo que hay que hacer (para cerrar) y lo que viene (próximos turnos)
  const htmlRiel = () => {
    const hoy = ahora(), pend = pendientes(), prox = proximos();
    const filaPend = (r) => {
      return `<div class="lista__f lista__f--acc"><p class="lista__h">${aHora(r.hora)}<small>${cuandoCorto(r.fecha, hoy.fecha)}</small></p>
        <div class="lista__q"><b>${esc(r.cliente)}</b><small>${esc(nombreRec(r.recurso))} · terminó a las ${aHora(r.hora + NEG.duracion)}</small></div>
        <div class="lista__acc"><button type="button" class="btn btn--ghost btn--sm" data-rapido="jugada" data-id="${r.id}" aria-label="${esc(`${r.cliente} pagó`)}">${ico("check")}Pagó</button><button type="button" class="btn btn--line btn--sm" data-rapido="ausente" data-id="${r.id}" aria-label="${esc(`${r.cliente} no vino`)}">No vino</button></div></div>`;
    };
    const filaProx = (r) => `<button type="button" class="lista__f lista__f--boton" data-res="${r.id}"><span class="lista__h">${aHora(r.hora)}<small>${cuandoCorto(r.fecha, hoy.fecha)}</small></span>
        <span class="lista__q"><b>${esc(r.cliente)}</b><small>${esc(nombreRec(r.recurso))}</small></span>
        <span class="punto ${r.sena ? "punto--v" : "punto--g"}">${r.sena ? "Con seña" : "Sin seña"}</span></button>`;
    return `<aside class="riel" aria-label="Para hacer y lo que viene">
        <section class="riel__sec" aria-labelledby="pc-t">
          <h2 id="pc-t" tabindex="-1">Para cerrar ${pend.length ? `<span class="chip-n">${pend.length}</span>` : ""}</h2>
          <p>${pend.length ? "Turnos que ya terminaron. Marcá si pagaron el resto o si no vinieron." : "Acá aparecen los turnos que ya terminaron, para marcar si pagaron."}</p>
          <div class="lista">${pend.length ? pend.slice(0, 4).map(filaPend).join("") : `<p class="vacio-l">${ico("check")}Todo al día: no hay turnos sin marcar.</p>`}</div>
          ${pend.length > 4 ? `<p>Y ${plural(pend.length - 4, "turno más", "turnos más")}: están en la agenda de cada día.</p>` : ""}
        </section>
        <section class="riel__sec riel__prox" aria-labelledby="px-t">
          <h2 id="px-t">Próximos turnos</h2>
          <div class="lista">${prox.length ? prox.map(filaProx).join("") : `<p class="vacio-l">No hay turnos reservados para los próximos días.</p>`}</div>
        </section>
      </aside>`;
  };

  VISTAS.agenda = () => {
    if (cerrarCalFuera) { document.removeEventListener("pointerdown", cerrarCalFuera); cerrarCalFuera = null; }
    const hoy = ahora(), f = AG.fecha, esDia = AG.modo === "dia";
    const desde = esDia ? f : lunesDe(f), hasta = esDia ? f : sumar(lunesDe(f), 6);
    const R = resumen(desde, hasta);
    const titulo = esDia ? largo(f) + (f === hoy.fecha ? " · hoy" : "") : `Semana del ${corto(desde)} al ${corto(hasta)}`;
    $("#vista").innerHTML = `
      <header class="vhead">
        <div><h1>Agenda</h1><p class="vhead__frase">${fraseAgenda(f, hoy, R, esDia)}</p></div>
        <div class="vhead__acc"><button type="button" class="btn btn--ink" data-nuevo>${ico("mas", "ico-mas")}Cargar turno</button></div>
      </header>
      <div class="barra-f">
        <div class="barra-f__izq">
          <div class="nav-fecha">
            <button type="button" data-mover="-1" aria-label="${esDia ? "Día anterior" : "Semana anterior"}">${ico("izq")}</button>
            <button type="button" class="hoy" data-hoy>Hoy</button>
            <button type="button" data-mover="1" aria-label="${esDia ? "Día siguiente" : "Semana siguiente"}">${ico("der")}</button>
          </div>
          <div class="cal">
            <button type="button" class="fecha-btn" id="cal-btn" aria-expanded="false" aria-controls="cal-pop">
              ${ico("agenda")}<span class="fecha-t" aria-live="polite">${titulo}</span>${ico("abajo", "fecha-btn__f")}
              <span class="sr-only">Abrir el calendario</span>
            </button>
            <div class="cal-pop" id="cal-pop" role="dialog" aria-label="Elegí un día" hidden></div>
          </div>
        </div>
        <div class="seg" data-seg="modo" role="group" aria-label="Ver por">
          <button type="button" data-modo="dia" aria-pressed="${esDia}">Día</button>
          <button type="button" data-modo="semana" aria-pressed="${!esDia}">Semana</button>
        </div>
      </div>
      <div class="ag">
        <section class="card ag__main" aria-labelledby="ag-t"><h2 id="ag-t" class="sr-only">${esDia ? "Turnos por horario" : "Turnos de la semana"}</h2>${esDia ? htmlDia(f, hoy) : htmlSemana(f, hoy)}</section>
        ${htmlRiel()}
      </div>`;
    const v = $("#vista");
    $$("[data-modo]", v).forEach((b) => b.addEventListener("click", () => { if (AG.modo === b.dataset.modo) return; AG.modo = b.dataset.modo; VISTAS.agenda(); $(`[data-modo="${AG.modo}"]`).focus(); }));
    $$("[data-mover]", v).forEach((b) => b.addEventListener("click", () => { AG.fecha = sumar(AG.fecha, +b.dataset.mover * (AG.modo === "dia" ? 1 : 7)); VISTAS.agenda(); $(`[data-mover="${b.dataset.mover}"]`).focus(); }));
    $("[data-hoy]", v).addEventListener("click", () => { AG.fecha = ahora().fecha; VISTAS.agenda(); $("[data-hoy]").focus(); });
    engancharCalendario();
    $("[data-nuevo]", v).addEventListener("click", () => dlgNuevo({ fecha: AG.fecha }));
    $$("[data-res]", v).forEach((b) => b.addEventListener("click", () => dlgTurno(b.dataset.res)));
    $$("[data-libre]", v).forEach((b) => b.addEventListener("click", () => dlgNuevo({ fecha: f, recurso: b.dataset.rec, hora: +b.dataset.hora })));
    $$("[data-ir-dia]", v).forEach((b) => b.addEventListener("click", () => { AG.fecha = b.dataset.irDia; AG.modo = "dia"; VISTAS.agenda(); }));
    $$("[data-rapido]", v).forEach((b) => b.addEventListener("click", () => {
      const r = RES.find((x) => x.id === b.dataset.id); if (!r) return;
      r.estado = b.dataset.rapido; RECIEN = r.id; tocar(); VISTAS.agenda();
      aviso(`${r.cliente}: ${etiqueta(r).toLowerCase()}.`);
      const sig = $("[data-rapido]"); (sig || $("#pc-t")).focus({ preventScroll: true });
    }));
    animarSegs();
    RECIEN = null;
  };


  // ---------- Calendario desplegable: un mes, cada día con una barrita de qué tan lleno está ----------
  const CAL = { mes: "" };
  const llenoDe = (f) => {
    const cap = slotsDe(NEG, f).length * NEG.recursos.length;
    if (!cap) return -1;
    return Math.min(1, RES.filter((r) => r.fecha === f && ocupa(r)).length / cap);
  };
  const pintarCalendario = () => {
    const pop = $("#cal-pop"), hoy = ahora().fecha, mes = CAL.mes;
    const d1 = mes + "-01", d = aD(d1), anio = d.getUTCFullYear(), m = d.getUTCMonth();
    const enMes = new Date(Date.UTC(anio, m + 1, 0)).getUTCDate();
    const vacios = (dow(d1) + 6) % 7;
    let h = `<div class="cal__top">
        <button type="button" class="cal__nav" data-cal-mes="-1" aria-label="Mes anterior">‹</button>
        <p class="cal__mes" aria-live="polite">${mayus(MESES[m])} ${anio}</p>
        <button type="button" class="cal__nav" data-cal-mes="1" aria-label="Mes siguiente">›</button>
      </div>
      <div class="cal__grid" role="grid">${["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"].map((x) => `<span class="cal__dsem" aria-hidden="true">${x}</span>`).join("")}`;
    for (let i = 0; i < vacios; i++) h += `<span></span>`;
    for (let n = 1; n <= enMes; n++) {
      const f = `${mes}-${pad2(n)}`, ll = llenoDe(f);
      const cls = ["cal__d", f === hoy ? "es-hoy" : "", f === AG.fecha ? "es-sel" : "", f < hoy ? "es-pasado" : "", ll < 0 ? "es-cerrado" : ""].filter(Boolean).join(" ");
      const txt = ll < 0 ? "cerrado" : `${pct(ll)} ocupado`;
      h += `<button type="button" class="${cls}" data-cal-dia="${f}" aria-label="${esc(`${largo(f)}, ${txt}`)}"${f === AG.fecha ? ' aria-current="date"' : ""}>
        <span>${n}</span><i aria-hidden="true"><i style="width:${ll < 0 ? 0 : Math.round(ll * 100)}%"></i></i></button>`;
    }
    h += `</div><p class="cal__ley">La barrita muestra qué tan lleno está cada día.</p>
      <button type="button" class="link cal__hoy" data-cal-dia="${hoy}">Ir a hoy</button>`;
    pop.innerHTML = h;
    $$("[data-cal-mes]", pop).forEach((b) => b.addEventListener("click", () => {
      const nd = aD(CAL.mes + "-01"); nd.setUTCMonth(nd.getUTCMonth() + +b.dataset.calMes);
      CAL.mes = aISO(nd).slice(0, 7); pintarCalendario(); $(`[data-cal-mes="${b.dataset.calMes}"]`, pop).focus();
    }));
    $$("[data-cal-dia]", pop).forEach((b) => b.addEventListener("click", () => {
      AG.fecha = b.dataset.calDia; VISTAS.agenda(); $("#cal-btn").focus();
    }));
  };
  const engancharCalendario = () => {
    const btn = $("#cal-btn"), pop = $("#cal-pop");
    const cerrar = (devolver) => {
      pop.hidden = true; btn.setAttribute("aria-expanded", "false");
      if (cerrarCalFuera) { document.removeEventListener("pointerdown", cerrarCalFuera); cerrarCalFuera = null; }
      if (devolver) btn.focus();
    };
    btn.addEventListener("click", () => {
      if (!pop.hidden) return cerrar(false);
      CAL.mes = AG.fecha.slice(0, 7); pintarCalendario();
      pop.hidden = false; btn.setAttribute("aria-expanded", "true");
      ($(".es-sel", pop) || $(".cal__d", pop)).focus();
      cerrarCalFuera = (e) => { if (!e.target.closest(".cal")) cerrar(false); };
      document.addEventListener("pointerdown", cerrarCalFuera);
    });
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); return cerrar(true); }
      const paso = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
      const act = e.target.closest(".cal__d");
      if (!paso || !act) return;
      e.preventDefault();
      const dest = sumar(act.dataset.calDia, paso);
      if (dest.slice(0, 7) !== CAL.mes) { CAL.mes = dest.slice(0, 7); pintarCalendario(); }
      const b = $(`[data-cal-dia="${dest}"].cal__d`, pop); b && b.focus();
    });
  };

  const htmlDia = (f, hoy) => {
    const horas = horasDelDia(f);
    if (!horas.length) return `<p class="vacio-p">Este día el negocio está cerrado. Podés cambiar el horario en Mi negocio.</p>`;
    const del = RES.filter((r) => r.fecha === f && ocupa(r));
    let h = `<div class="dia" style="--n:${NEG.recursos.length}" role="grid" aria-label="Turnos del ${esc(largo(f))}">`;
    h += `<span class="dia__esq">Horario</span>` + NEG.recursos.map((r) => `<div class="dia__h"><span class="dia__rec">${esc(r.nombre)}</span>${r.detalle ? `<small>${esc(r.detalle)}</small>` : ""}</div>`).join("");
    for (const t of horas) {
      const fin = t + NEG.duracion, rangoT = `${aHora(t)} a ${aHora(fin)}`;
      const ahoraAca = f === hoy.fecha && hoy.min >= t && hoy.min < fin;
      h += `<p class="dia__hora${ahoraAca ? " es-ahora" : ""}"><b>${aHora(t)}</b><small>a ${aHora(fin)}</small>${ahoraAca ? `<em>Ahora</em>` : ""}</p>`;
      for (const rec of NEG.recursos) {
        const r = del.find((x) => x.recurso === rec.id && x.hora === t);
        const donde = `<span class="slot__c">${esc(rec.nombre)} · </span>${rangoT}`;
        const pop = r && r.id === RECIEN ? " recien" : "";
        if (r && r.estado === "bloqueo") h += `<button type="button" class="slot slot--bloqueo${pop}" data-res="${r.id}"><b>Bloqueado</b><small>${esc(r.nota || "Sin turnos")}</small><small class="slot__t">${donde}</small></button>`;
        else if (r) {
          const cerrar = r.estado === "confirmada" && terminado(r, hoy);
          const est = cerrar ? "Terminó: marcá si pagó" : etiqueta(r);
          const extra = r.origen === "fijo" ? " · fijo" : r.origen === "telefono" ? " · por teléfono" : "";
          h += `<button type="button" class="slot slot--${r.estado}${r.estado === "confirmada" && !r.sena ? " sin-sena" : ""}${cerrar ? " slot--cerrar" : ""}${pop}" data-res="${r.id}" aria-label="${esc(`${r.cliente}, ${rec.nombre} de ${rangoT}: ${est}`)}"><b>${esc(r.cliente)}</b><small class="slot__e">${est}${cerrar ? "" : extra}</small><small class="slot__t">${donde}</small></button>`;
        }
        else if (f < hoy.fecha || (f === hoy.fecha && t < hoy.min)) h += `<span class="slot slot--pasado" aria-label="${esc(`${rec.nombre} de ${rangoT}: finalizado`)}"><small>Finalizado</small><small class="slot__t">${donde}</small></span>`;
        else h += `<button type="button" class="slot slot--libre" data-libre data-rec="${rec.id}" data-hora="${t}" aria-label="Cargar turno en ${esc(rec.nombre)} de ${rangoT}"><b>${ico("mas")}Libre</b><small class="slot__t">${donde}</small></button>`;
      }
    }
    h += `</div><div class="leyenda" style="margin-top:16px">
      <span><i style="background:var(--v100)"></i>Con seña</span>
      <span><i style="background:#fff;box-shadow:inset 0 0 0 1px var(--control)"></i>Sin seña</span>
      <span><i style="background:#eceeee"></i>Pagado</span>
      <span><i style="background:var(--n100)"></i>No vino</span>
      <span><i style="background:var(--tx)"></i>Bloqueado</span>
      <span><i style="background:var(--v50);box-shadow:inset 0 0 0 1px var(--v100)"></i>Libre: tocalo para cargar un turno</span></div>`;
    return h;
  };

  const htmlSemana = (f, hoy) => {
    const L = lunesDe(f), dias = [0, 1, 2, 3, 4, 5, 6].map((i) => sumar(L, i));
    const horas = [...new Set(dias.flatMap(horasDelDia))].sort((a, b) => a - b);
    if (!horas.length) return `<p class="vacio-p">Esta semana el negocio está cerrado.</p>`;
    const total = NEG.recursos.length;
    let h = `<div class="sem-wrap"><table class="sem"><caption class="sr-only">Lugares ocupados por horario en la semana</caption><thead><tr><th scope="col"><span class="sr-only">Hora</span></th>`;
    h += dias.map((d) => `<th scope="col" class="${d === hoy.fecha ? "es-hoy" : ""}">${DIAS_C[dow(d)]}<small>${corto(d)}</small></th>`).join("") + `</tr></thead><tbody>`;
    for (const t of horas) {
      h += `<tr><th scope="row">${aHora(t)}</th>`;
      for (const d of dias) {
        if (!horasDelDia(d).includes(t)) { h += `<td><span class="sem-c cerr" aria-label="Cerrado">·</span></td>`; continue; }
        const n = RES.filter((r) => r.fecha === d && r.hora === t && ocupa(r)).length;
        const c = n === 0 ? "" : n >= total ? "o3" : n / total >= 0.5 ? "o2" : "o1";
        h += `<td><button type="button" class="${c}" data-ir-dia="${d}" aria-label="${esc(`${mayus(DIAS[dow(d)])} ${corto(d)} a las ${aHora(t)}: ${n} de ${total} ocupados`)}">${n}/${total}</button></td>`;
      }
      h += `</tr>`;
    }
    h += `</tbody></table></div><div class="leyenda" style="margin-top:12px">
      <span><i style="background:var(--fondo);box-shadow:inset 0 0 0 1px var(--borde)"></i>Todo libre</span><span><i style="background:var(--v100)"></i>Menos de la mitad</span>
      <span><i style="background:var(--v200)"></i>La mitad o más</span><span><i style="background:var(--v)"></i>Completo</span>
      <span>Cada cuadro dice cuántos lugares están ocupados. Tocalo para ver ese día.</span></div>`;
    return h;
  };

  // ---------- Detalle de un turno ----------
  const waLink = (r, texto) => {
    let n = String(r.wa || "").replace(/\D/g, "");
    if (!n) return "";
    if (n.startsWith("0")) n = n.slice(1);
    if (!n.startsWith("54")) n = "549" + n;
    return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
  };
  const horasHasta = (r) => { const a = ahora(); return (diasEntre(a.fecha, r.fecha) * 1440 + r.hora - a.min) / 60; };
  const dlgTurno = (id, paso = "") => {
    const r = RES.find((x) => x.id === id); if (!r) return;
    const rec = nombreRec(r.recurso), cuando = `${largo(r.fecha)} · ${aHora(r.hora)}`;
    if (r.estado === "bloqueo") {
      abrirDlg(`${cabezaDlg(`${rec} · ${cuando}`, "Horario bloqueado")}
        <p>${esc(r.nota || "Sin motivo cargado.")}</p>
        <div class="acciones"><button type="button" class="btn btn--warn" data-acc="quitar">Quitar el bloqueo</button><button type="button" class="btn btn--ghost" data-cerrar>Listo</button></div>`);
      return bindAcc(r);
    }
    if (paso === "cancelar") {
      const h = horasHasta(r), devuelve = NEG.devolverSena && h >= NEG.cancelarHoras;
      abrirDlg(`${cabezaDlg(`${rec} · ${cuando}`, `¿Cancelar el turno de ${r.cliente}?`)}
        <p>${!r.sena ? "Este turno no tiene seña." : devuelve
          ? `Falta más de ${NEG.cancelarHoras} h, así que según tus reglas <b>la seña de ${plata(r.sena)} se le devuelve</b>.`
          : `${NEG.devolverSena ? `Falta menos de ${NEG.cancelarHoras} h` : "Tus reglas no devuelven la seña"}, así que <b>te quedás con la seña de ${plata(r.sena)}</b>.`}
          El horario vuelve a quedar libre.</p>
        <div class="acciones"><button type="button" class="btn btn--warn" data-acc="cancelar-si" data-devuelve="${devuelve}">Sí, cancelar</button><button type="button" class="btn btn--ghost" data-acc="volver">Volver</button></div>`);
      return bindAcc(r);
    }
    const resto = r.precio - r.sena;
    const msj = `Hola ${r.cliente.split(" ")[0]}, te escribimos de ${NEG.nombre} por tu turno del ${largo(r.fecha).toLowerCase()} a las ${aHora(r.hora)} en ${rec}.`;
    const wa = waLink(r, msj);
    let acc = "";
    if (r.estado === "confirmada") {
      acc = `<button type="button" class="btn btn--ink" data-acc="jugada">${resto > 0 ? `Cobré el resto (${plata(resto)})` : "Marcar como pagado"}</button>
        <button type="button" class="btn btn--line" data-acc="ausente">No vino</button>
        <button type="button" class="btn btn--warn" data-acc="cancelar">Cancelar turno</button>`;
    } else if (r.estado === "jugada" || r.estado === "ausente") {
      acc = `<button type="button" class="btn btn--line" data-acc="deshacer">Deshacer: volver a "${r.sena ? "Seña cobrada" : "Sin seña"}"</button>`;
    }
    abrirDlg(`${cabezaDlg(`${rec} · ${cuando}`, r.cliente)}
      <p class="estado estado--${r.estado}"><i aria-hidden="true"></i>${etiqueta(r)}${r.estado === "cancelada" ? (r.retenida ? " · seña retenida" : " · seña devuelta") : ""}</p>
      <dl class="datos">
        <div><dt>WhatsApp</dt><dd>${esc(r.wa || "—")}</dd></div>
        <div><dt>Turno</dt><dd>${NEG.duracion} min · ${plata(r.precio)}</dd></div>
        <div><dt>Seña</dt><dd>${r.sena ? plata(r.sena) : "Sin seña"}</dd></div>
        ${r.estado === "confirmada" ? `<div class="falta"><dt>Falta cobrar</dt><dd>${plata(resto)}</dd></div>` : ""}
        <div><dt>Cómo reservó</dt><dd>${mayus(ORIGEN[r.origen] || "—")}</dd></div>
      </dl>
      <div class="field"><label for="d-nota">Nota</label><textarea id="d-nota" rows="2" placeholder="Por ejemplo, traen paletas prestadas">${esc(r.nota)}</textarea></div>
      <div class="acciones">${acc}${wa ? `<a class="btn btn--ghost" href="${wa}" target="_blank" rel="noopener">${ico("chat")}Escribirle por WhatsApp</a>` : ""}</div>`);
    $("#d-nota").addEventListener("change", (e) => { r.nota = e.target.value.trim(); tocar(); aviso("Nota guardada."); });
    bindAcc(r);
  };
  const bindAcc = (r) => {
    $$("[data-acc]", dlg).forEach((b) => b.addEventListener("click", () => {
      const a = b.dataset.acc, previo = r.estado;
      if (a === "cancelar") return dlgTurno(r.id, "cancelar");
      if (a === "volver") return dlgTurno(r.id);
      if (a === "quitar") { RES.splice(RES.indexOf(r), 1); tocar(); cerrarDlg(); refrescar(); return aviso("Bloqueo quitado. El horario quedó libre."); }
      if (a === "cancelar-si") { r.estado = "cancelada"; r.retenida = b.dataset.devuelve !== "true" && !!r.sena; }
      if (a === "jugada") r.estado = "jugada";
      if (a === "ausente") r.estado = "ausente";
      if (a === "deshacer") r.estado = "confirmada";
      RECIEN = r.id; tocar(); cerrarDlg(); refrescar();
      aviso(a === "cancelar-si" ? "Turno cancelado. El horario quedó libre." : `${r.cliente}: ${etiqueta(r).toLowerCase()}.`);
      void previo;
    }));
  };
  const refrescar = () => VISTAS[vistaActual]();

  // ---------- Cargar turno o bloqueo ----------
  const dlgNuevo = (pre = {}) => {
    const hoy = ahora();
    abrirDlg(`${cabezaDlg(NEG.nombre, "Cargar turno")}
      <form class="nuevo" id="f-nuevo" novalidate>
        <div class="seg" data-seg="tipo" role="radiogroup" aria-label="Qué querés cargar">
          <button type="button" role="radio" data-tipo="turno" aria-checked="true" aria-pressed="true">Turno</button>
          <button type="button" role="radio" data-tipo="bloqueo" aria-checked="false" aria-pressed="false">Bloquear horario</button>
        </div>
        <div class="field-row">
          <div class="field"><label for="n-rec">${esc(unidad(NEG))}</label><select id="n-rec">${NEG.recursos.map((r) => `<option value="${r.id}" ${r.id === pre.recurso ? "selected" : ""}>${esc(r.nombre)}</option>`).join("")}</select></div>
          <div class="field"><label for="n-fecha">Día</label><input id="n-fecha" type="date" min="${hoy.fecha}" value="${pre.fecha && pre.fecha >= hoy.fecha ? pre.fecha : hoy.fecha}" required /></div>
        </div>
        <div class="field"><label for="n-hora">Hora</label><select id="n-hora" required aria-describedby="n-hora-err"></select><p class="field__err" id="n-hora-err" hidden>Elegí un horario libre.</p></div>
        <div class="solo-turno">
          <div class="field-row">
            <div class="field"><label for="n-cli">Cliente</label><input id="n-cli" autocomplete="off" list="n-clientes" aria-describedby="n-cli-err" /><p class="field__err" id="n-cli-err" hidden>Escribí el nombre.</p></div>
            <div class="field"><label for="n-wa">WhatsApp</label><input id="n-wa" type="tel" inputmode="tel" autocomplete="off" /></div>
          </div>
          <datalist id="n-clientes">${[...new Map(RES.filter((r) => r.cliente).map((r) => [r.cliente, r.wa])).entries()].map(([n]) => `<option value="${esc(n)}"></option>`).join("")}</datalist>
          <p class="nuevo__precio" id="n-precio"></p>
          <label class="chk"><input type="checkbox" id="n-sena" /> <span>Ya cobré la seña</span></label>
          <label class="chk"><input type="checkbox" id="n-fijo" /> <span>Turno fijo: repetir todas las semanas (8 semanas)</span></label>
        </div>
        <div class="field"><label for="n-nota" id="n-nota-l">Nota (opcional)</label><input id="n-nota" autocomplete="off" /></div>
        <div class="acciones"><button type="submit" class="btn btn--ink btn--lg">${ico("check")}Guardar</button><button type="button" class="btn btn--ghost btn--lg" data-cerrar>Cancelar</button></div>
      </form>`);
    let tipo = "turno";
    const f = $("#f-nuevo"), selH = $("#n-hora"), selR = $("#n-rec"), inF = $("#n-fecha");
    const libres = () => {
      const fecha = inF.value, rec = selR.value, a = ahora();
      const ocup = new Set(RES.filter((r) => r.fecha === fecha && r.recurso === rec && ocupa(r)).map((r) => r.hora));
      return slotsDe(NEG, fecha).filter((t) => !ocup.has(t) && (fecha > a.fecha || t >= a.min));
    };
    const pintarHoras = () => {
      const ls = libres(), antes = +selH.value || pre.hora;
      selH.innerHTML = ls.length ? ls.map((t) => `<option value="${t}" ${t === antes ? "selected" : ""}>${aHora(t)}</option>`).join("") : `<option value="">No hay horarios libres ese día</option>`;
      pintarPrecio();
    };
    const pintarPrecio = () => {
      const t = +selH.value;
      if (!selH.value) { $("#n-precio").textContent = ""; return; }
      const p = precioDe(NEG, t);
      $("#n-precio").textContent = `Turno de ${NEG.duracion} min: ${plata(p)} · seña ${plata(senaDe(NEG, p))}`;
      $("#n-sena").nextElementSibling.textContent = `Ya cobré la seña (${plata(senaDe(NEG, p))})`;
    };
    selR.addEventListener("change", pintarHoras); inF.addEventListener("change", pintarHoras); selH.addEventListener("change", pintarPrecio);
    $("#n-cli").addEventListener("change", (e) => { const c = RES.find((r) => r.cliente === e.target.value && r.wa); if (c && !$("#n-wa").value) $("#n-wa").value = c.wa; });
    $$("[data-tipo]", f).forEach((b) => b.addEventListener("click", () => {
      tipo = b.dataset.tipo;
      $$("[data-tipo]", f).forEach((x) => { const on = x === b; x.setAttribute("aria-checked", String(on)); x.setAttribute("aria-pressed", String(on)); });
      $(".solo-turno", f).hidden = tipo !== "turno";
      $("#n-nota-l").textContent = tipo === "turno" ? "Nota (opcional)" : "Motivo (por ejemplo, torneo o mantenimiento)";
      $("#dlg-t").textContent = tipo === "turno" ? "Cargar turno" : "Bloquear horario";
      animarSegs();
    }));
    pintarHoras();
    SEG.tipo = null; animarSegs();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const okH = marcar(selH, "n-hora-err", !selH.value);
      const cli = $("#n-cli").value.trim();
      const okC = tipo === "bloqueo" || marcar($("#n-cli"), "n-cli-err", !cli);
      if (!okH || !okC) return;
      const t = +selH.value, rec = selR.value, fecha = inF.value, precio = tipo === "turno" ? precioDe(NEG, t) : 0;
      const base = {
        recurso: rec, hora: t, cliente: tipo === "turno" ? cli : "", wa: tipo === "turno" ? $("#n-wa").value.trim() : "",
        precio, sena: tipo === "turno" && $("#n-sena").checked ? senaDe(NEG, precio) : 0,
        estado: tipo === "turno" ? "confirmada" : "bloqueo", retenida: false,
        origen: tipo === "turno" ? ($("#n-fijo").checked ? "fijo" : "telefono") : "", nota: $("#n-nota").value.trim(),
      };
      const semanas = tipo === "turno" && $("#n-fijo").checked ? 8 : 1;
      let cargados = 0, salteados = 0;
      for (let i = 0; i < semanas; i++) {
        const fi = sumar(fecha, i * 7);
        const choca = RES.some((r) => r.fecha === fi && r.recurso === rec && r.hora === t && ocupa(r));
        if (choca || !slotsDe(NEG, fi).includes(t)) { salteados++; continue; }
        const id = nuevoId(); RES.push({ id, fecha: fi, ...base }); cargados++;
        if (fi === fecha) RECIEN = id;
      }
      tocar(); cerrarDlg();
      AG.fecha = fecha; AG.modo = "dia"; if (vistaActual === "agenda") refrescar();
      aviso(tipo === "bloqueo" ? "Horario bloqueado." : semanas > 1 ? `Turno fijo cargado en ${cargados} semanas${salteados ? ` (${salteados} ya estaban ocupadas)` : ""}.` : `Turno de ${cli} cargado.`);
    });
  };

  // ---------- Finanzas ----------
  const FIN = { periodo: "mes", todos: false };
  const PERIODOS = { mes: "Este mes", mesAnt: "Mes pasado", d30: "Últimos 30 días", d7: "Últimos 7 días" };
  const periodoBoton = (t) => t.replace("Últimos ", `<span class="largo">Últimos </span>`); // en el celular: "30 días"
  const rango = (p) => {
    const hoy = ahora().fecha, d = aD(hoy);
    if (p === "d7") return [sumar(hoy, -6), hoy];
    if (p === "d30") return [sumar(hoy, -29), hoy];
    const primero = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-01`;
    if (p === "mesAnt") { const fin = sumar(primero, -1); return [fin.slice(0, 8) + "01", fin]; }
    return [primero, hoy];
  };
  const CONCEPTO = (r) => r.estado === "jugada" ? "Turno pagado" : r.estado === "confirmada" ? "Seña" : r.estado === "ausente" ? "Seña retenida (no vino)" : "Seña retenida (canceló tarde)";
  VISTAS.finanzas = () => {
    const [desde, hasta] = rango(FIN.periodo), dias = diasEntre(desde, hasta) + 1;
    const R = resumen(desde, hasta), P = resumen(sumar(desde, -dias), sumar(desde, -1));
    const hoy = ahora().fecha, futuros = RES.filter((r) => r.fecha >= hoy && r.estado === "confirmada");
    const varCob = P.cobrado ? (R.cobrado - P.cobrado) / P.cobrado : 0;
    const porDia = [];
    for (let f = desde; f <= hasta; f = sumar(f, 1)) {
      const l = R.lista.filter((r) => r.fecha === f);
      porDia.push({ iso: f, v: l.reduce((s, r) => s + ingreso(r), 0), n: l.filter((r) => esTurno(r) && ocupa(r)).length });
    }
    const porRec = NEG.recursos.map((rec) => ({ n: rec.nombre, v: R.lista.filter((r) => r.recurso === rec.id).reduce((s, r) => s + ingreso(r), 0) }));
    const porFranja = NEG.franjas.map((fr) => {
      const d = aMin(fr.desde); let h = aMin(fr.hasta); if (h <= d) h += 1440;
      return { n: `${fr.desde} a ${fr.hasta}`, v: R.lista.filter((r) => { const m = r.hora % 1440, mm = m < d ? m + 1440 : m; return mm >= d && mm < h; }).reduce((s, r) => s + ingreso(r), 0) };
    });
    const movs = R.lista.filter((r) => ingreso(r) > 0).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora - a.hora);
    const verMovs = FIN.todos ? movs : movs.slice(0, 12);
    const prevD = sumar(desde, -dias), prevH = sumar(desde, -1), futPlata = futuros.reduce((s, r) => s + r.precio - r.sena, 0);
    const delta = P.cobrado
      ? `<span class="${varCob >= 0 ? "sube" : "baja"}">${varCob >= 0 ? "▲ +" : "▼ −"}${Math.abs(Math.round(varCob * 100))} %</span> contra los ${dias} días anteriores (${corto(prevD)} al ${corto(prevH)})`
      : `Del ${corto(desde)} al ${corto(hasta)}`;
    $("#vista").innerHTML = `
      <header class="vhead">
        <div><h1>Finanzas</h1><p class="vhead__frase">Lo que entró por señas y turnos del <b>${corto(desde)}</b> al <b>${corto(hasta)}</b>. Las señas van directo a tu Mercado Pago.</p></div>
        <div class="vhead__acc">
          <div class="seg" data-seg="per" role="group" aria-label="Período">${Object.entries(PERIODOS).map(([k, t]) => `<button type="button" data-per="${k}" aria-pressed="${FIN.periodo === k}">${periodoBoton(t)}</button>`).join("")}</div>
        </div>
      </header>
      ${kpis([
        kpi("Cobrado", plata(R.cobrado), delta, { lider: true }),
        kpi("Señas cobradas", plata(R.senas), "Ya están sumadas en lo cobrado"),
        kpi("Turnos pagados", R.jugados, `Ocupaste el ${pct(R.ocupacion)} de los horarios`),
        kpi("No vinieron", R.ausentes.length, R.ausentes.length ? `Te quedaste con ${plata(R.ausentes.reduce((s, r) => s + r.sena, 0))} de seña` : "Nadie faltó en el período"),
        kpi("Falta cobrar", plata(futPlata), `De ${plural(futuros.length, "turno", "turnos")} de hoy en adelante, en el lugar`),
      ])}
      <section class="card" aria-labelledby="g-t">
        <div class="card__head"><div><h2 id="g-t">Cobrado por día</h2><p class="card__sub">Cada barra es lo que entró ese día. Pasá el cursor o usá las flechas para ver el detalle.</p></div></div>
        <div class="chart" id="chart"></div>
        <details class="tabla-dias" style="margin-top:12px"><summary class="link" style="display:inline-block;cursor:pointer">Ver los números de cada día</summary>
          <div class="tabla-wrap"><table class="tabla" style="margin-top:8px"><thead><tr><th scope="col">Día</th><th scope="col" class="num">Turnos</th><th scope="col" class="num">Cobrado</th></tr></thead>
          <tbody>${porDia.map((d) => `<tr><td>${DIAS_C[dow(d.iso)]} ${corto(d.iso)}</td><td class="num">${d.n}</td><td class="num">${plata(d.v)}</td></tr>`).join("")}</tbody></table></div>
        </details>
      </section>
      <div class="grid2">
        <section class="card" aria-labelledby="r-t"><div class="card__head"><div><h2 id="r-t">Por ${esc(unidad(NEG).toLowerCase())}</h2><p class="card__sub">Cuánto dejó cada una en el período</p></div></div>${hbar(porRec, R.cobrado)}</section>
        <section class="card" aria-labelledby="f-t"><div class="card__head"><div><h2 id="f-t">Por franja horaria</h2><p class="card__sub">Según la hora en que empezó cada turno</p></div></div>${hbar(porFranja, R.cobrado)}</section>
      </div>
      <section class="card" aria-labelledby="m-t">
        <div class="card__head"><div><h2 id="m-t">Movimientos</h2><p class="card__sub">${plural(movs.length, "cobro", "cobros")} en el período, del más nuevo al más viejo</p></div>
          <button type="button" class="btn btn--line btn--sm" id="csv" ${movs.length ? "" : "disabled"}>${ico("bajar")}Descargar planilla (CSV)</button></div>
        ${movs.length ? `<div class="tabla-wrap"><table class="tabla tabla--cards"><thead><tr><th scope="col">Cliente</th><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">${esc(unidad(NEG))}</th><th scope="col" class="num">Monto</th></tr></thead><tbody>
          ${verMovs.map((r) => `<tr><td class="cli">${esc(r.cliente)}</td><td class="nowrap solo-pc">${DIAS_C[dow(r.fecha)]} ${corto(r.fecha)} · ${aHora(r.hora)}</td><td class="solo-pc">${CONCEPTO(r)}</td><td class="solo-pc gris">${esc(nombreRec(r.recurso))}</td><td class="num"><b>${plata(ingreso(r))}</b></td><td class="dato-2 solo-cel">${DIAS_C[dow(r.fecha)]} ${corto(r.fecha)} ${aHora(r.hora)} · ${CONCEPTO(r)} · ${esc(nombreRec(r.recurso))}</td></tr>`).join("")}
        </tbody></table></div>${movs.length > 12 ? `<p style="margin-top:12px"><button type="button" class="link" id="mas">${FIN.todos ? "Ver menos" : `Ver los ${movs.length} cobros`}</button></p>` : ""}`
        : `<p class="vacio-p">Todavía no entró plata en este período. Cuando te paguen una seña o un turno, aparece acá.</p>`}
      </section>`;
    $$("[data-per]").forEach((b) => b.addEventListener("click", () => { FIN.periodo = b.dataset.per; FIN.todos = false; VISTAS.finanzas(); $(`[data-per="${FIN.periodo}"]`).focus(); }));
    animarSegs();
    const mas = $("#mas"); if (mas) mas.addEventListener("click", () => { FIN.todos = !FIN.todos; VISTAS.finanzas(); $("#mas").focus(); });
    const csv = $("#csv"); if (csv) csv.addEventListener("click", () => descargarCSV(movs, desde, hasta));
    const cont = $("#chart");
    graficoBarras(cont, porDia);
    if ("ResizeObserver" in window) {
      let w = cont.clientWidth;
      new ResizeObserver(() => { if (cont.isConnected && Math.abs(cont.clientWidth - w) > 8) { w = cont.clientWidth; graficoBarras(cont, porDia); } }).observe(cont);
    }
  };
  const hbar = (filas, total = 0) => {
    const max = Math.max(1, ...filas.map((f) => f.v));
    if (!filas.length) return `<p class="vacio-p">Sin datos.</p>`;
    return `<div class="hbar">${filas.map((f) => `<div class="hbar__f"><span class="hbar__n">${esc(f.n)}</span><span class="hbar__p"><span class="hbar__b" style="width:calc(${(f.v / max) * 100}% - ${(f.v / max) * 110}px)"></span><span class="hbar__v">${plata(f.v)}${total ? `<span class="hbar__s">${pct(f.v / total)} del total</span>` : ""}</span></span></div>`).join("")}</div>`;
  };
  const techo = (max) => {
    if (max <= 0) return { tope: 1000, paso: 250 };
    const crudo = max / 4, mag = 10 ** Math.floor(Math.log10(crudo));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= crudo);
    return { tope: Math.ceil(max / paso) * paso, paso };
  };
  // Columnas de una sola serie: verde agua, máximo 24 px, borde redondeado arriba y recto en la base,
  // grilla fina, etiquetas en tinta y un tooltip al pasar el cursor o al moverse con las flechas.
  const graficoBarras = (cont, datos) => {
    const W = Math.max(280, cont.clientWidth || 640), H = W < 520 ? 200 : 240;
    const m = { l: 52, r: 8, t: 12, b: 28 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const { tope, paso } = techo(Math.max(...datos.map((d) => d.v)));
    const banda = iw / datos.length, ancho = Math.max(2, Math.min(24, banda - 2));
    const y = (v) => m.t + ih - (v / tope) * ih;
    const cadaCuanto = Math.max(1, Math.ceil(datos.length / Math.floor(iw / 46)));
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cobrado por día. Usá las flechas para recorrer los días." tabindex="0">`;
    for (let v = 0; v <= tope + 0.5; v += paso) s += `<line class="${v === 0 ? "base" : "grilla"}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="eje" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? "0" : "$ " + compacto.format(v)}</text>`;
    datos.forEach((d, i) => {
      const x = m.l + i * banda + (banda - ancho) / 2, h = (d.v / tope) * ih, b = m.t + ih, rr = Math.min(4, h, ancho / 2);
      if (h > 0) s += `<path class="barra" data-i="${i}" d="M${x},${b} V${b - h + rr} Q${x},${b - h} ${x + rr},${b - h} H${x + ancho - rr} Q${x + ancho},${b - h} ${x + ancho},${b - h + rr} V${b} Z"/>`;
      if (i % cadaCuanto === 0) s += `<text class="eje" x="${m.l + i * banda + banda / 2}" y="${H - 8}" text-anchor="middle">${datos.length > 10 ? aD(d.iso).getUTCDate() : `${DIAS_C[dow(d.iso)]} ${aD(d.iso).getUTCDate()}`}</text>`;
      s += `<rect class="toque" data-i="${i}" x="${m.l + i * banda}" y="${m.t}" width="${banda}" height="${ih}"/>`;
    });
    s += `</svg><div class="tip" aria-hidden="true"></div>`;
    cont.innerHTML = s;
    const svg = $("svg", cont), tip = $(".tip", cont);
    let act = -1;
    const mostrar = (i) => {
      act = i;
      $$(".barra", cont).forEach((p) => p.classList.toggle("is-on", +p.dataset.i === i));
      if (i < 0) { tip.classList.remove("is-on"); return; }
      const d = datos[i], escala = svg.getBoundingClientRect().width / W;
      tip.innerHTML = `${DIAS_C[dow(d.iso)]} ${corto(d.iso)}<b>${plata(d.v)}</b>${d.n} turnos`;
      tip.style.left = `${(m.l + i * banda + banda / 2) * escala}px`;
      tip.style.top = `${Math.min(y(d.v), m.t + ih - 4) * escala}px`;
      tip.classList.add("is-on");
    };
    $$(".toque", cont).forEach((r) => { r.addEventListener("pointerenter", () => mostrar(+r.dataset.i)); r.addEventListener("click", () => mostrar(+r.dataset.i)); });
    svg.addEventListener("pointerleave", () => mostrar(-1));
    svg.addEventListener("blur", () => mostrar(-1));
    svg.addEventListener("keydown", (e) => {
      const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (e.key === "Home" || e.key === "End") { e.preventDefault(); return mostrar(e.key === "Home" ? 0 : datos.length - 1); }
      if (!paso) return;
      e.preventDefault(); mostrar(Math.max(0, Math.min(datos.length - 1, (act < 0 ? (paso > 0 ? -1 : datos.length) : act) + paso)));
    });
  };
  const descargarCSV = (movs, desde, hasta) => {
    const q = (t) => `"${String(t).replace(/"/g, '""')}"`;
    const filas = [["Fecha", "Hora", "Cliente", "WhatsApp", unidad(NEG), "Concepto", "Monto"].map(q).join(";")];
    movs.forEach((r) => filas.push([r.fecha, aHora(r.hora), r.cliente, r.wa, nombreRec(r.recurso), CONCEPTO(r), ingreso(r)].map(q).join(";")));
    const url = URL.createObjectURL(new Blob(["﻿" + filas.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `bookea-${NEG.slug}-${desde}-a-${hasta}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    aviso("Planilla descargada.");
  };

  // ---------- Clientes ----------
  const CLI = { q: "", orden: "turnos" };
  VISTAS.clientes = () => {
    const hoy = ahora().fecha, mapa = new Map();
    RES.filter((r) => esTurno(r) && r.cliente).forEach((r) => {
      const k = (r.wa || "").replace(/\D/g, "") || r.cliente.toLowerCase();
      const c = mapa.get(k) || { nombre: r.cliente, wa: r.wa, turnos: 0, ausencias: 0, gastado: 0, ultimo: "", proximo: "", fijo: false };
      if (r.estado === "jugada") { c.turnos++; if (r.fecha > c.ultimo) c.ultimo = r.fecha; }
      if (r.estado === "ausente") c.ausencias++;
      if (r.estado === "confirmada" && r.fecha >= hoy && (!c.proximo || r.fecha < c.proximo)) c.proximo = r.fecha;
      if (r.origen === "fijo") c.fijo = true;
      c.gastado += ingreso(r);
      mapa.set(k, c);
    });
    const todos = [...mapa.values()];
    const vuelven = todos.filter((c) => c.turnos >= 2).length;
    const faltaron = todos.filter((c) => c.ausencias).length;
    $("#vista").innerHTML = `
      <header class="vhead"><div><h1>Clientes</h1><p class="vhead__frase">Quiénes te reservan, cuánto vuelven y quién falta. Se arma solo con cada reserva.</p></div></header>
      ${kpis([
        kpi("Clientes", todos.length, "Reservaron al menos una vez"),
        kpi("Vuelven", todos.length ? pct(vuelven / todos.length) : "—", todos.length ? `${plural(vuelven, "cliente jugó", "clientes jugaron")} 2 veces o más` : "Todavía no hay datos"),
        kpi("Con turno fijo", todos.filter((c) => c.fijo).length, "Reservan todas las semanas"),
        kpi("Faltaron alguna vez", faltaron, faltaron ? "No vinieron al menos a un turno" : "Nadie faltó nunca"),
      ])}
      <section class="card" aria-labelledby="c-t">
        <div class="card__head"><div><h2 id="c-t">Todos tus clientes</h2><p class="card__sub">Tocá WhatsApp para escribirle a cualquiera.</p></div></div>
        <div class="herr">
          <div class="buscar-w">${ico("buscar")}<label class="sr-only" for="c-q">Buscar cliente</label><input class="buscar" id="c-q" type="search" placeholder="Buscar por nombre o WhatsApp" value="${esc(CLI.q)}" autocomplete="off" /></div>
          <label class="sr-only" for="c-orden">Ordenar</label>
          <select class="buscar" id="c-orden">
            <option value="turnos" ${CLI.orden === "turnos" ? "selected" : ""}>Los que más juegan</option>
            <option value="gastado" ${CLI.orden === "gastado" ? "selected" : ""}>Los que más dejaron</option>
            <option value="ultimo" ${CLI.orden === "ultimo" ? "selected" : ""}>Los que vinieron hace poco</option>
            <option value="ausencias" ${CLI.orden === "ausencias" ? "selected" : ""}>Los que más faltan</option>
          </select>
          <p class="herr__cuenta" id="c-cuenta" aria-live="polite"></p>
        </div>
        <div id="c-lista"></div>
      </section>`;
    const pintar = () => {
      const q = CLI.q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
      const l = todos.filter((c) => !q || c.nombre.toLowerCase().includes(q) || (qd && String(c.wa).replace(/\D/g, "").includes(qd)))
        .sort((a, b) => CLI.orden === "ultimo" ? b.ultimo.localeCompare(a.ultimo) : b[CLI.orden] - a[CLI.orden]);
      $("#c-cuenta").textContent = q ? `${plural(l.length, "cliente", "clientes")} de ${todos.length}` : plural(todos.length, "cliente", "clientes");
      $("#c-lista").innerHTML = l.length ? `<div class="tabla-wrap"><table class="tabla tabla--cards"><thead><tr><th scope="col">Cliente</th><th scope="col" class="num">Turnos jugados</th><th scope="col" class="num">Faltó</th><th scope="col">Último turno</th><th scope="col">Próximo turno</th><th scope="col" class="num">Dejó en total</th><th scope="col"><span class="sr-only">Contacto</span></th></tr></thead><tbody>
        ${l.map((c) => { const wa = waLink(c, `Hola ${c.nombre.split(" ")[0]}, te escribimos de ${NEG.nombre}.`); return `<tr><td class="cli">${esc(c.nombre)}${c.fijo ? `<span class="chip-e">Fijo</span>` : ""}</td><td class="num solo-pc">${c.turnos}</td><td class="num solo-pc">${c.ausencias ? `<span class="chip-n">${c.ausencias}</span>` : `<span class="gris">0</span>`}</td><td class="solo-pc">${c.ultimo ? cuandoCorto(c.ultimo, hoy) : `<span class="gris">—</span>`}</td><td class="solo-pc">${c.proximo ? cuandoCorto(c.proximo, hoy) : `<span class="gris">—</span>`}</td><td class="num"><b>${plata(c.gastado)}</b></td><td class="nowrap">${wa ? `<a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</td><td class="dato-2 solo-cel">${plural(c.turnos, "turno jugado", "turnos jugados")}${c.ausencias ? ` · faltó ${c.ausencias}` : ""}${c.proximo ? ` · próximo: ${cuandoCorto(c.proximo, hoy)}` : ""}</td></tr>`; }).join("")}
        </tbody></table></div>` : `<p class="vacio-p">${todos.length ? "No hay clientes con ese nombre o número." : "Todavía no hay clientes. Aparecen solos cuando te reservan."}</p>`;
    };
    pintar();
    $("#c-q").addEventListener("input", (e) => { CLI.q = e.target.value; pintar(); });
    $("#c-orden").addEventListener("change", (e) => { CLI.orden = e.target.value; pintar(); });
  };

  // ---------- Mi negocio ----------
  // Link para llegar: el que pegó el dueño, o uno armado con el nombre, la dirección y la ciudad.
  const MAPS_OK = /^https:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i;
  const linkMaps = ({ nombre = "", direccion = "", ciudad = "", mapa = "" }) => {
    if (mapa) return mapa;
    if (!direccion && !ciudad) return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([nombre, direccion, ciudad].filter(Boolean).join(", "))}`;
  };
  // La foto se recorta en cuadrado y se achica a 320 px para que pese poco.
  const achicarFoto = (archivo) => new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      const lado = Math.min(img.naturalWidth, img.naturalHeight), t = Math.min(320, lado);
      const c = document.createElement("canvas"); c.width = c.height = t;
      c.getContext("2d").drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, t, t);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("no es una imagen")); };
    img.src = url;
  });

  const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];
  VISTAS.negocio = () => {
    const n = NEG, U = unidad(n);
    const filaRec = (r) => `<div class="fila fila--rec" data-id="${r.id}"><input aria-label="Nombre" value="${esc(r.nombre)}" placeholder="${U} 1" /><input aria-label="Detalle" value="${esc(r.detalle)}" placeholder="Por ejemplo, techada" /><button type="button" class="quitar" data-quitar aria-label="Quitar ${esc(r.nombre)}">${ico("x")}</button></div>`;
    const filaFr = (f) => `<div class="fila fila--fr"><input type="time" aria-label="Desde" value="${f.desde}" /><input type="time" aria-label="Hasta" value="${f.hasta}" /><input class="fila__precio" type="number" inputmode="numeric" min="0" step="500" aria-label="Precio" value="${f.precio}" /><button type="button" class="quitar" data-quitar aria-label="Quitar franja">${ico("x")}</button></div>`;
    const sec = (id, t, d, cuerpo) => `<section class="ajuste" aria-labelledby="${id}"><div class="ajuste__r"><h2 id="${id}">${t}</h2><p>${d}</p></div><div class="ajuste__p">${cuerpo}</div></section>`;
    $("#vista").innerHTML = `
      <header class="vhead"><div><h1>Mi negocio</h1><p class="vhead__frase">Lo que ven tus clientes cuando reservan y las reglas de tu agenda.</p></div>
        <div class="vhead__acc"><a class="btn btn--line" href="reservar.html" target="_blank" rel="noopener">${ico("afuera")}Ver la página de reservas</a></div></header>
      <form class="nform" id="f-neg" novalidate>
        ${sec("ng-0", "Perfil", "Tu foto y unas líneas sobre el lugar. Es lo primero que ven tus clientes cuando entran a reservar.", `
          <div class="perfil">
            <div class="perfil__foto" id="g-foto-ver">${n.foto ? `<img src="${n.foto}" alt="Foto de perfil de ${esc(n.nombre)}" />` : `<span aria-hidden="true">${esc(iniciales(n.nombre))}</span>`}</div>
            <div class="perfil__acc">
              <p class="perfil__t">Foto de perfil</p>
              <div class="perfil__bot">
                <label class="btn btn--line btn--sm" for="g-foto">${ico("camara")}<span id="g-foto-l">${n.foto ? "Cambiar foto" : "Subir foto"}</span></label>
                <input class="sr-only" type="file" id="g-foto" accept="image/*" aria-describedby="g-foto-ayuda g-foto-err" />
                <button type="button" class="btn btn--warn btn--sm" id="g-foto-quitar" ${n.foto ? "" : "hidden"}>Quitar</button>
              </div>
              <p class="field__help" id="g-foto-ayuda">El logo o una foto del lugar. Se recorta en cuadrado.</p>
              <p class="field__err" id="g-foto-err" hidden></p>
            </div>
          </div>
          <div class="field"><label for="g-desc">Descripción del lugar</label><textarea id="g-desc" rows="4" maxlength="300" placeholder="Qué tiene tu lugar: canchas, servicios, si prestan equipo, cómo es el estacionamiento…" aria-describedby="g-desc-cuenta">${esc(n.descripcion || "")}</textarea><p class="field__help" id="g-desc-cuenta"></p></div>`)}
        ${sec("ng-1", "Datos", "Así te encuentran tus clientes. El link es la dirección de tu página para reservar: pasalo por WhatsApp o ponelo en tu Instagram.", `
          <div class="campos">
            <div class="field"><label for="g-nombre">Nombre del negocio</label><input id="g-nombre" value="${esc(n.nombre)}" required aria-describedby="g-nombre-err" /><p class="field__err" id="g-nombre-err" hidden>El negocio necesita un nombre.</p></div>
            <div class="field"><label for="g-rubro">Rubro</label><input id="g-rubro" list="rubros" value="${esc(n.rubro)}" /></div>
            <div class="field"><label for="g-wa">WhatsApp del negocio</label><input id="g-wa" type="tel" inputmode="tel" value="${esc(n.whatsapp)}" /></div>
            <div class="field"><label for="g-slug">Tu link de reservas</label><div class="slug"><span>bookea.ar/</span><input id="g-slug" value="${esc(n.slug)}" autocapitalize="none" spellcheck="false" aria-describedby="g-slug-err" /><button type="button" class="btn btn--ghost btn--sm" id="g-copiar">${ico("copiar")}Copiar</button></div><p class="field__err" id="g-slug-err" hidden></p></div>
          </div>`)}
        ${sec("ng-6", "Ubicación", "Para que tus clientes puedan llegar. El botón los lleva directo a Google Maps.", `
          <div class="campos">
            <div class="field"><label for="g-dir">Dirección</label><input id="g-dir" value="${esc(n.direccion)}" autocomplete="street-address" placeholder="Calle y número" /></div>
            <div class="field"><label for="g-ciudad">Ciudad</label><input id="g-ciudad" value="${esc(n.ciudad)}" autocomplete="address-level2" /></div>
            <div class="field ancho"><label for="g-mapa">Link de Google Maps (opcional)</label><input id="g-mapa" type="url" inputmode="url" value="${esc(n.mapa || "")}" placeholder="https://maps.app.goo.gl/…" autocapitalize="none" spellcheck="false" aria-describedby="g-mapa-ayuda g-mapa-err" />
              <p class="field__help" id="g-mapa-ayuda">Buscá tu negocio en Google Maps, tocá <b>Compartir</b> y pegá el link acá. Si lo dejás vacío, usamos la dirección y la ciudad.</p>
              <p class="field__err" id="g-mapa-err" hidden>Pegá un link de Google Maps: empieza con https://maps.app.goo.gl o https://www.google.com/maps</p></div>
          </div>
          <div class="mapa" id="g-mapa-ver"></div>`)}
        ${sec("ng-2", "Qué se reserva", `Tus ${esc(U.toLowerCase())}s, salas, sillones o profesionales. Cada uno tiene su columna en la agenda.`, `
          <div class="fila fila--rec cabeza-filas" aria-hidden="true"><span>Nombre</span><span>Detalle (opcional)</span><span></span></div>
          <div class="filas" id="g-recs">${n.recursos.map(filaRec).join("")}</div>
          <p class="field__err" id="g-recs-err" hidden></p>
          <button type="button" class="btn btn--ghost btn--sm agregar" id="g-rec-mas">${ico("mas")}Agregar</button>`)}
        ${sec("ng-3", "Horario", "Los días y horas en que se puede reservar. Cada turno dura lo mismo.", `
          <div class="field" style="max-width:280px"><label for="g-dur">Cada turno dura</label><select id="g-dur">${[30, 45, 60, 90, 120].map((d) => `<option value="${d}" ${d === n.duracion ? "selected" : ""}>${d} minutos</option>`).join("")}</select></div>
          <div class="filas" id="g-hor">${ORDEN_DIAS.map((d) => { const h = n.horario[d]; return `<div class="fila fila--hr" data-dia="${d}"><span class="fila__dia">${mayus(DIAS[d])}</span><label class="chk"><input type="checkbox" ${h.cerrado ? "" : "checked"} data-abierto /> Abierto</label><input type="time" aria-label="${mayus(DIAS[d])}: abre" value="${h.abre}" ${h.cerrado ? "disabled" : ""} /><input type="time" aria-label="${mayus(DIAS[d])}: cierra" value="${h.cierra}" ${h.cerrado ? "disabled" : ""} /></div>`; }).join("")}</div>
          <p class="field__help">Si cerrás después de medianoche, poné la hora igual (por ejemplo, 00:30).</p>`)}
        ${sec("ng-4", "Precios por horario", "El precio del turno depende de la hora en que empieza. Por ejemplo, más caro a la noche.", `
          <div class="fila fila--fr cabeza-filas" aria-hidden="true"><span>Desde</span><span>Hasta</span><span class="fila__precio">Precio</span><span></span></div>
          <div class="filas" id="g-frs">${n.franjas.map(filaFr).join("")}</div>
          <p class="field__err" id="g-frs-err" hidden></p>
          <button type="button" class="btn btn--ghost btn--sm agregar" id="g-fr-mas">${ico("mas")}Agregar franja</button>`)}
        ${sec("ng-5", "Seña y cancelaciones", "La seña asegura el turno. Vos elegís cuánto cobrar y hasta cuándo pueden cancelar.", `
          <div class="campos">
            <div class="field"><label for="g-sena">Seña (% del turno)</label><input id="g-sena" type="number" inputmode="numeric" min="0" max="100" value="${n.senaPct}" aria-describedby="g-sena-ayuda" /><p class="field__help" id="g-sena-ayuda"></p></div>
            <div class="field"><label for="g-canc">Pueden cancelar hasta (horas antes)</label><input id="g-canc" type="number" inputmode="numeric" min="0" max="72" value="${n.cancelarHoras}" /></div>
            <label class="chk ancho"><input type="checkbox" id="g-dev" ${n.devolverSena ? "checked" : ""} /> Si cancelan a tiempo, se les devuelve la seña</label>
          </div>`)}
        <div class="guardar-barra"><p class="form__msg" id="g-msg" role="status" aria-live="polite"></p><button type="submit" class="btn btn--ink btn--lg" id="g-guardar">Guardar cambios</button></div>
      </form>`;
    const f = $("#f-neg");
    $("#g-copiar").addEventListener("click", async (e) => {
      const b = e.currentTarget, link = `https://bookea.ar/${slugDe($("#g-slug").value)}`;
      try { await navigator.clipboard.writeText(link); } catch { const i = $("#g-slug"); i.select(); try { document.execCommand("copy"); } catch {} }
      b.innerHTML = tilde() + "Copiado"; aviso(`Link copiado: ${link}`);
      setTimeout(() => { if (b.isConnected) b.innerHTML = ico("copiar") + "Copiar"; }, 2200);
    });
    // foto: se ve enseguida y se guarda con "Guardar cambios"
    let foto = n.foto || "";
    const pintarFoto = () => {
      $("#g-foto-ver").innerHTML = foto ? `<img src="${foto}" alt="Foto de perfil de ${esc($("#g-nombre").value || n.nombre)}" />` : `<span aria-hidden="true">${esc(iniciales($("#g-nombre").value || n.nombre))}</span>`;
      $("#g-foto-l").textContent = foto ? "Cambiar foto" : "Subir foto";
      $("#g-foto-quitar").hidden = !foto;
    };
    $("#g-foto").addEventListener("change", async (e) => {
      const a = e.target.files && e.target.files[0], err = $("#g-foto-err"); err.hidden = true;
      if (!a) return;
      if (!/^image\//.test(a.type)) { err.textContent = "Elegí una imagen (JPG o PNG)."; err.hidden = false; return; }
      if (a.size > 15 * 1024 * 1024) { err.textContent = "La imagen pesa más de 15 MB. Probá con otra."; err.hidden = false; return; }
      try { foto = await achicarFoto(a); pintarFoto(); $("#g-foto-ver").classList.remove("recien"); void $("#g-foto-ver").offsetWidth; $("#g-foto-ver").classList.add("recien"); $("#g-msg").className = "form__msg"; $("#g-msg").textContent = "Foto lista. Tocá Guardar cambios para que quede."; }
      catch { err.textContent = "No pudimos abrir esa imagen. Probá con otra."; err.hidden = false; }
      e.target.value = "";
    });
    $("#g-foto-quitar").addEventListener("click", () => { foto = ""; pintarFoto(); $("#g-foto").focus(); $("#g-msg").className = "form__msg"; $("#g-msg").textContent = "Foto quitada. Tocá Guardar cambios para que quede."; });
    const cuentaDesc = () => { const l = $("#g-desc").value.length; $("#g-desc-cuenta").textContent = `${l} de 300 letras`; };
    cuentaDesc(); $("#g-desc").addEventListener("input", cuentaDesc);
    // ubicación: el botón de Google Maps se arma mientras escribís
    const pintarMapa = () => {
      const datos = { nombre: $("#g-nombre").value.trim(), direccion: $("#g-dir").value.trim(), ciudad: $("#g-ciudad").value.trim(), mapa: $("#g-mapa").value.trim() };
      if (datos.mapa && !MAPS_OK.test(datos.mapa)) datos.mapa = "";
      const url = linkMaps(datos), donde = [datos.direccion, datos.ciudad].filter(Boolean).join(", ");
      $("#g-mapa-ver").innerHTML = url
        ? `<span class="mapa__pin">${ico("pin")}</span><div class="mapa__t"><b>${esc(donde || "Ubicación de Google Maps")}</b><small>${$("#g-mapa").value.trim() && MAPS_OK.test($("#g-mapa").value.trim()) ? "Con el link que pegaste" : "Armado con la dirección y la ciudad"}</small></div><a class="btn btn--ghost btn--sm" href="${esc(url)}" target="_blank" rel="noopener" id="g-mapa-ir">${ico("afuera")}Abrir en Google Maps</a>`
        : `<span class="mapa__pin">${ico("pin")}</span><div class="mapa__t"><b>Todavía sin ubicación</b><small>Completá la dirección para que tus clientes puedan llegar.</small></div>`;
    };
    pintarMapa(); ["#g-dir", "#g-ciudad", "#g-mapa", "#g-nombre"].forEach((id) => $(id).addEventListener("input", pintarMapa));
    $("#g-mapa").addEventListener("blur", (e) => { const v = e.target.value.trim(); marcar(e.target, "g-mapa-err", !!v && !MAPS_OK.test(v)); });
    const ayudaSena = () => { const p = n.franjas[0] ? +n.franjas[0].precio : 0, pc = +$("#g-sena").value || 0; $("#g-sena-ayuda").textContent = p ? `Con un turno de ${plata(p)}, la seña es de ${plata(Math.round((p * pc) / 100 / 100) * 100)}.` : ""; };
    ayudaSena(); $("#g-sena").addEventListener("input", ayudaSena);
    f.addEventListener("click", (e) => {
      const q = e.target.closest("[data-quitar]"); if (q) { const fila = q.closest(".fila"), cont = fila.parentElement; fila.remove(); const sig = $("input", cont); sig && sig.focus(); }
    });
    $("#g-rec-mas").addEventListener("click", () => { const c = $("#g-recs"); c.insertAdjacentHTML("beforeend", filaRec({ id: "", nombre: `${U} ${c.children.length + 1}`, detalle: "" })); $("input", c.lastElementChild).select(); });
    $("#g-fr-mas").addEventListener("click", () => { const c = $("#g-frs"); c.insertAdjacentHTML("beforeend", filaFr({ desde: "", hasta: "", precio: "" })); $("input", c.lastElementChild).focus(); });
    $$("[data-abierto]", f).forEach((c) => c.addEventListener("change", () => $$('input[type="time"]', c.closest(".fila")).forEach((i) => (i.disabled = !c.checked))));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = $("#g-msg"); msg.className = "form__msg"; msg.textContent = "";
      const nombre = $("#g-nombre").value.trim(), slug = slugDe($("#g-slug").value);
      const recs = $$("#g-recs .fila").map((fila, i) => { const [a, b] = $$("input", fila); return { id: fila.dataset.id || `r${Date.now().toString(36)}${i}`, nombre: a.value.trim() || `${U} ${i + 1}`, detalle: b.value.trim() }; });
      const frs = $$("#g-frs .fila").map((fila) => { const [a, b, c] = $$("input", fila); return { desde: a.value, hasta: b.value, precio: Math.max(0, Math.round(+c.value || 0)) }; }).filter((x) => x.desde || x.hasta || x.precio);
      const hoy = ahora().fecha;
      const quitados = n.recursos.filter((r) => !recs.some((x) => x.id === r.id));
      const conTurnos = quitados.filter((r) => RES.some((x) => x.recurso === r.id && x.fecha >= hoy && ocupa(x) && esTurno(x)));
      const ok = [
        marcar($("#g-nombre"), "g-nombre-err", !nombre),
        marcar($("#g-slug"), "g-slug-err", Object.values(DB.negocios).some((o) => o.id !== n.id && o.slug === slug) ? "Ese link ya lo usa otro negocio." : false),
        marcar($("#g-mapa"), "g-mapa-err", !!$("#g-mapa").value.trim() && !MAPS_OK.test($("#g-mapa").value.trim())),
      ];
      const eR = $("#g-recs-err"), eF = $("#g-frs-err");
      eR.hidden = eF.hidden = true;
      if (!recs.length) { eR.textContent = "Necesitás al menos uno para tomar reservas."; eR.hidden = false; ok.push(false); }
      else if (conTurnos.length) { eR.textContent = `${conTurnos.map((r) => r.nombre).join(" y ")} tiene turnos de hoy en adelante. Cancelalos antes de quitarlo.`; eR.hidden = false; ok.push(false); }
      if (!frs.length || frs.some((x) => !x.desde || !x.hasta)) { eF.textContent = "Cada franja necesita hora de inicio, de fin y precio."; eF.hidden = false; ok.push(false); }
      if (ok.includes(false)) { msg.className = "form__msg err"; msg.textContent = "Revisá los campos marcados."; const p = $(".is-invalid", f) || $(".field__err:not([hidden])", f); p && p.scrollIntoView({ block: "center" }); return; }
      Object.assign(n, {
        nombre, rubro: $("#g-rubro").value.trim(), ciudad: $("#g-ciudad").value.trim(), direccion: $("#g-dir").value.trim(),
        whatsapp: $("#g-wa").value.trim(), slug, recursos: recs, franjas: frs, duracion: +$("#g-dur").value,
        foto, descripcion: $("#g-desc").value.trim().slice(0, 300), mapa: $("#g-mapa").value.trim(),
        senaPct: Math.min(100, Math.max(0, Math.round(+$("#g-sena").value || 0))), cancelarHoras: Math.max(0, Math.round(+$("#g-canc").value || 0)),
        devolverSena: $("#g-dev").checked,
      });
      $$("#g-hor .fila").forEach((fila) => { const d = +fila.dataset.dia, [a, b] = $$('input[type="time"]', fila); n.horario[d] = { abre: a.value || "09:00", cierra: b.value || "21:00", cerrado: !$("[data-abierto]", fila).checked }; });
      try { tocar(); } catch { /* el navegador se quedó sin lugar */ }
      if (local.get(CLAVE) && !local.get(CLAVE).includes(foto.slice(-40))) { n.foto = ""; aviso("No entró la foto en este navegador. Probá con una más chica."); }
      pintarLado();
      VISTAS.negocio();
      const m2 = $("#g-msg"); m2.className = "form__msg ok"; m2.textContent = "Cambios guardados.";
      const g = $("#g-guardar"); g.classList.add("is-ok"); g.innerHTML = tilde() + "Guardado";
      setTimeout(() => { if (g.isConnected) { g.classList.remove("is-ok"); g.textContent = "Guardar cambios"; } }, 2400);
      aviso("Cambios guardados.");
    });
  };

  // ---------- Cuenta ----------
  VISTAS.cuenta = () => {
    $("#vista").innerHTML = `
      <header class="vhead"><div><h1>Cuenta</h1><p class="vhead__frase">Tus datos para entrar al panel. Cada administrador tiene su usuario y su contraseña.</p></div></header>
      <div class="nform">
        <section class="ajuste" aria-labelledby="cu-1"><div class="ajuste__r"><h2 id="cu-1">Tus datos</h2><p>Tu nombre aparece en el panel. El usuario es con el que entrás y no se puede cambiar.</p></div>
          <form class="ajuste__p" id="f-datos" novalidate>
            <div class="field"><label for="cu-nombre">Tu nombre</label><input id="cu-nombre" value="${esc(YO.nombre)}" autocomplete="name" aria-describedby="cu-nombre-err" /><p class="field__err" id="cu-nombre-err" hidden>Escribí tu nombre.</p></div>
            <div class="field"><label for="cu-user">Usuario</label><input id="cu-user" value="${esc(YO.usuario)}" disabled aria-describedby="cu-user-ayuda" /><p class="field__help" id="cu-user-ayuda">El usuario no se puede cambiar.</p></div>
            <div class="acciones"><button type="submit" class="btn btn--ink">Guardar</button></div>
          </form></section>
        <section class="ajuste" aria-labelledby="cu-2"><div class="ajuste__r"><h2 id="cu-2">Cambiar contraseña</h2><p>Usá al menos 8 caracteres. Cada vez que abrís o refrescás el panel te la pide de nuevo.</p></div>
          <form class="ajuste__p" id="f-clave" novalidate>
            <input type="text" autocomplete="username" value="${esc(YO.usuario)}" hidden />
            <div class="field"><label for="cu-a">Contraseña actual</label><input id="cu-a" type="password" autocomplete="current-password" aria-describedby="cu-a-err" /><p class="field__err" id="cu-a-err" hidden>La contraseña actual no coincide.</p></div>
            <div class="field"><label for="cu-n">Contraseña nueva</label><input id="cu-n" type="password" autocomplete="new-password" aria-describedby="cu-n-err" /><p class="field__err" id="cu-n-err" hidden>Usá al menos 8 caracteres.</p></div>
            <div class="field"><label for="cu-r">Repetí la nueva</label><input id="cu-r" type="password" autocomplete="new-password" aria-describedby="cu-r-err" /><p class="field__err" id="cu-r-err" hidden>Las dos contraseñas no coinciden.</p></div>
            <div class="acciones"><button type="submit" class="btn btn--ink">Cambiar contraseña</button></div>
          </form></section>
        <section class="ajuste" aria-labelledby="cu-3"><div class="ajuste__r"><h2 id="cu-3">Datos de prueba</h2><p>En esta vista previa, todo se guarda solo en este navegador.</p></div>
          <div class="ajuste__p peligro"><p>Si borrás todo, vuelve el negocio de ejemplo y se pierden las cuentas que creaste.</p>
          <button type="button" class="btn btn--warn" id="cu-reset">Borrar todo y volver al ejemplo</button></div></section>
      </div>`;
    $("#f-datos").addEventListener("submit", (e) => {
      e.preventDefault();
      const nom = $("#cu-nombre").value.trim();
      if (!marcar($("#cu-nombre"), "cu-nombre-err", !nom)) return;
      YO.nombre = nom; guardar(); pintarLado(); aviso("Datos guardados.");
    });
    $("#f-clave").addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = $("#cu-a").value, nn = $("#cu-n").value, rr = $("#cu-r").value;
      const okA = marcar($("#cu-a"), "cu-a-err", (await hashear(a, YO.sal)) !== YO.hash);
      const okN = marcar($("#cu-n"), "cu-n-err", nn.length < 8);
      const okR = marcar($("#cu-r"), "cu-r-err", nn !== rr || !rr);
      if (!okA || !okN || !okR) return;
      YO.sal = nuevaSal(); YO.hash = await hashear(nn, YO.sal); guardar();
      e.target.reset(); aviso("Contraseña cambiada.");
    });
    $("#cu-reset").addEventListener("click", async (e) => {
      if (e.currentTarget.dataset.seguro !== "1") { e.currentTarget.dataset.seguro = "1"; e.currentTarget.textContent = "Tocá de nuevo para confirmar"; return; }
      local.del(CLAVE); await cargar(); salir(); aviso("Listo. Volvió el negocio de ejemplo.");
    });
  };

  // ---------- Arranque ----------
  // Cada vez que se carga o se refresca la página, se pide usuario y contraseña de nuevo:
  // la sesión vive solo en memoria y no se guarda en el navegador.
  sesion.del(CLAVE_SES); sesion.del(CLAVE_VISTA);
  cargar().then(() => mostrarEntrada());
})();

// Toque en pantallas táctiles: mientras el dedo apoya, el botón se aprieta (.is-apreta); al soltar,
// se agranda un poco y el color queda un momento (.is-suelta) antes de apagarse despacio.
// Si el dedo arrastra para hacer scroll, no queda marcado.
(() => {
  const tactil = window.matchMedia("(hover: none), (pointer: coarse)");
  const SEL = ".pa .btn, .menu__i, .slot, .nav-fecha button, .lado__salir";
  const QUEDA = 450; // ms que el color queda prendido después de soltar
  let apretado = null;
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !tactil.matches) return;
    const el = e.target.closest(SEL);
    if (!el || el.disabled) return;
    clearTimeout(el._toque);
    el.classList.remove("is-suelta");
    el.classList.add("is-apreta");
    apretado = el;
  }, { passive: true });
  const soltar = (e) => {
    const el = apretado;
    if (!el) return;
    apretado = null;
    el.classList.remove("is-apreta");
    if (e.type === "pointercancel") return;
    el.classList.add("is-suelta");
    el._toque = setTimeout(() => el.classList.remove("is-suelta"), QUEDA);
  };
  document.addEventListener("pointerup", soltar, { passive: true });
  document.addEventListener("pointercancel", soltar, { passive: true });
})();
