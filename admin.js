// Bookea — panel del negocio.
// Dos modos, según config.js:
//   · Nube (config.js con los datos de Supabase): cada cuenta (email y contraseña) queda atada a su negocio
//     y todo se guarda en la base; la base solo deja ver y cambiar los datos del propio negocio (nube.js).
//   · Prueba (config.js vacío): las cuentas, el negocio y las reservas se guardan en este navegador
//     (localStorage), con las contraseñas como hash SHA-256 con sal, nunca en texto (almacenLocal, abajo).
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
        cuentas: [{ email: "demo@example.com", usuario: "losalamos", nombre: "Martín", negocio: "n1", rol: "dueno", sal, hash: await hashear("bookea2026", sal) }],
        negocios: { n1: neg }, reservas: { n1: reservasDemo(neg) }, sig: 100000,
      };
      guardar();
    } else if (!DB.demoTocado && DB.negocios.n1 && diasEntre(DB.semilla, hoy) > 1) {
      // los datos de ejemplo se corren solos al día de hoy mientras nadie los toque
      DB.reservas.n1 = reservasDemo(DB.negocios.n1); DB.semilla = hoy; guardar();
    }
    // cuentas de antes, creadas con usuario: entran con el usuario o con el email de ejemplo
    for (const c of DB.cuentas) if (!c.email) c.email = c.usuario === "losalamos" ? "demo@example.com" : c.usuario;
    if (completarCuentas(DB)) guardar();
  };
  // Cuentas guardadas antes de que existiera Equipo (16/11): no tenían "rol" y eran todas dueñas. Se completa al cargar y
  // al releer los datos (si no, al volver a la pestaña el panel creía que el dueño ya no tenía permisos y dejaba solo Cuenta).
  const completarCuentas = (db) => {
    let cambio = false;
    for (const c of (db && db.cuentas) || []) {
      if (!c.rol) { c.rol = "dueno"; cambio = true; }
      if (!Array.isArray(c.permisos)) { c.permisos = []; cambio = true; }
    }
    return cambio;
  };
  // ids únicos en cualquier dispositivo (la base los usa como clave de cada reserva)
  const nuevoId = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = hex(b); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  // ---------- Equipo: qué puede hacer cada persona ----------
  // El dueño puede todo y además maneja el equipo. El resto, lo que le habilitó el dueño.
  // La base hace cumplir "turnos" y "negocio" (ver supabase/esquema.sql); el panel además esconde lo que no corresponde.
  const PERMISOS = [
    { k: "agenda", t: "Ver la agenda", c: "Agenda", d: "Los turnos de cada día y de la semana." },
    { k: "turnos", t: "Cargar y cambiar turnos", c: "Cargar turnos", d: "Cargar turnos y bloqueos, cancelarlos y marcar si pagaron o si no vinieron." },
    { k: "clientes", t: "Ver Clientes", c: "Clientes", d: "La lista de clientes, con su WhatsApp." },
    { k: "finanzas", t: "Ver Finanzas", c: "Finanzas", d: "Lo que entró, las señas y lo que falta cobrar." },
    { k: "negocio", t: "Cambiar Mi negocio", c: "Mi negocio", d: "Datos, horarios, precios, canchas y el link de reservas." },
  ];
  const CLAVES_PERMISO = PERMISOS.map((x) => x.k);
  // Sin repetidos ni inventados; cargar turnos incluye ver la agenda (igual que la base)
  const limpiarPermisos = (lista) => {
    const s = new Set((lista || []).filter((x) => CLAVES_PERMISO.includes(x)));
    if (s.has("turnos")) s.add("agenda");
    return [...s].sort();
  };
  const PERMISOS_NUEVO = ["agenda", "turnos"]; // lo que viene tildado al sumar a alguien
  const VENCE_INVITACION = 7 * 864e5;

  // ---------- Dónde se guarda todo ----------
  // Con config.js completo, en la base (Supabase): cada cuenta con su negocio. Si no, modo de prueba en este navegador.
  const CONFIG = window.BOOKEA_CONFIG || {};
  const NUBE = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey && window.BookeaNube);
  const correo = (t) => String(t || "").trim().toLowerCase();
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const primerNombre = (t) => String(t || "").trim().split(/\s+/)[0] || "";

  const almacenLocal = () => {
    let yo = null, sinNegocio = null;
    const datosDe = (c) => {
      if (!c.rol) c.rol = "dueno";
      if (!Array.isArray(c.permisos)) c.permisos = [];
      return { cuenta: c, negocio: DB.negocios[c.negocio], reservas: DB.reservas[c.negocio] || (DB.reservas[c.negocio] = []) };
    };
    const invs = () => (DB.invitaciones = DB.invitaciones || []);
    const vigente = (i) => i && !i.usada && i.vence > Date.now() && DB.negocios[i.negocio];
    const esDueno = () => yo && yo.rol === "dueno";
    // Suma una cuenta al equipo con los permisos de la invitación (como unir_por_invitacion en la base)
    const unir = (c, token) => {
      const i = invs().find((x) => x.token === token);
      if (!vigente(i)) return { ok: false, error: "invitacion-vencida" };
      if (correo(c.email) !== i.email) return { ok: false, error: "invitacion-otro-email" };
      if (c.negocio && DB.negocios[c.negocio]) return { ok: false, error: "ya-en-negocio" };
      Object.assign(c, { negocio: i.negocio, rol: "encargado", permisos: limpiarPermisos(i.permisos) });
      if (!c.nombre) c.nombre = i.nombre;
      i.usada = Date.now();
      guardar();
      return { ok: true };
    };
    return {
      modo: "local",
      async sesionActual() { return { ok: false, error: "sin-sesion" }; },
      async ingresar(email, clave) {
        const c = DB.cuentas.find((x) => x.email === email || x.usuario === email);
        if (!c || (await hashear(clave, c.sal)) !== c.hash) return { ok: false, error: "credenciales" };
        if (!c.negocio || !DB.negocios[c.negocio]) { sinNegocio = c; return { ok: false, error: "sin-negocio" }; }
        yo = c;
        return { ok: true, datos: datosDe(c) };
      },
      async registrar({ nombre, negocio, rubro, email, clave }) {
        if (DB.cuentas.some((c) => c.email === email)) return { ok: false, error: "existe" };
        const id = "n" + Date.now().toString(36), sal = nuevaSal();
        DB.negocios[id] = negocioNuevo(id, negocio, rubro);
        DB.reservas[id] = [];
        const c = { email, nombre, negocio: id, rol: "dueno", sal, hash: await hashear(clave, sal) };
        DB.cuentas.push(c); guardar(); yo = c;
        return { ok: true, datos: datosDe(c) };
      },
      async salir() { yo = null; sinNegocio = null; },
      async guardar(neg) {
        if (Object.values(DB.negocios).some((o) => o.id !== neg.id && o.slug === neg.slug)) return { ok: false, error: "slug" };
        if (neg.id === "n1") DB.demoTocado = true;
        guardar();
        return { ok: true };
      },
      async recargar() {
        if (!yo) return { ok: false, error: "sesion" };
        if (!yo.negocio || !DB.negocios[yo.negocio]) return { ok: false, error: "sin-negocio" };
        return { ok: true, datos: datosDe(yo) };
      },
      async cambiarNombre(nombre) { yo.nombre = nombre; guardar(); return { ok: true }; },
      async cambiarClave(actual, nueva) {
        if ((await hashear(actual, yo.sal)) !== yo.hash) return { ok: false, error: "actual-mal" };
        yo.sal = nuevaSal(); yo.hash = await hashear(nueva, yo.sal); guardar();
        return { ok: true };
      },
      async recuperar() { return { ok: false, error: "local" }; },
      alRecuperar() {},
      async ponerClave() { return { ok: false, error: "local" }; },

      // ---------- Equipo ----------
      async equipo() {
        if (!esDueno()) return { ok: false, error: "permiso" };
        const ahora_ = Date.now();
        return {
          ok: true,
          miembros: DB.cuentas.filter((c) => c.negocio === yo.negocio)
            .sort((a, b) => (a.rol === "dueno" ? -1 : b.rol === "dueno" ? 1 : 0))
            .map((c) => ({ id: c.email, rol: c.rol || "dueno", permisos: c.permisos || [], nombre: c.nombre || "", email: c.email, yo: c === yo })),
          invitaciones: invs().filter((i) => i.negocio === yo.negocio && !i.usada && i.vence > ahora_)
            .map((i) => ({ id: i.id, email: i.email, nombre: i.nombre, permisos: i.permisos, token: i.token, vence: new Date(i.vence).toISOString() })),
        };
      },
      async invitar({ email, nombre, permisos }) {
        if (!esDueno()) return { ok: false, error: "permiso" };
        const e = correo(email);
        if (!EMAIL_OK.test(e)) return { ok: false, error: "email-invalido" };
        if (DB.cuentas.some((c) => c.negocio === yo.negocio && c.email === e)) return { ok: false, error: "ya-en-equipo" };
        DB.invitaciones = invs().filter((i) => !(i.negocio === yo.negocio && i.email === e && !i.usada));
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        DB.invitaciones.push({ id: nuevoId(), negocio: yo.negocio, email: e, nombre: String(nombre || "").trim().slice(0, 80), permisos: limpiarPermisos(permisos), token, creado: Date.now(), vence: Date.now() + VENCE_INVITACION, usada: null });
        guardar();
        return { ok: true, token };
      },
      async anularInvitacion(id) {
        if (!esDueno()) return { ok: false, error: "permiso" };
        DB.invitaciones = invs().filter((i) => !(i.id === id && i.negocio === yo.negocio && !i.usada));
        guardar();
        return { ok: true };
      },
      async cambiarPermisos(id, permisos) {
        const c = esDueno() && DB.cuentas.find((x) => x.email === id && x.negocio === yo.negocio && x.rol === "encargado");
        if (!c) return { ok: false, error: "permiso" };
        c.permisos = limpiarPermisos(permisos); guardar();
        return { ok: true, permisos: c.permisos };
      },
      async quitarMiembro(id) {
        const c = esDueno() && DB.cuentas.find((x) => x.email === id && x.negocio === yo.negocio && x.rol === "encargado");
        if (!c) return { ok: false, error: "permiso" };
        c.negocio = null; c.permisos = []; guardar(); // la cuenta sigue, pero sin negocio
        return { ok: true };
      },
      async verInvitacion(token) {
        const i = invs().find((x) => x.token === token);
        if (!i || !DB.negocios[i.negocio]) return { ok: false, error: "invitacion-no-existe" };
        return { ok: true, invitacion: { negocio: DB.negocios[i.negocio].nombre, email: i.email, nombre: i.nombre, permisos: i.permisos, valida: !!vigente(i) } };
      },
      async unirse({ token, nombre, email, clave }) {
        const i = invs().find((x) => x.token === token);
        if (!vigente(i)) return { ok: false, error: "invitacion-vencida" };
        if (correo(email) !== i.email) return { ok: false, error: "invitacion-otro-email" };
        if (DB.cuentas.some((c) => c.email === correo(email))) return { ok: false, error: "existe" };
        const sal = nuevaSal();
        const c = { email: correo(email), nombre, negocio: null, rol: "encargado", permisos: [], sal, hash: await hashear(clave, sal) };
        DB.cuentas.push(c);
        const r = unir(c, token);
        if (!r.ok) { guardar(); return r; }
        yo = c;
        return { ok: true, datos: datosDe(c) };
      },
      // "Tu página" en el modo de prueba: las fotos quedan dentro del navegador (achicadas: el lugar es poco)
      subirFoto(blob) {
        return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok({ ok: true, url: String(r.result) }); r.onerror = () => ok({ ok: false, error: "otro" }); r.readAsDataURL(blob); });
      },
      async borrarFoto() { return { ok: true }; },
      async aceptarInvitacion(token) {
        const c = sinNegocio || yo;
        if (!c) return { ok: false, error: "sesion" };
        const r = unir(c, token);
        if (!r.ok) return r;
        yo = c; sinNegocio = null;
        return { ok: true, datos: datosDe(c) };
      },
    };
  };
  const store = NUBE ? window.BookeaNube.crear(CONFIG) : almacenLocal();

  const MENSAJES = {
    credenciales: "El email o la contraseña no coinciden.",
    "sin-confirmar": "Todavía no confirmaste tu email. Buscá el mail de Bookea (fijate también en spam) y tocá el link.",
    muchos: "Probaste muchas veces seguidas. Esperá unos minutos y volvé a intentar.",
    red: "No hay conexión. Revisá internet y probá de nuevo.",
    libreria: "No pudimos conectarnos con Bookea. Revisá internet y recargá la página.",
    "sin-negocio": "Tu cuenta no está en ningún negocio. Si te invitaron a un equipo, abrí el link que te mandaron.",
    cliente: "Esta cuenta es para reservar turnos: tus turnos están en Mis turnos, en la página de reservas (bookea.ar). El panel es para negocios.",
    permiso: "No tenés permiso para hacer eso. Si lo necesitás, pedíselo al dueño del negocio.",
    "sin-fotos": "Todavía no se pueden guardar fotos: falta un paso de configuración en Bookea.",
    "ya-en-equipo": "Esa persona ya está en tu equipo.",
    "ya-en-negocio": "Esa cuenta ya está en un negocio. Usá otro email.",
    "invitacion-vencida": "Este link ya se usó o venció. Pedile al dueño del negocio uno nuevo.",
    "invitacion-no-existe": "Este link no es válido. Revisá que esté completo o pedile al dueño del negocio uno nuevo.",
    "invitacion-otro-email": "Ese no es el email al que te invitaron.",
    existe: "Ya hay una cuenta con ese email. Ingresá con él o pedí una contraseña nueva.",
    "clave-debil": "Esa contraseña es muy fácil de adivinar. Probá con una más larga, con letras y números.",
    "email-invalido": "Ese email no parece válido. Revisalo.",
    "sin-permiso": "Solo el equipo de Bookea puede hacer eso.",
    "email-no-autorizado": "Por ahora Bookea no puede mandar mails a esa dirección. Probá con otro email o volvé a intentar en unos días.",
    sesion: "Tu sesión venció. Volvé a ingresar.",
    otro: "Algo salió mal. Probá de nuevo en un rato.",
  };
  const ocupado = (btn, si, txt) => {
    if (si) { btn.dataset.txt = btn.textContent; btn.textContent = txt; btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
    else { if (btn.dataset.txt) btn.textContent = btn.dataset.txt; btn.disabled = false; btn.removeAttribute("aria-busy"); }
  };

  // ---------- Sesión ----------
  let YO = null, NEG = null, RES = null;
  // Un negocio recién creado en la base llega sin ajustes: se completan con los de un negocio nuevo
  const completarNegocio = (n) => {
    const base = negocioNuevo(n.id, n.nombre || "Mi negocio", n.rubro || "", n.slug);
    for (const k of Object.keys(base)) if (n[k] === undefined || n[k] === null) n[k] = base[k];
    if (!Array.isArray(n.recursos) || !n.recursos.length) n.recursos = base.recursos;
    if (!Array.isArray(n.horario) || n.horario.length !== 7) n.horario = base.horario;
    if (!Array.isArray(n.franjas)) n.franjas = base.franjas;
    return n;
  };

  // Guardado: cada cambio se manda en orden, uno detrás del otro
  let cola = Promise.resolve({ ok: true }), reintento = null;
  const sincronizar = () => (cola = cola.then(async () => {
    if (!NEG) return { ok: true };
    let r;
    try { r = await store.guardar(NEG, RES); } catch { r = { ok: false, error: "red" }; }
    if (!r.ok) avisarError(r);
    else if (reintento) { clearTimeout(reintento); reintento = null; }
    return r;
  }));
  const tocar = () => { sincronizar(); };
  const avisarError = (r) => {
    if (r.error === "slug") return; // lo muestra Mi negocio, al lado del campo
    if (r.error === "ocupado") { aviso("Ese horario ya lo ocupó otra reserva, quizás desde otro dispositivo. Actualizamos la agenda."); actualizar(true); return; }
    if (r.error === "sesion") { aviso(MENSAJES.sesion); salir({ vencida: true }); return; }
    // la base no dejó guardar (le sacaron un permiso mientras tenía el panel abierto): se vuelve a lo que hay en la base
    if (r.error === "permiso") { aviso(MENSAJES.permiso); actualizar(true); return; }
    if (r.error === "invalido") { aviso("Ese dato no se pudo guardar: revisá que no sea demasiado largo."); return; }
    aviso(r.error === "red" ? "No se pudo guardar: parece que no hay conexión. Lo volvemos a intentar solo." : "No se pudo guardar el último cambio. Lo volvemos a intentar.");
    clearTimeout(reintento); reintento = setTimeout(() => { reintento = null; sincronizar(); }, 8000);
  };
  window.addEventListener("online", () => { if (NEG) sincronizar(); });

  // Trae lo último de la base (por si se cargó algo desde otro celular o computadora)
  const hayEdicion = () => { const a = document.activeElement; return !!(a && a.closest && a.closest("#vista") && a.matches("input, textarea, select")); };
  const actualizar = async (forzar = false) => {
    if (store.modo !== "nube" || !NEG) return;
    const g = await sincronizar();
    if (!g.ok && !forzar) return; // primero tiene que quedar guardado lo de este dispositivo
    if (!forzar && (dlg.open || hayEdicion())) return;
    const r = await store.recargar();
    if (!r.ok || !NEG) {
      if (r.error === "sesion") { aviso(MENSAJES.sesion); salir({ vencida: true }); }
      if (r.error === "sin-negocio") { await salir({ vencida: true }); aviso("Ya no estás en el equipo de este negocio."); }
      return;
    }
    for (const k of Object.keys(NEG)) delete NEG[k];
    Object.assign(NEG, completarNegocio(r.datos.negocio));
    RES.splice(0, RES.length, ...r.datos.reservas);
    const antes = JSON.stringify([YO.rol, YO.permisos]);
    YO.rol = r.datos.cuenta.rol; YO.permisos = r.datos.cuenta.permisos || [];
    const cambiaron = antes !== JSON.stringify([YO.rol, YO.permisos]);
    pintarLado(); pintarMenu();
    if (!puedeVer(vistaActual)) { cerrarDlg(); ir(primeraVista()); aviso("Cambiaron tus permisos en este negocio."); return; }
    if (cambiaron && !hayEdicion()) { cerrarDlg(); refrescar(); aviso("Cambiaron tus permisos en este negocio."); return; }
    if (["agenda", "finanzas", "clientes"].includes(vistaActual) && !hayEdicion()) refrescar();
  };
  // En el modo de prueba también: así, si el dueño cambia permisos en otra pestaña, se ve al volver
  document.addEventListener("visibilitychange", () => { if (store.modo === "local" && document.visibilityState === "visible" && NEG) recargarLocal(); });
  const recargarLocal = async () => {
    try { DB = JSON.parse(local.get(CLAVE)) || DB; } catch { /* queda lo que había */ }
    if (completarCuentas(DB)) guardar();
    if (!YO) return;
    const c = DB.cuentas.find((x) => x.email === YO.email);
    if (!c || !c.negocio || !DB.negocios[c.negocio]) { await salir({ vencida: true }); aviso("Ya no estás en el equipo de este negocio."); return; }
    const antes = JSON.stringify([YO.rol, YO.permisos]);
    YO.rol = c.rol; YO.permisos = c.permisos || [];
    if (antes === JSON.stringify([YO.rol, YO.permisos])) return;
    pintarMenu();
    if (!puedeVer(vistaActual)) ir(primeraVista()); else if (!hayEdicion()) refrescar();
    aviso("Cambiaron tus permisos en este negocio.");
  };
  if (NUBE) {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") actualizar(); });
    setInterval(() => { if (document.visibilityState === "visible") actualizar(); }, 60000);
  }

  const entrar = (datos, vistaInicial) => {
    YO = datos.cuenta; NEG = completarNegocio(datos.negocio); RES = datos.reservas;
    if (!YO.rol) YO.rol = "dueno";
    if (!Array.isArray(YO.permisos)) YO.permisos = [];
    $("#entrada").hidden = true; $("#cargando").hidden = true; $("#panel").hidden = false;
    pintarLado(); pintarMenu();
    ir(primeraVista(vistaInicial || "agenda"), { foco: false });
    if (store.modo === "nube") sincronizar(); // un negocio nuevo guarda acá sus ajustes iniciales
  };
  const salir = async (opc) => {
    const vencida = !!(opc && opc.vencida === true);
    sesion.del(CLAVE_SES); sesion.del(CLAVE_VISTA);
    YO = NEG = RES = null; ESPERA = null;
    $("#ir-solicitudes").hidden = true;
    await store.salir();
    mostrarEntrada();
    if (!vencida) aviso("Cerraste sesión.");
  };
  const FORMS = { ingresar: "#f-ingresar", registro: "#f-registro", olvido: "#f-olvido", nueva: "#f-nueva", espera: "#f-espera", unirse: "#f-unirse" };
  const FOCO = { ingresar: "#i-email", registro: "#r-nombre", olvido: "#o-email", nueva: "#nc-clave", espera: "#es-volver", unirse: "#u-nombre" };
  const mostrarEntrada = (cual = "ingresar") => {
    $("#panel").hidden = true; $("#cargando").hidden = true; $("#entrada").hidden = false;
    for (const [k, sel] of Object.entries(FORMS)) $(sel).hidden = k !== cual;
    const f = $(FOCO[cual]);
    f && f.focus({ preventScroll: true });
  };
  // ---------- Aprobación: un negocio nuevo espera a que el equipo de Bookea lo apruebe ----------
  // Devuelve true si entró al panel. El equipo de Bookea entra siempre (para poder aprobar).
  let ESPERA = null;
  const pasar = (datos, vista, alEntrar) => {
    const n = datos.negocio || {};
    if (store.modo === "nube" && n.estado && n.estado !== "aprobado" && !datos.cuenta.admin) { mostrarEspera(datos); return false; }
    entrar(datos, vista);
    if (alEntrar) alEntrar();
    if (YO.admin) avisarSolicitudes();
    return true;
  };
  const mostrarEspera = (datos) => {
    ESPERA = datos;
    const n = datos.negocio, rech = n.estado === "rechazado";
    $("#t-espera").textContent = rech ? "Tu solicitud no fue aprobada" : "Tu negocio está en revisión";
    $("#es-texto").textContent = rech
      ? `Por ahora ${n.nombre} no puede usar el panel de Bookea. Si creés que es un error, contactá al equipo de Bookea.`
      : `Recibimos la solicitud de ${n.nombre}. El equipo de Bookea la revisa y, cuando esté aprobada, vas a poder entrar al panel con tu email y tu contraseña.`;
    $("#es-volver").hidden = rech;
    $("#es-msg").textContent = "";
    mostrarEntrada("espera");
  };
  $("#es-volver").addEventListener("click", async (e) => {
    const btn = e.currentTarget, msg = $("#es-msg");
    ocupado(btn, true, "Fijándome…");
    const r = await store.recargar();
    ocupado(btn, false);
    if (!r.ok) { msg.className = "form__msg err"; msg.textContent = MENSAJES[r.error] || MENSAJES.otro; return; }
    if (pasar(r.datos, "negocio", saludar)) return;
    msg.className = "form__msg"; msg.textContent = "Todavía está en revisión. Probá de nuevo más tarde.";
  });
  $("#es-salir").addEventListener("click", async () => { ESPERA = null; await store.salir(); mostrarEntrada(); });

  // Equipo de Bookea: cuántas solicitudes esperan respuesta
  const avisarSolicitudes = async () => {
    if (!YO || !YO.admin || !store.solicitudes) return;
    const r = await store.solicitudes();
    if (!r.ok || !YO) return;
    const n = r.lista.filter((x) => x.estado === "pendiente").length;
    $("#ir-solicitudes").hidden = false;
    $("#sol-n").hidden = !n; $("#sol-n").textContent = n;
    if (n) aviso(n === 1 ? "Hay 1 negocio nuevo esperando tu aprobación." : `Hay ${n} negocios nuevos esperando tu aprobación.`);
    if (NEG && NEG.estado !== "aprobado") aviso("Tu propio negocio también está pendiente: aprobalo en Solicitudes para poder guardar.");
  };
  $("#ir-solicitudes").addEventListener("click", async () => { if (await dejarNegocio("solicitudes")) ir("solicitudes"); });

  const pintarLado = () => {
    $("#lado-neg").textContent = NEG.nombre;
    $("#lado-det").textContent = [NEG.rubro, NEG.ciudad].filter(Boolean).join(" · ") || "Completá los datos en Mi negocio";
    $("#lado-mono").innerHTML = NEG.foto ? `<img src="${NEG.foto}" alt="" />` : esc(iniciales(NEG.nombre));
    $("#lado-av").textContent = iniciales(YO.nombre || YO.email).slice(0, 1);
    $("#lado-user").innerHTML = `<b>${esc(YO.nombre || "Tu cuenta")}</b>${esc(YO.email)}`;
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
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.ir === "olvido") { $("#o-email").value = $("#i-email").value.trim(); $("#o-msg").textContent = ""; }
    mostrarEntrada(b.dataset.ir);
  }));
  const saludar = () => { const p = primerNombre(YO.nombre); bienvenida(p ? `Hola, ${p}.` : "Hola.", NEG.nombre); };
  $("#f-ingresar").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#i-msg"), btn = $('button[type="submit"]', e.target);
    const email = correo($("#i-email").value), c = $("#i-clave").value;
    msg.className = "form__msg err";
    if (Date.now() < bloqueadoHasta) { msg.textContent = `Probaste muchas veces. Esperá ${Math.ceil((bloqueadoHasta - Date.now()) / 1000)} segundos.`; return; }
    if (!email || !c) { msg.textContent = "Escribí tu email y tu contraseña."; return; }
    ocupado(btn, true, "Entrando…");
    const r = await store.ingresar(email, c);
    ocupado(btn, false);
    if (!r.ok) {
      if (r.error === "credenciales") {
        fallos++;
        if (fallos >= 5) { bloqueadoHasta = Date.now() + 30000; fallos = 0; msg.textContent = "Probaste muchas veces. Esperá 30 segundos."; }
        else msg.textContent = MENSAJES.credenciales;
        $("#i-clave").select();
      } else msg.textContent = MENSAJES[r.error] || MENSAJES.otro;
      return;
    }
    fallos = 0; msg.textContent = ""; $("#i-clave").value = "";
    pasar(r.datos, "agenda", saludar);
  });
  // Antes de entrar: si la cuenta no tiene negocio y vino con el link de una invitación, la acepta
  const ingresarOriginal = store.ingresar.bind(store);
  store.ingresar = async (email, clave) => {
    const r = await ingresarOriginal(email, clave);
    if (r.ok || r.error !== "sin-negocio" || !INVITACION || !store.aceptarInvitacion) return r;
    const r2 = await store.aceptarInvitacion(INVITACION);
    if (r2.ok) sacarInvitacionDeLaDireccion();
    return r2;
  };

  // ---------- Entrada: me olvidé la contraseña (solo con la base) ----------
  $("#f-olvido").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#o-msg"), btn = $('button[type="submit"]', e.target), email = correo($("#o-email").value);
    msg.textContent = "";
    if (!marcar($("#o-email"), "o-email-err", !EMAIL_OK.test(email))) return;
    ocupado(btn, true, "Mandando…");
    const r = await store.recuperar(email);
    ocupado(btn, false);
    if (!r.ok) { msg.className = "form__msg err"; msg.textContent = MENSAJES[r.error] || MENSAJES.otro; return; }
    msg.className = "form__msg ok";
    msg.textContent = `Listo. Si ${email} tiene una cuenta, te llega un mail con el link para elegir la contraseña nueva. Fijate también en spam.`;
  });
  $("#f-nueva").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#nc-msg"), btn = $('button[type="submit"]', e.target), n = $("#nc-clave").value, n2 = $("#nc-clave2").value;
    msg.textContent = "";
    const ok = [
      marcar($("#nc-clave"), "nc-clave-err", n.length < 8 ? "Usá al menos 8 caracteres." : false),
      marcar($("#nc-clave2"), "nc-clave2-err", n2 !== n || !n2),
    ];
    if (ok.includes(false)) return;
    ocupado(btn, true, "Guardando…");
    const r = await store.ponerClave(n);
    ocupado(btn, false);
    if (!r.ok) {
      if (r.error === "clave-debil") { marcar($("#nc-clave"), "nc-clave-err", MENSAJES["clave-debil"]); return; }
      msg.textContent = r.error === "sesion" ? "El link venció. Pedí uno nuevo desde “¿Te olvidaste la contraseña?”." : MENSAJES[r.error] || MENSAJES.otro;
      return;
    }
    e.target.reset();
    if (pasar(r.datos, "agenda")) aviso("Listo, ya tenés tu contraseña nueva.");
  });
  store.alRecuperar(() => { $("#nc-email").value = (YO && YO.email) || ""; mostrarEntrada("nueva"); });

  // ---------- Entrada: crear cuenta ----------
  const marcar = (input, errId, texto) => {
    const err = document.getElementById(errId);
    if (texto) { if (texto !== true) err.textContent = texto; err.hidden = false; input.classList.add("is-invalid"); input.setAttribute("aria-invalid", "true"); }
    else { err.hidden = true; input.classList.remove("is-invalid"); input.removeAttribute("aria-invalid"); }
    return !texto;
  };
  const slugDe = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "minegocio";
  // Las dos direcciones del negocio (pedido del dueño, 21/11): bookea.ar/nombre es su página y bookea.ar/nombre/reservar,
  // sus turnos (ver 404.html). Desde el panel se abren con ?pagina= y ?lugar=, que andan en cualquier lado.
  // Estos nombres son de páginas de Bookea: ningún negocio los puede usar.
  const linkPagina = (slug) => "./?lugar=" + encodeURIComponent(slug);
  const linkWeb = (slug) => "./?pagina=" + encodeURIComponent(slug);
  const LINKS_DE_BOOKEA = ["admin", "index", "privacidad", "reservar", "assets", "marca"];
  const negocioNuevo = (id, nombre, rubro, slugDado) => {
    let slug = slugDado || slugDe(nombre), k = 2;
    const usados = new Set(!slugDado && DB ? Object.values(DB.negocios).map((n) => n.slug) : []);
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
    const v = (id) => document.getElementById(id), btn = $('button[type="submit"]', e.target), msg = $("#r-msg");
    const nombre = v("r-nombre").value.trim(), negocio = v("r-negocio").value.trim(), rubro = v("r-rubro").value.trim();
    const email = correo(v("r-email").value), clave = v("r-clave").value, clave2 = v("r-clave2").value;
    msg.textContent = "";
    const checks = [
      marcar(v("r-nombre"), "r-nombre-err", !nombre),
      marcar(v("r-negocio"), "r-negocio-err", !negocio),
      marcar(v("r-rubro"), "r-rubro-err", !rubro),
      marcar(v("r-email"), "r-email-err", !EMAIL_OK.test(email) ? "Escribí un email válido, por ejemplo nombre@gmail.com." : false),
      marcar(v("r-clave"), "r-clave-err", clave.length < 8 ? "Usá al menos 8 caracteres." : false),
      marcar(v("r-clave2"), "r-clave2-err", clave2 !== clave || !clave2),
    ];
    if (checks.includes(false)) { const p = $(".is-invalid", e.target); p && p.focus(); return; }
    ocupado(btn, true, "Creando tu cuenta…");
    const r = await store.registrar({ nombre, negocio, rubro, email, clave });
    ocupado(btn, false);
    if (!r.ok) {
      if (r.error === "existe" || r.error === "email-invalido" || r.error === "email-no-autorizado") { marcar(v("r-email"), "r-email-err", MENSAJES[r.error]); v("r-email").focus(); return; }
      if (r.error === "clave-debil") { marcar(v("r-clave"), "r-clave-err", MENSAJES["clave-debil"]); v("r-clave").focus(); return; }
      msg.textContent = MENSAJES[r.error] || MENSAJES.otro;
      return;
    }
    e.target.reset();
    if (r.confirmar) {
      // la base pide confirmar el email antes de entrar
      mostrarEntrada("ingresar");
      $("#i-email").value = email;
      const m = $("#i-msg"); m.className = "form__msg ok";
      m.textContent = store.modo === "nube"
        ? `Te mandamos un mail a ${email}. Abrilo y tocá el link para confirmar tu email. Después, el equipo de Bookea revisa tu negocio y, cuando esté aprobado, entrás acá con tu email y tu contraseña.`
        : `Te mandamos un mail a ${email}. Abrilo y tocá el link para activar la cuenta; después entrás acá con tu email y tu contraseña.`;
      return;
    }
    const p = primerNombre(nombre);
    pasar(r.datos, "negocio", () => bienvenida(p ? `Hola, ${p}.` : "Hola.", "Tu cuenta está lista.", () => aviso("Completá los datos de tu negocio.")));
  });

  // ---------- Navegación del panel ----------
  const VISTAS = {};
  let vistaActual = "agenda";
  // ¿Puede hacer "p"? El dueño, todo.
  const puede = (p) => !!YO && (YO.rol === "dueno" || (YO.permisos || []).includes(p));
  const esDueno = () => !!YO && YO.rol === "dueno";
  const VISTA_PERMISO = { agenda: "agenda", finanzas: "finanzas", clientes: "clientes", negocio: "negocio", pagina: "negocio" };
  const puedeVer = (v) => {
    if (v === "cuenta") return true;
    if (v === "equipo") return esDueno();
    if (v === "solicitudes") return !!(YO && YO.admin);
    return puede(VISTA_PERMISO[v]);
  };
  const primeraVista = (pref) => [pref, "agenda", "clientes", "finanzas", "negocio", "cuenta"].find((v) => v && VISTAS[v] && puedeVer(v));
  const pintarMenu = () => {
    $$(".menu__i").forEach((b) => (b.hidden = !puedeVer(b.dataset.vista)));
    // "Ver tu página de reservas" sirve a todos; "Solicitudes", solo al equipo de Bookea (lo maneja avisarSolicitudes)
  };
  // Si se sale de Mi negocio con cambios sin guardar, primero se guardan; si hay un dato mal cargado, se queda ahí
  let salirNegocio = null;
  const dejarNegocio = async (v) => !(salirNegocio && (vistaActual === "negocio" || vistaActual === "pagina") && v !== vistaActual) || (await salirNegocio());
  const ir = (v, { foco = true } = {}) => {
    if (!VISTAS[v] || !puedeVer(v)) v = primeraVista();
    vistaActual = v;
    salirNegocio = null;
    $$(".menu__i").forEach((b) => (b.dataset.vista === v ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    VISTAS[v]();
    if (foco) { window.scrollTo(0, 0); $("#vista").focus({ preventScroll: true }); }
  };
  $$(".menu__i").forEach((b) => b.addEventListener("click", async () => { if (await dejarNegocio(b.dataset.vista)) ir(b.dataset.vista); }));
  // Compu: al elegir una sección con el mouse, la barra desplegada se cierra enseguida (si no, tapaba los botones de la
  // izquierda de la vista nueva mientras el cursor seguía arriba). Se vuelve a abrir al sacar el cursor y volver a entrar.
  const lado = $(".lado");
  $(".menu").addEventListener("click", (e) => { if (e.detail > 0 && e.target.closest(".menu__i")) lado.classList.add("is-cerrada"); });
  lado.addEventListener("mouseleave", () => lado.classList.remove("is-cerrada"));
  $("#salir").addEventListener("click", async () => { await dejarNegocio(""); salir(); }); // intenta guardar lo pendiente, pero Salir nunca se traba

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
    const hoy = ahora(), pend = pendientes(), prox = proximos(), edita = puede("turnos");
    const filaPend = (r) => {
      if (!edita) return `<div class="lista__f"><p class="lista__h">${aHora(r.hora)}<small>${cuandoCorto(r.fecha, hoy.fecha)}</small></p>
        <div class="lista__q"><b>${esc(r.cliente)}</b><small>${esc(nombreRec(r.recurso))} · terminó a las ${aHora(r.hora + NEG.duracion)}</small></div></div>`;
      return `<div class="lista__f lista__f--acc"><p class="lista__h">${aHora(r.hora)}<small>${cuandoCorto(r.fecha, hoy.fecha)}</small></p>
        <div class="lista__q"><b>${esc(r.cliente)}</b><small>${esc(nombreRec(r.recurso))} · terminó a las ${aHora(r.hora + NEG.duracion)}</small></div>
        <div class="lista__acc"><button type="button" class="btn btn--ghost btn--sm" data-rapido="jugada" data-id="${r.id}" aria-label="${esc(`${r.cliente} pagó`)}">${ico("check")}Pagó</button><button type="button" class="btn btn--line btn--sm" data-rapido="ausente" data-id="${r.id}" aria-label="${esc(`${r.cliente} no vino`)}">No vino</button></div></div>`;
    };
    const filaProx = (r) => `<button type="button" class="lista__f lista__f--boton" data-res="${r.id}"><span class="lista__h">${aHora(r.hora)}<small>${cuandoCorto(r.fecha, hoy.fecha)}</small></span>
        <span class="lista__q"><b>${esc(r.cliente)}</b><small>${esc(nombreRec(r.recurso))}</small></span>
        <span class="punto ${r.sena ? "punto--v" : "punto--g"}">${r.sena ? "Con seña" : "Sin seña"}</span></button>`;
    // el próximo turno, grande y en noche: cuánto falta, a qué hora, quién y en qué cancha
    const enCuanto = (r) => {
      if (r.fecha !== hoy.fecha) return cuandoCorto(r.fecha, hoy.fecha);
      const m = r.hora - hoy.min;
      return m <= 0 ? "Ahora" : m < 60 ? `En ${m} min` : `En ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
    };
    const prox1 = (r) => `<button type="button" class="prox1" data-res="${r.id}">
        <span class="prox1__top"><span>Próximo turno</span><span class="prox1__en">${enCuanto(r)}</span></span>
        <span class="prox1__h">${aHora(r.hora)}</span>
        <span class="prox1__q"><b>${esc(r.cliente)}</b><small>${esc(nombreRec(r.recurso))} · ${aHora(r.hora)} a ${aHora(r.hora + NEG.duracion)}</small></span>
        <span class="punto ${r.sena ? "punto--v" : "punto--g"}">${r.sena ? "Con seña" : "Sin seña"}</span></button>`;
    const resto = prox.slice(1);
    return `<aside class="riel" aria-label="Para hacer y lo que viene">
        ${prox.length ? `<section class="riel__sec riel__ya" aria-label="Próximo turno">${prox1(prox[0])}</section>` : ""}
        <section class="riel__sec" aria-labelledby="pc-t">
          <h2 id="pc-t" tabindex="-1">Para cerrar ${pend.length ? `<span class="chip-n">${pend.length}</span>` : ""}</h2>
          <p>${pend.length ? (edita ? "Turnos que ya terminaron. Marcá si pagaron el resto o si no vinieron." : "Turnos que ya terminaron y todavía no se marcó si pagaron.") : "Acá aparecen los turnos que ya terminaron, para marcar si pagaron."}</p>
          <div class="lista">${pend.length ? pend.slice(0, 4).map(filaPend).join("") : `<p class="vacio-l">${ico("check")}Todo al día: no hay turnos sin marcar.</p>`}</div>
          ${pend.length > 4 ? `<p>Y ${plural(pend.length - 4, "turno más", "turnos más")}: están en la agenda de cada día.</p>` : ""}
        </section>
        <section class="riel__sec riel__prox" aria-labelledby="px-t">
          <h2 id="px-t">Próximos turnos</h2>
          <div class="lista">${resto.length ? resto.map(filaProx).join("") : `<p class="vacio-l">${prox.length ? "No hay más turnos reservados para los próximos días." : "No hay turnos reservados para los próximos días."}</p>`}</div>
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
        <div class="vhead__acc">${puede("turnos") ? `<button type="button" class="btn btn--naranja" data-nuevo>${ico("mas", "ico-mas")}Cargar turno</button>` : `<p class="solo-ver">${ico("candado")}Podés ver la agenda. Para cargar turnos, pedile permiso al dueño.</p>`}</div>
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
    const nuevo = $("[data-nuevo]", v);
    nuevo && nuevo.addEventListener("click", () => dlgNuevo({ fecha: AG.fecha }));
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
        else if (!puede("turnos")) h += `<span class="slot slot--libre slot--ver" aria-label="${esc(`${rec.nombre} de ${rangoT}: libre`)}"><b>Libre</b><small class="slot__t">${donde}</small></span>`;
        else h += `<button type="button" class="slot slot--libre" data-libre data-rec="${rec.id}" data-hora="${t}" aria-label="Cargar turno en ${esc(rec.nombre)} de ${rangoT}"><b>${ico("mas")}Libre</b><small class="slot__t">${donde}</small></button>`;
      }
    }
    h += `</div><div class="leyenda" style="margin-top:16px">
      <span><i style="background:var(--v100)"></i>Con seña</span>
      <span><i style="background:#fff;box-shadow:inset 0 0 0 1px var(--control)"></i>Sin seña</span>
      <span><i style="background:#eceeee"></i>Pagado</span>
      <span><i style="background:var(--n100)"></i>No vino</span>
      <span><i style="background:var(--tx)"></i>Bloqueado</span>
      <span><i style="background:var(--v50);box-shadow:inset 0 0 0 1px var(--v100)"></i>${puede("turnos") ? "Libre: tocalo para cargar un turno" : "Libre"}</span></div>`;
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
    const edita = puede("turnos");
    if (r.estado === "bloqueo") {
      abrirDlg(`${cabezaDlg(`${rec} · ${cuando}`, "Horario bloqueado")}
        <p>${esc(r.nota || "Sin motivo cargado.")}</p>
        <div class="acciones">${edita ? `<button type="button" class="btn btn--warn" data-acc="quitar">Quitar el bloqueo</button>` : ""}<button type="button" class="btn btn--ghost" data-cerrar>Listo</button></div>`);
      return bindAcc(r);
    }
    if (paso === "cancelar" && edita) {
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
    if (!edita) acc = "";
    else if (r.estado === "confirmada") {
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
      ${edita ? `<div class="field"><label for="d-nota">Nota</label><textarea id="d-nota" rows="2" placeholder="Por ejemplo, traen paletas prestadas">${esc(r.nota)}</textarea></div>`
        : r.nota ? `<p class="nota-ver"><b>Nota:</b> ${esc(r.nota)}</p>` : ""}
      <div class="acciones">${acc}${wa ? `<a class="btn btn--ghost" href="${wa}" target="_blank" rel="noopener">${ico("chat")}Escribirle por WhatsApp</a>` : ""}</div>`);
    const nota = $("#d-nota");
    nota && nota.addEventListener("change", (e) => { r.nota = e.target.value.trim(); tocar(); aviso("Nota guardada."); });
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
    if (!puede("turnos")) return aviso(MENSAJES.permiso);
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
  // Finanzas en tarjetas (pedido del dueño, 19/11: "que ocupen menos espacio y se vean en una sola pantalla la mayoría",
  // y un gráfico más fácil de entender). Arriba lo cobrado con su gráfico y los últimos cobros; después cuatro tarjetas
  // chicas con las otras cifras; abajo el reparto por cancha y por horario.
  const enMiles = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M` : v >= 1000 ? `${Math.round(v / 1000).toLocaleString("es-AR")} mil` : String(Math.round(v)));
  const fechaC = (iso) => `${DIAS_C[dow(iso)]} ${corto(iso)}`;
  const mini = (id, k, v, n, { barra = null, alerta = false } = {}) =>
    `<section class="card fz-k${alerta ? " fz-k--alerta" : ""}" aria-labelledby="${id}"><h2 class="fz-k__k" id="${id}">${k}</h2><p class="fz-k__v">${v}</p>${barra !== null ? `<span class="fz-k__barra" aria-hidden="true"><i style="width:${Math.round(barra * 100)}%"></i></span>` : ""}<p class="fz-k__n">${n}</p></section>`;
  const reparto = (filas, total) => {
    if (!filas.length || !total) return `<p class="vacio-p">Todavía no entró plata en este período.</p>`;
    const max = Math.max(1, ...filas.map((f) => f.v));
    return `<ul class="rep">${filas.map((f) => `<li class="rep__f"><span class="rep__n">${esc(f.n)}</span><span class="rep__b" aria-hidden="true"><i style="width:${(f.v / max) * 100}%"></i></span><span class="rep__v">${plata(f.v)}<small>${pct(f.v / total)}</small></span></li>`).join("")}</ul>`;
  };
  VISTAS.finanzas = () => {
    const [desde, hasta] = rango(FIN.periodo), dias = diasEntre(desde, hasta) + 1;
    const R = resumen(desde, hasta), P = resumen(sumar(desde, -dias), sumar(desde, -1));
    const hoy = ahora().fecha, futuros = RES.filter((r) => r.fecha >= hoy && r.estado === "confirmada");
    const varCob = P.cobrado ? (R.cobrado - P.cobrado) / P.cobrado : 0;
    const porDia = [];
    for (let f = desde; f <= hasta; f = sumar(f, 1)) {
      const l = R.lista.filter((r) => r.fecha === f);
      porDia.push({ iso: f, v: l.reduce((s, r) => s + ingreso(r), 0), n: l.filter((r) => esTurno(r) && ocupa(r)).length, hoy: f === hoy });
    }
    // el promedio y el mejor día se cuentan sin hoy, que todavía está sumando; el promedio, sobre los días que entró plata
    const cerrados = porDia.filter((d) => !d.hoy), conCobro = cerrados.filter((d) => d.v > 0);
    const prom = conCobro.length ? conCobro.reduce((s, d) => s + d.v, 0) / conCobro.length : 0;
    const mejor = cerrados.reduce((a, d) => (d.v > (a ? a.v : 0) ? d : a), null);
    const conHoy = porDia.some((d) => d.hoy);
    const porRec = NEG.recursos.map((rec) => ({ n: rec.nombre, v: R.lista.filter((r) => r.recurso === rec.id).reduce((s, r) => s + ingreso(r), 0) }));
    const porFranja = NEG.franjas.map((fr) => {
      const d = aMin(fr.desde); let h = aMin(fr.hasta); if (h <= d) h += 1440;
      return { n: `${fr.desde} a ${fr.hasta}`, v: R.lista.filter((r) => { const m = r.hora % 1440, mm = m < d ? m + 1440 : m; return mm >= d && mm < h; }).reduce((s, r) => s + ingreso(r), 0) };
    });
    const movs = R.lista.filter((r) => ingreso(r) > 0).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.hora - a.hora);
    const prevD = sumar(desde, -dias), prevH = sumar(desde, -1), futPlata = futuros.reduce((s, r) => s + r.precio - r.sena, 0);
    const delta = P.cobrado
      ? `<span class="${varCob >= 0 ? "sube" : "baja"}">${varCob >= 0 ? "▲ +" : "▼ −"}${Math.abs(Math.round(varCob * 100))} %</span> contra los ${dias} días anteriores (${corto(prevD)} al ${corto(prevH)})`
      : `Del ${corto(desde)} al ${corto(hasta)}`;
    const U = unidad(NEG);
    const movFila = (r) => `<li class="mov"><div class="mov__q"><b>${esc(r.cliente)}</b><small>${fechaC(r.fecha)} · ${aHora(r.hora)} · ${CONCEPTO(r)} · ${esc(nombreRec(r.recurso))}</small></div><b class="mov__v">${plata(ingreso(r))}</b></li>`;
    const tablaMovs = () => `<div class="tabla-wrap"><table class="tabla tabla--cards"><thead><tr><th scope="col">Cliente</th><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">${esc(U)}</th><th scope="col" class="num">Monto</th></tr></thead><tbody>
          ${movs.map((r) => `<tr><td class="cli">${esc(r.cliente)}</td><td class="nowrap solo-pc">${fechaC(r.fecha)} · ${aHora(r.hora)}</td><td class="solo-pc">${CONCEPTO(r)}</td><td class="solo-pc gris">${esc(nombreRec(r.recurso))}</td><td class="num"><b>${plata(ingreso(r))}</b></td><td class="dato-2 solo-cel">${fechaC(r.fecha)} ${aHora(r.hora)} · ${CONCEPTO(r)} · ${esc(nombreRec(r.recurso))}</td></tr>`).join("")}
        </tbody></table></div>`;
    $("#vista").innerHTML = `
      <header class="vhead">
        <div><h1>Finanzas</h1><p class="vhead__frase">Lo que entró por señas y turnos del <b>${corto(desde)}</b> al <b>${corto(hasta)}</b>. Las señas van directo a tu Mercado Pago.</p></div>
        <div class="vhead__acc">
          <div class="seg" data-seg="per" role="group" aria-label="Período">${Object.entries(PERIODOS).map(([k, t]) => `<button type="button" data-per="${k}" aria-pressed="${FIN.periodo === k}">${periodoBoton(t)}</button>`).join("")}</div>
        </div>
      </header>
      <div class="fz${FIN.todos ? " fz--todos" : ""}">
        <section class="card fz-cob" aria-labelledby="fz-cob">
          <div class="fz-cob__top">
            <div>
              <h2 class="fz-k__k" id="fz-cob">Cobrado</h2>
              <p class="fz-cob__v">${plata(R.cobrado)}</p>
              <p class="fz-k__n">${delta}</p>
            </div>
            <dl class="fz-datos">
              <div><dt>Un día promedio</dt><dd>${plata(prom)}</dd></div>
              <div><dt>Mejor día</dt><dd>${mejor ? `${fechaC(mejor.iso)}<span class="fz-datos__sep"> · </span><span class="fz-datos__m">${plata(mejor.v)}</span>` : "Todavía ninguno"}</dd></div>
            </dl>
          </div>
          <div class="chart" id="chart"></div>
          <div class="fz-cob__pie">
            <p class="ley"><span><i class="ley__barra"></i>Lo que entró cada día</span>${prom ? `<span><i class="ley__prom"></i>Promedio de los días con cobros</span>` : ""}${conHoy ? `<span><i class="ley__hoy"></i>Hoy, todavía suma</span>` : ""}</p>
            <details class="tabla-dias"><summary class="link">Ver cada día en números</summary>
              <div class="tabla-wrap"><table class="tabla"><thead><tr><th scope="col">Día</th><th scope="col" class="num">Turnos</th><th scope="col" class="num">Cobrado</th></tr></thead>
              <tbody>${porDia.map((d) => `<tr><td>${fechaC(d.iso)}${d.hoy ? " (hoy)" : ""}</td><td class="num">${d.n}</td><td class="num">${plata(d.v)}</td></tr>`).join("")}</tbody></table></div>
            </details>
          </div>
        </section>
        <div class="fz-minis">
          ${mini("fz-senas", "Señas cobradas", plata(R.senas), "Ya están sumadas en lo cobrado")}
          ${mini("fz-jug", "Turnos pagados", R.jugados, `Ocupaste el ${pct(R.ocupacion)} de los horarios`, { barra: R.ocupacion })}
          ${mini("fz-aus", "No vinieron", R.ausentes.length, R.ausentes.length ? `Te quedaste con ${plata(R.ausentes.reduce((s, r) => s + r.sena, 0))} de seña` : "Nadie faltó en el período", { alerta: R.ausentes.length > 0 })}
          ${mini("fz-falta", "Falta cobrar", plata(futPlata), `${plural(futuros.length, "turno", "turnos")} de hoy en adelante, se cobran en el lugar`)}
        </div>
        <section class="card fz-rep" aria-labelledby="r-t"><h2 id="r-t" class="fz-t">Por ${esc(U.toLowerCase())}</h2><p class="card__sub">Cuánto dejó cada una en el período</p>${reparto(porRec, R.cobrado)}</section>
        <section class="card fz-rep" aria-labelledby="f-t"><h2 id="f-t" class="fz-t">Por horario</h2><p class="card__sub">Según la hora en que empezó cada turno</p>${reparto(porFranja, R.cobrado)}</section>
        <section class="card fz-movs" aria-labelledby="m-t">
          <div class="fz-movs__head"><div><h2 id="m-t" class="fz-t">${FIN.todos ? "Todos los cobros" : "Últimos cobros"}</h2><p class="card__sub">${plural(movs.length, "cobro", "cobros")} en el período</p></div>
            <button type="button" class="btn btn--line btn--sm" id="csv" ${movs.length ? "" : "disabled"}>${ico("bajar")}Planilla (CSV)</button></div>
          ${movs.length ? (FIN.todos ? tablaMovs() : `<ul class="movs">${movs.slice(0, 5).map(movFila).join("")}</ul>`) + (movs.length > 5 ? `<p class="fz-movs__pie"><button type="button" class="link" id="mas">${FIN.todos ? "Ver menos" : `Ver los ${movs.length} cobros`}</button></p>` : "")
          : `<p class="vacio-p">Todavía no entró plata en este período. Cuando te paguen una seña o un turno, aparece acá.</p>`}
        </section>
      </div>`;
    $$("[data-per]").forEach((b) => b.addEventListener("click", () => { FIN.periodo = b.dataset.per; FIN.todos = false; VISTAS.finanzas(); $(`[data-per="${FIN.periodo}"]`).focus(); }));
    animarSegs();
    const mas = $("#mas"); if (mas) mas.addEventListener("click", () => { FIN.todos = !FIN.todos; VISTAS.finanzas(); $("#mas").focus(); if (FIN.todos) $(".fz-movs").scrollIntoView({ block: "start", behavior: "smooth" }); });
    const csv = $("#csv"); if (csv) csv.addEventListener("click", () => descargarCSV(movs, desde, hasta));
    const cont = $("#chart");
    graficoBarras(cont, porDia, prom);
    if ("ResizeObserver" in window) {
      let w = cont.clientWidth;
      new ResizeObserver(() => { if (cont.isConnected && Math.abs(cont.clientWidth - w) > 8) { w = cont.clientWidth; graficoBarras(cont, porDia, prom); } }).observe(cont);
    }
  };
  const techo = (max) => {
    if (max <= 0) return { tope: 1000, paso: 250 };
    const crudo = max / 4, mag = 10 ** Math.floor(Math.log10(crudo));
    const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= crudo);
    return { tope: Math.ceil(max / paso) * paso, paso };
  };
  // Columnas de una sola serie (skill dataviz): verde agua, máximo 24 px, punta redondeada y base recta, grilla finita.
  // Para que se lea de un vistazo: la línea del promedio con su monto en el eje, el mejor día con su monto arriba,
  // hoy en verde pálido (el día no terminó), la inicial del día debajo de cada número y el detalle al pasar el cursor o tocar.
  const LETRA_DIA = ["D", "L", "M", "M", "J", "V", "S"];
  const graficoBarras = (cont, datos, prom = 0) => {
    const W = Math.max(280, cont.clientWidth || 640), chico = W < 520, H = chico ? 176 : 212;
    const m = { l: 64, r: 6, t: 24, b: 38 }, iw = W - m.l - m.r, ih = H - m.t - m.b;
    const { tope, paso } = techo(Math.max(prom, ...datos.map((d) => d.v)));
    const banda = iw / datos.length, ancho = Math.max(2, Math.min(24, banda - 4));
    const y = (v) => m.t + ih - (v / tope) * ih;
    const ancha = banda >= 58, conLetra = banda >= 16; // alcanza para "Sáb 7" / para la inicial debajo
    const cadaCuanto = conLetra ? 1 : Math.max(1, Math.ceil(datos.length / Math.floor(iw / 28)));
    const mejor = datos.filter((d) => !d.hoy).reduce((a, d) => (d.v > (a ? a.v : 0) ? d : a), null);
    const xc = (i) => m.l + i * banda + banda / 2;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Lo que entró cada día${prom ? `. Un día promedio: ${plata(prom)}` : ""}${mejor ? `. Mejor día: ${fechaC(mejor.iso)}, ${plata(mejor.v)}` : ""}. Usá las flechas para recorrer los días." tabindex="0">`;
    const yProm = prom ? y(prom) : -99;
    for (let v = 0; v <= tope + 0.5; v += paso) {
      s += `<line class="${v === 0 ? "base" : "grilla"}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      if (Math.abs(y(v) - yProm) > 14) s += `<text class="eje" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v === 0 ? "0" : "$ " + enMiles(v)}</text>`;
    }
    datos.forEach((d, i) => {
      const x = m.l + i * banda + (banda - ancho) / 2, h = (d.v / tope) * ih, b = m.t + ih, rr = Math.min(4, h, ancho / 2);
      if (h > 0) s += `<path class="barra${d.hoy ? " barra--hoy" : ""}" data-i="${i}" d="M${x},${b} V${b - h + rr} Q${x},${b - h} ${x + rr},${b - h} H${x + ancho - rr} Q${x + ancho},${b - h} ${x + ancho},${b - h + rr} V${b} Z"/>`;
      const dia = aD(d.iso).getUTCDate();
      if (i % cadaCuanto === 0 || d.hoy) {
        const cls = d.hoy ? "eje eje--hoy" : "eje";
        if (ancha) s += `<text class="${cls}" x="${xc(i)}" y="${H - 20}" text-anchor="middle">${DIAS_C[dow(d.iso)]} ${dia}</text>${d.hoy ? `<text class="eje eje--hoy" x="${xc(i)}" y="${H - 4}" text-anchor="middle">hoy</text>` : ""}`;
        else {
          s += `<text class="${cls}" x="${xc(i)}" y="${H - 20}" text-anchor="middle">${dia}</text>`;
          if (conLetra || d.hoy) s += `<text class="${d.hoy ? "eje eje--hoy" : "eje eje--letra"}" x="${xc(i)}" y="${H - 4}" text-anchor="middle">${d.hoy && (banda >= 26 || !conLetra) ? "hoy" : LETRA_DIA[dow(d.iso)]}</text>`;
        }
      }
      s += `<rect class="toque" data-i="${i}" x="${m.l + i * banda}" y="${m.t - 20}" width="${banda}" height="${ih + 20}"/>`;
    });
    if (prom) s += `<line class="prom" x1="${m.l}" x2="${W - m.r}" y1="${yProm}" y2="${yProm}"/><text class="eje eje--prom" x="${m.l - 8}" y="${yProm + 4}" text-anchor="end">$ ${enMiles(prom)}</text>`;
    if (mejor && mejor.v) {
      const i = datos.indexOf(mejor), x = Math.max(m.l + 30, Math.min(W - m.r - 30, xc(i)));
      s += `<text class="tope-t" x="${x}" y="${y(mejor.v) - 8}" text-anchor="middle">$ ${enMiles(mejor.v)}</text>`;
    }
    s += `</svg><div class="tip" aria-hidden="true"></div>`;
    cont.innerHTML = s;
    const svg = $("svg", cont), tip = $(".tip", cont);
    let act = -1;
    const mostrar = (i) => {
      act = i;
      $$(".barra", cont).forEach((p) => p.classList.toggle("is-on", +p.dataset.i === i));
      if (i < 0) { tip.classList.remove("is-on"); return; }
      const d = datos[i], escala = svg.getBoundingClientRect().width / W;
      const contra = d.hoy ? "Hoy, todavía suma" : prom && d.v ? (Math.abs(d.v - prom) / prom < 0.05 ? "Como el promedio" : `${pct(Math.abs(d.v - prom) / prom)} ${d.v > prom ? "más" : "menos"} que el promedio`) : "";
      tip.innerHTML = `${fechaC(d.iso)}<b>${plata(d.v)}</b>${plural(d.n, "turno", "turnos")}${contra ? `<small>${contra}</small>` : ""}`;
      tip.style.left = `${Math.max(70, Math.min(W - 70, xc(i))) * escala}px`;
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
          <div class="buscar-w">${ico("buscar")}<label class="sr-only" for="c-q">Buscar cliente</label><input class="buscar" id="c-q" type="search" placeholder="Buscar por nombre o WhatsApp…" value="${esc(CLI.q)}" autocomplete="off" /></div>
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
  // Mi negocio en tarjetas (pedido del dueño, 19/11: "hay mucho espacio libre, quiero que sea más compacto y lindo… hacelo
  // de otra forma"). Tres columnas en la compu (dos en pantallas medianas, una en el celular), cada tarjeta con su ícono,
  // el rótulo al costado del campo y los horarios y la duración del turno cada 10 minutos.
  const HORAS_10 = Array.from({ length: 144 }, (_, i) => aHora(i * 10)); // 00:00, 00:10 … 23:50
  const opcHoras = (v) => (v && !HORAS_10.includes(v) ? [...HORAS_10, v].sort() : HORAS_10).map((h) => `<option${h === v ? " selected" : ""}>${h}</option>`).join("");
  const DURACIONES = Array.from({ length: 24 }, (_, i) => (i + 1) * 10); // de 10 minutos a 4 horas, cada 10
  const durTexto = (d) => (d < 60 ? `${d} minutos` : `${d} minutos (${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60}` : ""})`);
  const durCorto = (d) => (d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60}` : ""}`);
  VISTAS.negocio = () => {
    const n = NEG, U = unidad(n), u = U.toLowerCase();
    const filaRec = (r) => `<div class="fila fila--rec" data-id="${r.id}"><input aria-label="Nombre" value="${esc(r.nombre)}" placeholder="${U} 1" autocomplete="off" /><input aria-label="Detalle" value="${esc(r.detalle)}" placeholder="Detalle (opcional)" autocomplete="off" /><button type="button" class="quitar" data-quitar aria-label="Quitar ${esc(r.nombre)}">${ico("x")}</button></div>`;
    const filaFr = (f) => `<div class="fila fila--fr"><select aria-label="Desde">${opcHoras(f.desde)}</select><span class="fila__a" aria-hidden="true">a</span><select aria-label="Hasta">${opcHoras(f.hasta)}</select><div class="pre"><span aria-hidden="true">$</span><input type="number" inputmode="numeric" min="0" step="500" aria-label="Precio" value="${f.precio}" placeholder="Precio" autocomplete="off" /></div><button type="button" class="quitar" data-quitar aria-label="Quitar franja">${ico("x")}</button></div>`;
    const filaDia = (d) => { const h = n.horario[d], dis = h.cerrado ? " disabled" : ""; return `<div class="fila fila--hr${h.cerrado ? " is-cerrado" : ""}" data-dia="${d}"><label class="dia-chip"><input type="checkbox" data-abierto aria-label="${mayus(DIAS[d])}: abierto" ${h.cerrado ? "" : "checked"} /><span aria-hidden="true">${DIAS_C[d]}</span></label><select aria-label="${mayus(DIAS[d])}: abre"${dis}>${opcHoras(h.abre)}</select><span class="fila__a" aria-hidden="true">a</span><select aria-label="${mayus(DIAS[d])}: cierra"${dis}>${opcHoras(h.cierra)}</select><span class="fila__cerrado">Cerrado</span></div>`; };
    const tarjeta = (id, icono, t, d, cuerpo, cls = "") => `<section class="card ng-card${cls ? " " + cls : ""}" aria-labelledby="${id}"><header class="ng-card__h">${ico(icono)}<div><h2 id="${id}">${t}</h2><p>${d}</p></div></header>${cuerpo}</section>`;
    const durs = DURACIONES.includes(n.duracion) ? DURACIONES : [...DURACIONES, n.duracion].sort((a, b) => a - b);
    $("#vista").innerHTML = `
      <header class="vhead"><div><h1>Mi negocio</h1><p class="vhead__frase">Lo que ven tus clientes cuando reservan y las reglas de tu agenda. Cada cambio se guarda solo.</p></div>
        <div class="vhead__acc"><p class="guardado" id="g-msg" role="status" aria-live="polite">Se guarda solo</p><button type="button" class="btn btn--line" id="g-tu-pagina">${ico("web")}Tu página</button><a class="btn btn--line" id="g-ver" href="${linkPagina(n.slug)}" target="_blank" rel="noopener">${ico("afuera")}Ver la página de reservas</a></div></header>
      <form class="ng" id="f-neg" novalidate>
          ${tarjeta("ng-0", "negocio", "Tu negocio", "Lo primero que ven tus clientes al reservar.", `
            <div class="perfil">
              <div class="perfil__foto" id="g-foto-ver">${n.foto ? `<img src="${n.foto}" alt="Foto de perfil de ${esc(n.nombre)}" />` : `<span aria-hidden="true">${esc(iniciales(n.nombre))}</span>`}</div>
              <div class="perfil__acc">
                <div class="perfil__bot">
                  <label class="btn btn--line btn--sm" for="g-foto">${ico("camara")}<span id="g-foto-l">${n.foto ? "Cambiar foto" : "Subir foto"}</span></label>
                  <input class="sr-only" type="file" id="g-foto" accept="image/*" aria-describedby="g-foto-ayuda g-foto-err" />
                  <button type="button" class="btn btn--warn btn--sm" id="g-foto-quitar" ${n.foto ? "" : "hidden"}>Quitar</button>
                </div>
                <p class="field__help" id="g-foto-ayuda">El logo o una foto del lugar, en cuadrado.</p>
                <p class="field__err" id="g-foto-err" hidden></p>
              </div>
            </div>
            <div class="field campo"><label for="g-nombre">Nombre</label><input id="g-nombre" value="${esc(n.nombre)}" required autocomplete="organization" aria-describedby="g-nombre-err" /><p class="field__err" id="g-nombre-err" hidden>El negocio necesita un nombre.</p></div>
            <div class="field campo"><label for="g-rubro">Rubro</label><input id="g-rubro" list="rubros" value="${esc(n.rubro)}" autocomplete="off" /></div>
            <div class="field campo"><label for="g-wa">WhatsApp</label><input id="g-wa" type="tel" inputmode="tel" autocomplete="tel" value="${esc(n.whatsapp)}" /></div>
            <div class="field campo"><label for="g-dir">Dirección</label><input id="g-dir" value="${esc(n.direccion)}" autocomplete="street-address" placeholder="Calle y número…" /></div>
            <div class="field campo"><label for="g-ciudad">Ciudad</label><input id="g-ciudad" value="${esc(n.ciudad)}" autocomplete="address-level2" /></div>
            <div class="field campo campo--arriba"><label for="g-slug">Tu dirección en Bookea</label><div class="slug"><span>bookea.ar/</span><input id="g-slug" value="${esc(n.slug)}" autocapitalize="none" autocomplete="off" spellcheck="false" translate="no" aria-describedby="g-slug-err" /><button type="button" class="btn btn--ghost btn--sm" id="g-copiar">${ico("copiar")}Copiar</button></div><p class="field__err" id="g-slug-err" hidden></p></div>`)}
          ${tarjeta("ng-3", "agenda", "Horario", "Los días y horas en que se puede reservar.", `
            <div class="filas filas--hr" id="g-hor">${ORDEN_DIAS.map(filaDia).join("")}</div>
            <p class="field__help">¿Cerrás después de medianoche? Elegí la hora igual (00:30).</p>`)}
          ${tarjeta("ng-7", "clientes", "Así te ven", "Tu ficha en Bookea, con lo que vas cargando.", `<div class="prev" id="g-prev" aria-live="off"></div>
            <a class="prev__link" id="g-prev-link" href="${linkPagina(n.slug)}" target="_blank" rel="noopener"></a>`, "ng-card--prev")}
          ${tarjeta("ng-2", "cancha", "Qué se reserva", `Cada ${esc(u)} es una columna en tu agenda.`, `
            <div class="field campo"><label for="g-dur">Cada turno dura</label><select id="g-dur">${durs.map((d) => `<option value="${d}"${d === n.duracion ? " selected" : ""}>${durTexto(d)}</option>`).join("")}</select></div>
            <div class="filas" id="g-recs">${n.recursos.map(filaRec).join("")}</div>
            <p class="field__err" id="g-recs-err" hidden></p>
            <button type="button" class="btn btn--ghost btn--sm agregar" id="g-rec-mas">${ico("mas")}Agregar ${esc(u)}</button>`)}
          ${tarjeta("ng-4", "plata", "Precios por horario", "El precio depende de la hora en que empieza el turno.", `
            <div class="filas" id="g-frs">${n.franjas.map(filaFr).join("")}</div>
            <p class="field__err" id="g-frs-err" hidden></p>
            <button type="button" class="btn btn--ghost btn--sm agregar" id="g-fr-mas">${ico("mas")}Agregar franja</button>`)}
          ${tarjeta("ng-5", "candado", "Seña y cancelaciones", "La seña asegura el turno. Vos elegís cuánto y hasta cuándo.", `
            <div class="field campo"><label for="g-sena">Seña</label><div class="pre pre--fin"><input id="g-sena" type="number" inputmode="numeric" min="0" max="100" value="${n.senaPct}" aria-describedby="g-sena-ayuda" /><span aria-hidden="true">% del turno</span></div></div>
            <div class="field campo"><label for="g-canc">Cancelan hasta</label><div class="pre pre--fin"><input id="g-canc" type="number" inputmode="numeric" min="0" max="72" value="${n.cancelarHoras}" aria-label="Pueden cancelar hasta cuántas horas antes" /><span aria-hidden="true">horas antes</span></div></div>
            <label class="chk"><input type="checkbox" id="g-dev" ${n.devolverSena ? "checked" : ""} /> Si cancelan a tiempo, se les devuelve la seña</label>
            <p class="ng-ej" id="g-sena-ayuda"></p>`)}
          ${tarjeta("ng-8", "texto", "Cómo es el lugar", "Lo que leen en tu ficha antes de reservar.", `
            <div class="field ng-desc"><label for="g-desc" class="sr-only">Descripción del lugar</label><textarea id="g-desc" rows="4" maxlength="300" placeholder="Qué tiene tu lugar: canchas, servicios, si prestan equipo, cómo es el estacionamiento…" aria-describedby="g-desc-cuenta">${esc(n.descripcion || "")}</textarea><p class="field__help ng-cuenta" id="g-desc-cuenta"></p></div>`, "ng-card--desc")}
          ${tarjeta("ng-6", "pin", "Cómo llegar", "El link que abren tus clientes para llegar. Sale de tu dirección.", `
            <div class="field campo campo--arriba"><label for="g-mapa">Link de Google Maps (opcional)</label><input id="g-mapa" type="url" inputmode="url" autocomplete="off" value="${esc(n.mapa || "")}" placeholder="https://maps.app.goo.gl/…" autocapitalize="none" spellcheck="false" aria-describedby="g-mapa-ayuda g-mapa-err" />
              <p class="field__help" id="g-mapa-ayuda">En Google Maps tocá <b>Compartir</b> y pegá el link acá.</p>
              <p class="field__err" id="g-mapa-err" hidden>Pegá un link de Google Maps: empieza con https://maps.app.goo.gl o https://www.google.com/maps</p></div>
            <div class="mapa" id="g-mapa-ver"></div>`, "ng-card--ubi")}
      </form>`;
    const f = $("#f-neg");
    const msg = $("#g-msg");
    const estadoMsg = (tipo, html) => { msg.className = "guardado" + (tipo ? " " + tipo : ""); msg.innerHTML = html; };
    $("#g-copiar").addEventListener("click", async (e) => {
      const b = e.currentTarget, link = `https://bookea.ar/${slugDe($("#g-slug").value)}/reservar`;
      try { await navigator.clipboard.writeText(link); } catch { const i = $("#g-slug"); i.select(); try { document.execCommand("copy"); } catch {} }
      b.innerHTML = tilde() + "Copiado"; aviso(`Link para reservar copiado: ${link}`);
      setTimeout(() => { if (b.isConnected) b.innerHTML = ico("copiar") + "Copiar"; }, 2200);
    });
    // foto: se ve enseguida y se guarda sola
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
      try { foto = await achicarFoto(a); pintarFoto(); $("#g-foto-ver").classList.remove("recien"); void $("#g-foto-ver").offsetWidth; $("#g-foto-ver").classList.add("recien"); programar(0); }
      catch { err.textContent = "No pudimos abrir esa imagen. Probá con otra."; err.hidden = false; }
      e.target.value = "";
    });
    $("#g-foto-quitar").addEventListener("click", () => { foto = ""; pintarFoto(); $("#g-foto").focus(); programar(0); });
    const cuentaDesc = () => { const l = $("#g-desc").value.length; $("#g-desc-cuenta").textContent = `${l} de 300 letras`; };
    cuentaDesc(); $("#g-desc").addEventListener("input", cuentaDesc);
    // ubicación: el botón de Google Maps se arma mientras escribís
    const pintarMapa = () => {
      const datos = { nombre: $("#g-nombre").value.trim(), direccion: $("#g-dir").value.trim(), ciudad: $("#g-ciudad").value.trim(), mapa: $("#g-mapa").value.trim() };
      if (datos.mapa && !MAPS_OK.test(datos.mapa)) datos.mapa = "";
      const url = linkMaps(datos), donde = [datos.direccion, datos.ciudad].filter(Boolean).join(", ");
      const pegado = $("#g-mapa").value.trim() && MAPS_OK.test($("#g-mapa").value.trim());
      $("#g-mapa-ver").innerHTML = url
        ? `<a class="mapa__a" href="${esc(url)}" target="_blank" rel="noopener" id="g-mapa-ir"><span class="mapa__pin">${ico("pin")}</span><span class="mapa__t"><b>${esc(donde || "Ubicación de Google Maps")}</b><small>Abrir en Google Maps${pegado ? " (con tu link)" : ""}</small></span>${ico("afuera")}</a>`
        : `<span class="mapa__pin">${ico("pin")}</span><div class="mapa__t"><b>Todavía sin ubicación</b><small>Completá la dirección para que tus clientes puedan llegar.</small></div>`;
    };
    pintarMapa(); ["#g-dir", "#g-ciudad", "#g-mapa", "#g-nombre"].forEach((id) => $(id).addEventListener("input", pintarMapa));
    $("#g-mapa").addEventListener("blur", (e) => { const v = e.target.value.trim(); marcar(e.target, "g-mapa-err", !!v && !MAPS_OK.test(v)); });
    const ayudaSena = () => { const p = n.franjas[0] ? +n.franjas[0].precio : 0, pc = +$("#g-sena").value || 0; $("#g-sena-ayuda").textContent = p ? `Con un turno de ${plata(p)}, la seña es de ${plata(Math.round((p * pc) / 100 / 100) * 100)}.` : ""; $("#g-sena-ayuda").hidden = !p; };
    ayudaSena(); $("#g-sena").addEventListener("input", ayudaSena);
    f.addEventListener("click", (e) => {
      const q = e.target.closest("[data-quitar]"); if (q) { const fila = q.closest(".fila"), cont = fila.parentElement; fila.remove(); const sig = $("input, select", cont); sig && sig.focus(); programar(0); }
    });
    $("#g-rec-mas").addEventListener("click", () => { const c = $("#g-recs"); c.insertAdjacentHTML("beforeend", filaRec({ id: "", nombre: `${U} ${c.children.length + 1}`, detalle: "" })); $("input", c.lastElementChild).select(); programar(0); });
    // la franja nueva arranca donde termina la anterior, por 3 horas; falta el precio
    $("#g-fr-mas").addEventListener("click", () => {
      const c = $("#g-frs"), ult = c.lastElementChild, desde = ult ? $$("select", ult)[1].value : "09:00";
      c.insertAdjacentHTML("beforeend", filaFr({ desde, hasta: aHora(aMin(desde) + 180), precio: "" }));
      $(".pre input", c.lastElementChild).focus();
    });
    $$("[data-abierto]", f).forEach((c) => c.addEventListener("change", () => { const fila = c.closest(".fila"); fila.classList.toggle("is-cerrado", !c.checked); $$("select", fila).forEach((i) => (i.disabled = !c.checked)); }));
    // lo que hay en pantalla al abrir: si al salir cambió algo, se guarda solo (ver salirNegocio)
    const estado = () => JSON.stringify([foto, ...$$("input, select, textarea", f).map((e) => (e.type === "checkbox" ? e.checked : e.value))]);
    let inicial = estado();
    // cada cambio se guarda solo, un segundo después de que se deja de escribir (pedido del dueño, 19/11: sin "Guardar cambios")
    let espera = null;
    const pintarPrev = () => {
      const nombre = $("#g-nombre").value.trim() || n.nombre, lugar = [$("#g-rubro").value.trim(), $("#g-ciudad").value.trim()].filter(Boolean).join(" · ");
      const precios = $$("#g-frs .pre input").map((i) => +i.value || 0).filter(Boolean), desde = precios.length ? Math.min(...precios) : 0;
      const pc = Math.min(100, Math.max(0, +$("#g-sena").value || 0)), desc = $("#g-desc").value.trim();
      const dur = +$("#g-dur").value || n.duracion, hoyD = dow(ahora().fecha), filaHoy = $(`#g-hor .fila[data-dia="${hoyD}"]`), horas = [];
      if (filaHoy && $("[data-abierto]", filaHoy).checked) {
        const [a, c] = $$("select", filaHoy).map((x) => aMin(x.value)), hasta = c <= a ? c + 1440 : c; // cierra pasada la medianoche
        for (let t = a; t + dur <= hasta && horas.length < 96; t += dur) horas.push(t % 1440);
      }
      const verHoras = horas.slice(0, 8);
      $("#g-prev").innerHTML = `
        <div class="prev__top"><div class="prev__foto">${foto ? `<img src="${foto}" alt="" />` : `<span aria-hidden="true">${esc(iniciales(nombre))}</span>`}</div>
          <div class="prev__t"><b>${esc(nombre)}</b><small>${esc(lugar || "Completá el rubro y la ciudad")}</small></div></div>
        ${desc ? `<p class="prev__desc">${esc(desc)}</p>` : ""}
        <div class="prev__hoy"><p>${horas.length ? `Hoy, ${DIAS[hoyD]}: ${plural(horas.length, "turno", "turnos")} de ${durCorto(dur)}` : `Hoy, ${DIAS[hoyD]}, está cerrado`}</p>
          ${horas.length ? `<ul class="prev__horas">${verHoras.map((t) => `<li>${aHora(t)}</li>`).join("")}${horas.length > verHoras.length ? `<li class="prev__mas">+${horas.length - verHoras.length}</li>` : ""}</ul>` : ""}</div>
        <dl class="prev__datos"><div><dt>Turnos de</dt><dd>${durCorto(+$("#g-dur").value)}</dd></div><div><dt>Desde</dt><dd>${desde ? plata(desde) : "Sin precio"}</dd></div><div><dt>Seña</dt><dd>${desde ? plata(senaDe({ senaPct: pc }, desde)) : `${pc} %`}</dd></div></dl>`;
      const sl = esc(slugDe($("#g-slug").value) || n.slug);
      $("#g-prev-link").innerHTML = `${ico("afuera")}<span>bookea.ar/<b>${sl}</b>/reservar</span>`;
      $("#g-prev-link").href = $("#g-ver").href = linkPagina(n.slug); // el link guardado (el que se está escribiendo todavía no existe)
    };
    const programar = (ms = 1100) => { pintarPrev(); clearTimeout(espera); espera = setTimeout(() => { espera = null; if (estado() !== inicial) guardar({ auto: true }); }, ms); };
    f.addEventListener("input", () => programar()); f.addEventListener("change", () => programar());
    pintarPrev();
    const guardar = async ({ auto = false } = {}) => {
      const slugAntes = n.slug;
      const nombre = $("#g-nombre").value.trim(), slug = slugDe($("#g-slug").value);
      const recs = $$("#g-recs .fila").map((fila, i) => { const [a, b] = $$("input", fila); return { id: fila.dataset.id || `r${Date.now().toString(36)}${i}`, nombre: a.value.trim() || `${U} ${i + 1}`, detalle: b.value.trim() }; });
      const frs = $$("#g-frs .fila").map((fila) => { const [a, b, c] = $$("select, input", fila); return { desde: a.value, hasta: b.value, precio: Math.max(0, Math.round(+c.value || 0)) }; });
      const hoy = ahora().fecha;
      const quitados = n.recursos.filter((r) => !recs.some((x) => x.id === r.id));
      const conTurnos = quitados.filter((r) => RES.some((x) => x.recurso === r.id && x.fecha >= hoy && ocupa(x) && esTurno(x)));
      const ok = [
        marcar($("#g-nombre"), "g-nombre-err", !nombre),
        marcar($("#g-slug"), "g-slug-err", LINKS_DE_BOOKEA.includes(slug) && "Ese link es de una página de Bookea. Probá con otro."),
        marcar($("#g-mapa"), "g-mapa-err", !!$("#g-mapa").value.trim() && !MAPS_OK.test($("#g-mapa").value.trim())),
      ];
      const eR = $("#g-recs-err"), eF = $("#g-frs-err");
      eR.hidden = eF.hidden = true;
      if (!recs.length) { eR.textContent = "Necesitás al menos uno para tomar reservas."; eR.hidden = false; ok.push(false); }
      else if (conTurnos.length) { eR.textContent = `${conTurnos.map((r) => r.nombre).join(" y ")} tiene turnos de hoy en adelante. Cancelalos antes de quitarlo.`; eR.hidden = false; ok.push(false); }
      if (!frs.length) { eF.textContent = "Necesitás al menos una franja con su precio."; eF.hidden = false; ok.push(false); }
      else if (frs.some((x) => !x.precio)) { eF.textContent = "Cada franja necesita su precio."; eF.hidden = false; ok.push(false); }
      if (ok.includes(false)) { estadoMsg("err", "Revisá los campos marcados"); const p = $(".is-invalid", f) || $(".field__err:not([hidden])", f); if (!auto && p) p.scrollIntoView({ block: "center" }); return false; }
      Object.assign(n, {
        nombre, rubro: $("#g-rubro").value.trim(), ciudad: $("#g-ciudad").value.trim(), direccion: $("#g-dir").value.trim(),
        whatsapp: $("#g-wa").value.trim(), slug, recursos: recs, franjas: frs, duracion: +$("#g-dur").value,
        foto, descripcion: $("#g-desc").value.trim().slice(0, 300), mapa: $("#g-mapa").value.trim(),
        senaPct: Math.min(100, Math.max(0, Math.round(+$("#g-sena").value || 0))), cancelarHoras: Math.max(0, Math.round(+$("#g-canc").value || 0)),
        devolverSena: $("#g-dev").checked,
      });
      $$("#g-hor .fila").forEach((fila) => { const d = +fila.dataset.dia, [a, b] = $$("select", fila); n.horario[d] = { abre: a.value || "09:00", cierra: b.value || "21:00", cerrado: !$("[data-abierto]", fila).checked }; });
      estadoMsg("", "Guardando…");
      let r = await sincronizar();
      if (!r.ok && r.error === "slug") {
        // el link ya es de otro negocio: se deja el de antes y se guarda todo lo demás
        n.slug = slugAntes;
        r = await sincronizar();
        pintarLado();
        marcar($("#g-slug"), "g-slug-err", "Ese link ya lo usa otro negocio. Probá con otro.");
        estadoMsg("err", r.ok ? "Guardamos todo menos el link" : "No se pudo guardar. " + esc(MENSAJES[r.error] || MENSAJES.otro));
        if (!auto) $("#g-slug").scrollIntoView({ block: "center" });
        inicial = estado(); // lo demás quedó guardado: el link se queda como estaba y no traba el salir
        return r.ok;
      }
      if (!r.ok) { estadoMsg("err", "No se pudo guardar. " + esc(MENSAJES[r.error] || MENSAJES.otro)); return false; }
      if (store.modo === "local" && local.get(CLAVE) && foto && !local.get(CLAVE).includes(foto.slice(-40))) { n.foto = ""; aviso("No entró la foto en este navegador. Probá con una más chica."); }
      pintarLado();
      // las filas nuevas quedan con su id: el próximo guardado no las toma como otras
      $$("#g-recs .fila").forEach((fila, i) => { if (recs[i]) fila.dataset.id = recs[i].id; });
      inicial = estado();
      estadoMsg("ok", tilde() + "Guardado");
      return true;
    };
    f.addEventListener("submit", (e) => { e.preventDefault(); guardar(); });
    salirNegocio = async () => { clearTimeout(espera); return estado() === inicial ? true : guardar(); };
    $("#g-tu-pagina").addEventListener("click", async () => { if (await dejarNegocio("pagina")) ir("pagina"); });
  };

  // ---------- Tu página (bookea.ar/nombre), pedido del dueño 21/11, rehecha el 25/11 ----------
  // La página web del negocio, que es suya y no de Bookea: portada con su logo, una frase, su historia, sus características
  // (las de Mi negocio y los servicios que marca acá), fotos, dónde queda, sus redes y al final un botón para reservar.
  // Cada cambio se guarda solo.
  // Las fotos van a Supabase Storage (modo nube) o, en el modo de prueba, achicadas dentro de este navegador.
  const FOTOS_MAX = 6;
  // Los servicios que se pueden marcar (los mismos nombres que AM en sitio.js, que es quien los muestra)
  const SERVICIOS = [["est", "Estacionamiento"], ["vest", "Vestuarios"], ["duchas", "Duchas"], ["pileta", "Pileta"], ["quincho", "Quincho"], ["buf", "Buffet"], ["parr", "Parrilla"],
    ["wifi", "Wi-Fi"], ["mate", "Café y mate"], ["qr", "Pago con QR"], ["tv", "TV y música"], ["aire", "Aire acondicionado"],
    ["led", "Iluminación LED"], ["luz", "Iluminación nocturna"], ["cesped", "Césped sintético"], ["polvo", "Polvo de ladrillo"],
    ["palas", "Alquiler de paletas"], ["raq", "Alquiler de raquetas"], ["clases", "Clases"], ["torneos", "Torneos"], ["cumple", "Cumpleaños"]];
  const achicarImagen = (archivo, max, conTransparencia = false) => new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const quiere = conTransparencia ? "image/webp" : "image/jpeg";
      c.toBlob((b) => {
        if (b && b.type === quiere) return ok(b);
        c.toBlob((b2) => (b2 ? ok(b2) : mal(new Error("imagen"))), conTransparencia ? "image/png" : "image/jpeg", 0.85);
      }, quiere, 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("no es una imagen")); };
    img.src = url;
  });
  // "https://www.instagram.com/losalamos/?hl=es" o "@losalamos" → "losalamos" (igual que red_social en la base)
  const usuarioRed = (t) => String(t || "").trim().replace(/^(https?:\/\/)?(www\.|m\.)?(instagram\.com|tiktok\.com|facebook\.com|fb\.com)\//i, "").split("/")[0].split("?")[0].replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60);
  VISTAS.pagina = () => {
    const n = NEG;
    const pg = Object.assign({ frase: "", historia: "", logo: "", portada: "", galeria: [], instagram: "", tiktok: "", facebook: "", mostrar_whatsapp: false, servicios: [] }, n.pagina || {});
    if (!Array.isArray(pg.galeria)) pg.galeria = [];
    if (!Array.isArray(pg.servicios)) pg.servicios = [];
    const MAX = store.modo === "nube" ? { portada: 1920, galeria: 1600, logo: 512 } : { portada: 960, galeria: 640, logo: 256 };
    const tarjeta = (id, icono, t, d, cuerpo, cls = "") => `<section class="card ng-card${cls ? " " + cls : ""}" aria-labelledby="${id}"><header class="ng-card__h">${ico(icono)}<div><h2 id="${id}">${t}</h2><p>${d}</p></div></header>${cuerpo}</section>`;
    const red = (id, rot, pre, val) => `<div class="field campo"><label for="${id}">${rot}</label><div class="slug"><span>${pre}</span><input id="${id}" value="${esc(val)}" autocapitalize="none" autocomplete="off" spellcheck="false" translate="no" /></div></div>`;
    $("#vista").innerHTML = `
      <header class="vhead"><div><h1>Tu página</h1><p class="vhead__frase">Tu página web en Bookea: tu logo, tus fotos, tu historia y dónde estás, con un botón para reservar al final. Cada cambio se guarda solo.</p></div>
        <div class="vhead__acc"><p class="guardado" id="p-msg" role="status" aria-live="polite">Se guarda solo</p><a class="btn btn--line" id="p-ver" href="${linkWeb(n.slug)}" target="_blank" rel="noopener">${ico("afuera")}Ver tu página</a></div></header>
      <form class="ng pg" id="f-pag" novalidate>
        ${tarjeta("pg-1", "camara", "Portada y logo", "Lo primero que se ve: una foto horizontal del lugar, a todo el ancho, con tu logo arriba.", `
          <div class="port" id="p-port"></div>
          <div class="port__acc">
            <label class="btn btn--line btn--sm" for="p-portada">${ico("camara")}<span id="p-portada-l"></span></label>
            <input class="sr-only" type="file" id="p-portada" accept="image/*" />
            <label class="btn btn--line btn--sm" for="p-logo">${ico("negocio")}<span id="p-logo-l"></span></label>
            <input class="sr-only" type="file" id="p-logo" accept="image/*" />
            <button type="button" class="btn btn--warn btn--sm" id="p-portada-quitar">Quitar portada</button>
            <button type="button" class="btn btn--warn btn--sm" id="p-logo-quitar">Quitar logo</button>
          </div>
          <p class="field__help">Sin logo se ven tus iniciales; sin portada, un fondo oscuro liso.</p>
          <p class="field__err" id="p-port-err" hidden></p>`, "pg-card--port")}
        ${tarjeta("pg-2", "afuera", "Tus links", "Para compartir en Instagram, WhatsApp o un QR en el mostrador.", `
          <div class="pg-link"><p>Tu página</p><a href="${linkWeb(n.slug)}" target="_blank" rel="noopener">bookea.ar/<b>${esc(n.slug)}</b></a><button type="button" class="btn btn--line btn--sm" data-copiar="https://bookea.ar/${esc(n.slug)}">${ico("copiar")}Copiar</button></div>
          <div class="pg-link"><p>Para reservar directo</p><a href="${linkPagina(n.slug)}" target="_blank" rel="noopener">bookea.ar/<b>${esc(n.slug)}</b>/reservar</a><button type="button" class="btn btn--line btn--sm" data-copiar="https://bookea.ar/${esc(n.slug)}/reservar">${ico("copiar")}Copiar</button></div>
          <p class="pg-link__nota">El de reservar va directo a tus horarios libres: sirve para el botón "Reservar" de Instagram o la respuesta automática de WhatsApp. El nombre se cambia en Mi negocio.</p>`, "ng-card--prev pg-card--links")}
        ${tarjeta("pg-3", "texto", "Tu historia", "Una frase corta para la portada y la historia del lugar.", `
          <div class="field campo campo--arriba"><label for="p-frase">Frase de la portada</label><input id="p-frase" maxlength="160" value="${esc(pg.frase)}" placeholder="Por ejemplo: Pádel entre álamos, desde 2010" /></div>
          <div class="field campo campo--arriba ng-desc"><label for="p-historia">Historia</label><textarea id="p-historia" maxlength="3000" placeholder="Cómo empezó el lugar, qué lo hace distinto, quiénes lo atienden…">${esc(pg.historia)}</textarea><p class="field__help ng-cuenta" id="p-historia-cuenta"></p></div>`, "ng-card--desc")}
        ${tarjeta("pg-4", "ig", "Redes y contacto", "Se ven al final de tu página. Podés pegar el link entero.", `
          ${red("p-ig", "Instagram", "instagram.com/", pg.instagram)}
          ${red("p-tt", "TikTok", "tiktok.com/@", pg.tiktok)}
          ${red("p-fb", "Facebook", "facebook.com/", pg.facebook)}
          <label class="check-pg"><input type="checkbox" id="p-wa" ${pg.mostrar_whatsapp ? "checked" : ""} ${n.whatsapp ? "" : "disabled"} /><span>${n.whatsapp ? `Mostrar mi WhatsApp (${esc(n.whatsapp)})` : "Mostrar mi WhatsApp (cargalo primero en Mi negocio)"}</span></label>`)}
        ${tarjeta("pg-6", "check", "Servicios del lugar", "Marcá lo que tiene tu lugar: cada uno se ve como una tarjeta en tu página.", `
          <div class="servp" role="group" aria-label="Servicios del lugar">${SERVICIOS.map(([k, t]) => `<label class="servp__i"><input type="checkbox" value="${k}" ${pg.servicios.includes(k) ? "checked" : ""} /><span>${t}</span></label>`).join("")}</div>`, "pg-card--serv")}
        ${tarjeta("pg-5", "camara", "Fotos del lugar", `Hasta ${FOTOS_MAX}. Se ven en tu página, en "Conocé el lugar": las canchas, el lugar, la gente.`, `
          <div class="galp" id="p-gal"></div>
          <input class="sr-only" type="file" id="p-fotos" accept="image/*" multiple />
          <p class="field__err" id="p-gal-err" hidden></p>`, "pg-card--gal")}
      </form>`;
    const f = $("#f-pag"), msg = $("#p-msg");
    const estadoMsg = (tipo, html) => { msg.className = "guardado" + (tipo ? " " + tipo : ""); msg.innerHTML = html; };
    const pintarPort = () => {
      const nom = esc(n.nombre), fr = esc($("#p-frase").value.trim());
      $("#p-port").innerHTML = `${pg.portada ? `<img class="port__bg" src="${esc(pg.portada)}" alt="" />` : ""}
        <div class="port__in"><span class="port__logo${pg.logo ? " has-img" : ""}">${pg.logo ? `<img src="${esc(pg.logo)}" alt="Logo de ${nom}" />` : `<span aria-hidden="true">${esc(iniciales(n.nombre))}</span>`}</span>
          <b>${nom}</b>${fr ? `<small>${fr}</small>` : ""}</div><span class="port__bookea" aria-hidden="true">Bookea</span>`;
      $("#p-port").classList.toggle("has-foto", !!pg.portada);
      $("#p-portada-l").textContent = pg.portada ? "Cambiar portada" : "Subir portada";
      $("#p-logo-l").textContent = pg.logo ? "Cambiar logo" : "Subir logo";
      $("#p-portada-quitar").hidden = !pg.portada; $("#p-logo-quitar").hidden = !pg.logo;
    };
    const pintarGal = () => {
      $("#p-gal").innerHTML = pg.galeria.map((u, i) => `<figure class="galp__f"><img src="${esc(u)}" alt="Foto ${i + 1} del lugar" loading="lazy" /><button type="button" class="quitar" data-foto="${i}" aria-label="Quitar la foto ${i + 1}">${ico("x")}</button></figure>`).join("")
        + (pg.galeria.length < FOTOS_MAX ? `<label class="galp__mas" for="p-fotos">${ico("mas")}<span>Agregar fotos</span></label>` : "");
    };
    const cuenta = () => { $("#p-historia-cuenta").textContent = `${$("#p-historia").value.length} de 3000 letras`; };
    pintarPort(); pintarGal(); cuenta();
    const leer = () => ({
      frase: $("#p-frase").value.trim().slice(0, 160), historia: $("#p-historia").value.trim().slice(0, 3000),
      logo: pg.logo, portada: pg.portada, galeria: pg.galeria.slice(0, FOTOS_MAX),
      instagram: usuarioRed($("#p-ig").value), tiktok: usuarioRed($("#p-tt").value), facebook: usuarioRed($("#p-fb").value),
      mostrar_whatsapp: !!n.whatsapp && $("#p-wa").checked,
      servicios: $$("#f-pag .servp input:checked").map((i) => i.value),
    });
    const estado = () => JSON.stringify(leer());
    let inicial = estado(), espera = null;
    const guardar = async () => {
      clearTimeout(espera); espera = null;
      const nueva = leer();
      if (JSON.stringify(nueva) === inicial) { estadoMsg("ok", tilde() + "Guardado"); return true; }
      const antes = n.pagina;
      n.pagina = nueva;
      estadoMsg("", "Guardando…");
      const r = await sincronizar();
      if (!r.ok) { n.pagina = antes; estadoMsg("err", "No se pudo guardar. " + esc(MENSAJES[r.error] || MENSAJES.otro)); return false; }
      // modo de prueba: si una foto no entró en el navegador, se avisa
      const ultima = [nueva.portada, nueva.logo, ...nueva.galeria].filter(Boolean).pop();
      if (store.modo === "local" && ultima && local.get(CLAVE) && !local.get(CLAVE).includes(ultima.slice(-40))) aviso("No entró la foto en este navegador. Probá con una más chica.");
      inicial = JSON.stringify(nueva);
      estadoMsg("ok", tilde() + "Guardado");
      return true;
    };
    const programar = (ms = 1100) => { clearTimeout(espera); espera = setTimeout(guardar, ms); };
    f.addEventListener("input", (e) => { if (e.target.id === "p-historia") cuenta(); if (e.target.id === "p-frase") pintarPort(); programar(); });
    f.addEventListener("change", (e) => { if (e.target.type !== "file") programar(); });
    f.addEventListener("submit", (e) => { e.preventDefault(); guardar(); });
    // las redes quedan como usuario apenas se sale del campo
    ["#p-ig", "#p-tt", "#p-fb"].forEach((id) => $(id).addEventListener("blur", (e) => { e.target.value = usuarioRed(e.target.value); }));
    // fotos: se achican, se suben y la página se guarda enseguida; la que se reemplaza o se quita, se borra
    const subir = async (archivo, tipo, err) => {
      err.hidden = true;
      if (!/^image\//.test(archivo.type)) { err.textContent = "Elegí una imagen (JPG, PNG o WEBP)."; err.hidden = false; return ""; }
      if (archivo.size > 20 * 1024 * 1024) { err.textContent = "La imagen pesa más de 20 MB. Probá con otra."; err.hidden = false; return ""; }
      let blob;
      try { blob = await achicarImagen(archivo, MAX[tipo], tipo === "logo"); } catch { err.textContent = "No pudimos abrir esa imagen. Probá con otra."; err.hidden = false; return ""; }
      const r = await store.subirFoto(blob, tipo);
      if (!r.ok) { err.textContent = "No se pudo subir la foto. " + (MENSAJES[r.error] || MENSAJES.otro); err.hidden = false; return ""; }
      return r.url;
    };
    const cambiarFoto = (tipo) => async (e) => {
      const a = e.target.files && e.target.files[0]; e.target.value = "";
      if (!a) return;
      estadoMsg("", "Subiendo la foto…");
      const url = await subir(a, tipo, $("#p-port-err"));
      if (!url) return estadoMsg("err", "Revisá la foto");
      const vieja = pg[tipo]; pg[tipo] = url; pintarPort();
      if (await guardar() && vieja) store.borrarFoto(vieja);
    };
    $("#p-portada").addEventListener("change", cambiarFoto("portada"));
    $("#p-logo").addEventListener("change", cambiarFoto("logo"));
    const quitarFoto = (tipo) => async () => { const vieja = pg[tipo]; pg[tipo] = ""; pintarPort(); if (await guardar() && vieja) store.borrarFoto(vieja); };
    $("#p-portada-quitar").addEventListener("click", quitarFoto("portada"));
    $("#p-logo-quitar").addEventListener("click", quitarFoto("logo"));
    $("#p-fotos").addEventListener("change", async (e) => {
      const lista = [...(e.target.files || [])].slice(0, FOTOS_MAX - pg.galeria.length); e.target.value = "";
      if (!lista.length) return;
      estadoMsg("", lista.length > 1 ? `Subiendo ${lista.length} fotos…` : "Subiendo la foto…");
      for (const a of lista) { const url = await subir(a, "galeria", $("#p-gal-err")); if (url) { pg.galeria.push(url); pintarGal(); } }
      await guardar();
    });
    $("#p-gal").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-foto]"); if (!b) return;
      const [vieja] = pg.galeria.splice(+b.dataset.foto, 1); pintarGal();
      const sig = $("[data-foto], .galp__mas", $("#p-gal")); sig && sig.focus();
      if (await guardar() && vieja) store.borrarFoto(vieja);
    });
    $$("[data-copiar]", f).forEach((b) => b.addEventListener("click", async () => {
      const link = b.dataset.copiar;
      try { await navigator.clipboard.writeText(link); } catch { /* sin portapapeles: el link se ve igual */ }
      b.innerHTML = tilde() + "Copiado"; aviso(`Link copiado: ${link}`);
      setTimeout(() => { if (b.isConnected) b.innerHTML = ico("copiar") + "Copiar"; }, 2200);
    }));
    salirNegocio = async () => { clearTimeout(espera); return estado() === inicial ? true : guardar(); };
  };

  // ---------- Solicitudes (solo el equipo de Bookea) ----------
  const fechaCorta = (ts) => { if (!ts) return ""; const d = new Date(ts); return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };
  const ESTADO_SOL = { pendiente: ["Pendiente", "ausente"], aprobado: ["Aprobado", "confirmada"], rechazado: ["Rechazado", "cancelada"] };
  VISTAS.solicitudes = async () => {
    if (!YO || !YO.admin) return VISTAS.agenda();
    const v = $("#vista");
    v.innerHTML = `<header class="vhead"><div><h1>Solicitudes</h1><p class="vhead__frase">Los negocios que se registraron en Bookea. Hasta que los aprobás, no pueden usar el panel.</p></div></header>
      <section class="card"><p class="card__sub">Cargando solicitudes…</p></section>`;
    const r = await store.solicitudes();
    if (vistaActual !== "solicitudes") return;
    if (!r.ok) { v.querySelector(".card").innerHTML = `<p class="form__msg err">No se pudieron traer las solicitudes. ${esc(MENSAJES[r.error] || MENSAJES.otro)}</p>`; return; }
    const pend = r.lista.filter((x) => x.estado === "pendiente"), rev = r.lista.filter((x) => x.estado !== "pendiente");
    $("#sol-n").hidden = !pend.length; $("#sol-n").textContent = pend.length;
    const fila = (x) => {
      const [txt, cls] = ESTADO_SOL[x.estado] || ESTADO_SOL.pendiente;
      const quien = [x.nombre_dueno, x.email_dueno].filter(Boolean).map(esc).join(" · ");
      const btns = x.estado === "pendiente"
        ? `<button type="button" class="btn btn--ink" data-revisar="${x.id}" data-ok="1">${ico("check")}Aprobar</button><button type="button" class="btn btn--line" data-revisar="${x.id}" data-ok="0">Rechazar</button>`
        : x.estado === "aprobado"
          ? `<button type="button" class="btn btn--line" data-revisar="${x.id}" data-ok="0">Quitar acceso</button>`
          : `<button type="button" class="btn btn--line" data-revisar="${x.id}" data-ok="1">Aprobar</button>`;
      return `<li class="sol">
        <div class="sol__q"><b>${esc(x.nombre)}</b><span>${esc([x.rubro, x.ciudad].filter(Boolean).join(" · ") || "Sin rubro")}</span>
          <span>${quien ? `Lo pidió ${quien}` : ""}${x.creado ? ` · ${x.estado === "pendiente" ? "se registró el" : "desde el"} ${fechaCorta(x.creado)}` : ""}</span></div>
        <span class="estado estado--${cls}"><i></i>${txt}</span>
        <div class="sol__acc">${btns}</div></li>`;
    };
    v.innerHTML = `<header class="vhead"><div><h1>Solicitudes</h1><p class="vhead__frase">Los negocios que se registraron en Bookea. Hasta que los aprobás, no pueden usar el panel.</p></div></header>
      <section class="card" aria-labelledby="s-1">
        <div class="card__head"><div><h2 id="s-1">Esperan tu respuesta</h2><p class="card__sub">${pend.length ? plural(pend.length, "negocio nuevo", "negocios nuevos") : "No hay negocios esperando. Cuando alguien se registre, aparece acá."}</p></div></div>
        ${pend.length ? `<ul class="sols">${pend.map(fila).join("")}</ul>` : ""}
      </section>
      ${rev.length ? `<section class="card" aria-labelledby="s-2">
        <div class="card__head"><div><h2 id="s-2">Ya revisados</h2><p class="card__sub">Podés quitarle el acceso a un negocio o aprobar uno que habías rechazado.</p></div></div>
        <ul class="sols">${rev.map(fila).join("")}</ul></section>` : ""}`;
    $$("[data-revisar]", v).forEach((b) => b.addEventListener("click", async () => {
      const ok = b.dataset.ok === "1", x = r.lista.find((y) => y.id === b.dataset.revisar);
      if (!ok && b.dataset.seguro !== "1") { b.dataset.seguro = "1"; b.textContent = "Tocá de nuevo para confirmar"; return; }
      $$("[data-revisar]", b.parentElement).forEach((y) => (y.disabled = true));
      const res = await store.revisar(b.dataset.revisar, ok);
      if (!res.ok) { aviso(res.error === "sesion" || res.error === "permiso" ? MENSAJES["sin-permiso"] : "No se pudo guardar. " + (MENSAJES[res.error] || MENSAJES.otro)); VISTAS.solicitudes(); return; }
      aviso(ok ? `${x.nombre} quedó aprobado. Ya puede entrar al panel.` : `${x.nombre} quedó sin acceso al panel.`);
      if (NEG && x.id === NEG.id) NEG.estado = res.estado;
      VISTAS.solicitudes();
    }));
  };

  // ---------- Equipo (solo el dueño) ----------
  // El dueño suma personas con un link que les manda por WhatsApp, elige qué puede hacer cada una,
  // se lo cambia cuando quiere y las saca del equipo.
  const chipsPermisos = (lista, rol) => rol === "dueno"
    ? `<span class="chip-p chip-p--todo">Todo, y maneja el equipo</span>`
    : (lista || []).length
      ? PERMISOS.filter((x) => lista.includes(x.k)).map((x) => `<span class="chip-p">${esc(x.c)}</span>`).join("")
      : `<span class="chip-p chip-p--nada">Solo su cuenta</span>`;
  const linkInvitacion = (token) => `${location.origin}${location.pathname}?invitacion=${token}`;
  const textoInvitacion = (i) => `Hola${i.nombre ? " " + primerNombre(i.nombre) : ""}, te sumé al equipo de ${NEG.nombre} en Bookea. `
    + `Creá tu cuenta con tu email (${i.email}) desde este link: ${linkInvitacion(i.token)}`;
  const waInvitacion = (i) => `https://wa.me/?text=${encodeURIComponent(textoInvitacion(i))}`;
  const casillasPermisos = (marcados) => `<fieldset class="permisos"><legend>Qué puede hacer en el panel</legend>
    ${PERMISOS.map((x) => `<label class="perm"><input type="checkbox" name="perm" value="${x.k}" ${marcados.includes(x.k) ? "checked" : ""} />
      <span><b>${esc(x.t)}</b><small>${esc(x.d)}</small></span></label>`).join("")}
    <p class="field__help">Cuenta, para cambiar su nombre y su contraseña, la tiene siempre. El equipo lo manejás solo vos.</p></fieldset>`;
  // Cargar turnos necesita ver la agenda: se tildan y destildan juntas
  const engancharCasillas = (cont) => cont.addEventListener("change", (e) => {
    const cb = (k) => $(`input[name="perm"][value="${k}"]`, cont);
    if (e.target.value === "turnos" && e.target.checked) cb("agenda").checked = true;
    if (e.target.value === "agenda" && !e.target.checked) cb("turnos").checked = false;
  });
  const leerCasillas = (cont) => limpiarPermisos($$('input[name="perm"]:checked', cont).map((i) => i.value));
  const venceTxt = (iso) => { const d = Math.ceil((new Date(iso) - Date.now()) / 864e5); return d <= 1 ? "vence hoy" : `vence en ${d} días`; };
  const copiarTexto = async (texto, btn, input) => {
    try { await navigator.clipboard.writeText(texto); } catch { if (input) { input.select(); try { document.execCommand("copy"); } catch { /* queda seleccionado */ } } }
    const antes = btn.innerHTML;
    btn.innerHTML = tilde() + "Copiado";
    setTimeout(() => { if (btn.isConnected) btn.innerHTML = antes; }, 1800);
  };
  // Dos toques para lo que no se deshace (sacar a alguien, anular un link)
  const dosToques = (b) => {
    if (b.dataset.seguro === "1") return true;
    b.dataset.seguro = "1"; b.textContent = "Tocá de nuevo para confirmar";
    setTimeout(() => { if (b.isConnected && b.dataset.seguro === "1") { b.dataset.seguro = ""; b.textContent = b.dataset.txt0; } }, 4000);
    return false;
  };

  VISTAS.equipo = async () => {
    if (!esDueno()) return ir(primeraVista());
    const v = $("#vista");
    const head = `<header class="vhead"><div><h1>Equipo</h1><p class="vhead__frase">Sumá a las personas que te ayudan con el negocio. Cada una entra con su email y su contraseña, y ve solo lo que vos le habilitás.</p></div>
      <div class="vhead__acc"><button type="button" class="btn btn--naranja" data-invitar>${ico("mas", "ico-mas")}Sumar a alguien</button></div></header>`;
    if (!v.querySelector(".eqs")) {
      v.innerHTML = head + `<section class="card"><p class="card__sub">Cargando tu equipo…</p></section>`;
      $("[data-invitar]", v).addEventListener("click", dlgInvitar); // ya responde mientras carga la lista
    }
    const r = await store.equipo();
    if (vistaActual !== "equipo") return;
    if (!r.ok) {
      v.innerHTML = head + `<section class="card"><p class="form__msg err">No se pudo traer tu equipo. ${esc(MENSAJES[r.error] || MENSAJES.otro)}</p></section>`;
      $("[data-invitar]", v).addEventListener("click", dlgInvitar);
      return;
    }
    const otros = r.miembros.filter((m) => m.rol !== "dueno");
    const fila = (m) => `<li class="eq">
        <span class="eq__av" aria-hidden="true">${esc(iniciales(m.nombre || m.email))}</span>
        <div class="eq__q"><b>${esc(m.nombre || m.email)}${m.yo ? " (vos)" : ""}</b><span>${esc(m.email)}</span><div class="eq__p">${chipsPermisos(m.permisos, m.rol)}</div></div>
        ${m.rol === "dueno" ? `<span class="estado estado--confirmada eq__rol"><i aria-hidden="true"></i>Dueño</span>`
          : `<div class="eq__acc"><button type="button" class="btn btn--line btn--sm" data-permisos="${esc(m.id)}">Cambiar permisos</button>
             <button type="button" class="btn btn--warn btn--sm" data-quitar="${esc(m.id)}" data-txt0="Sacar del equipo">Sacar del equipo</button></div>`}
      </li>`;
    const filaInv = (i) => `<li class="eq eq--inv">
        <span class="eq__av eq__av--inv" aria-hidden="true">${ico("chat")}</span>
        <div class="eq__q"><b>${esc(i.nombre || i.email)}</b><span>${esc(i.email)} · todavía no creó su cuenta · ${venceTxt(i.vence)}</span><div class="eq__p">${chipsPermisos(i.permisos, "encargado")}</div></div>
        <div class="eq__acc"><a class="btn btn--ghost btn--sm" href="${waInvitacion(i)}" target="_blank" rel="noopener">${ico("chat")}Mandar por WhatsApp</a>
          <button type="button" class="btn btn--line btn--sm" data-copiar-inv="${esc(i.token)}">${ico("copiar")}Copiar link</button>
          <button type="button" class="btn btn--warn btn--sm" data-anular="${esc(i.id)}" data-txt0="Anular">Anular</button></div>
      </li>`;
    // a la derecha, en noche: qué puede hacer cada uno (los mismos permisos que se tildan al invitar)
    const guia = `<aside class="card eq-guia" aria-labelledby="eq-3">
        <h2 id="eq-3">Qué puede hacer cada uno</h2>
        <p class="eq-guia__sub">Al sumar a alguien elegís qué ve y qué hace. Lo podés cambiar cuando quieras.</p>
        <ul class="eq-guia__l">${PERMISOS.map((x) => `<li><b>${x.t}</b><span>${x.d}</span></li>`).join("")}
          <li><b>Su cuenta</b><span>Su nombre y su contraseña los cambia cada uno. El equipo lo manejás solo vos.</span></li></ul>
      </aside>`;
    v.innerHTML = head + `<div class="eq-grid"><div class="eq-col">
      <section class="card" aria-labelledby="eq-1">
        <div class="card__head"><div><h2 id="eq-1">En el equipo</h2><p class="card__sub">${otros.length
          ? `${plural(r.miembros.length, "persona entra", "personas entran")} a este panel.`
          : "Por ahora solo vos. Tocá “Sumar a alguien” para invitar a quien te ayuda en el negocio."}</p></div></div>
        <ul class="eqs">${r.miembros.map(fila).join("")}</ul>
        ${!otros.length && !r.invitaciones.length ? `<div class="eq-vacio"><h3>Así sumás a alguien</h3>
          <ol><li>Tocá <b>Sumar a alguien</b> y escribí su nombre y su email.</li><li>Elegí qué puede ver y hacer en el panel.</li>
          <li>Mandale el link por WhatsApp. Entra con su email y una contraseña que elige.</li></ol></div>` : ""}
      </section>
      ${r.invitaciones.length ? `<section class="card" aria-labelledby="eq-2">
        <div class="card__head"><div><h2 id="eq-2">Invitaciones sin usar</h2><p class="card__sub">Cada link sirve una sola vez, para ese email, y vence a los 7 días.</p></div></div>
        <ul class="eqs">${r.invitaciones.map(filaInv).join("")}</ul></section>` : ""}</div>${guia}</div>`;
    $("[data-invitar]", v).addEventListener("click", dlgInvitar);
    $$("[data-permisos]", v).forEach((b) => b.addEventListener("click", () => dlgPermisos(r.miembros.find((m) => m.id === b.dataset.permisos))));
    $$("[data-copiar-inv]", v).forEach((b) => b.addEventListener("click", () => { copiarTexto(linkInvitacion(b.dataset.copiarInv), b); aviso("Link copiado. Mandáselo por WhatsApp o por mail."); }));
    $$("[data-quitar]", v).forEach((b) => b.addEventListener("click", async () => {
      if (!dosToques(b)) return;
      const m = r.miembros.find((x) => x.id === b.dataset.quitar);
      b.disabled = true;
      const res = await store.quitarMiembro(m.id);
      if (!res.ok) { aviso("No se pudo sacar del equipo. " + (MENSAJES[res.error] || MENSAJES.otro)); VISTAS.equipo(); return; }
      aviso(`${m.nombre || m.email} ya no entra a tu panel.`);
      VISTAS.equipo();
    }));
    $$("[data-anular]", v).forEach((b) => b.addEventListener("click", async () => {
      if (!dosToques(b)) return;
      b.disabled = true;
      const res = await store.anularInvitacion(b.dataset.anular);
      if (!res.ok) { aviso("No se pudo anular. " + (MENSAJES[res.error] || MENSAJES.otro)); VISTAS.equipo(); return; }
      aviso("Invitación anulada: ese link ya no sirve.");
      VISTAS.equipo();
    }));
  };

  const dlgInvitar = () => {
    abrirDlg(`${cabezaDlg(NEG.nombre, "Sumar a alguien al equipo")}
      <form class="nuevo" id="f-invitar" novalidate>
        <p class="dlg__intro">Te damos un link para mandarle. Con ese link crea su cuenta y entra a tu panel con lo que tildes acá.</p>
        <div class="field-row">
          <div class="field"><label for="iv-nombre">Nombre</label><input id="iv-nombre" autocomplete="off" aria-describedby="iv-nombre-err" /><p class="field__err" id="iv-nombre-err" hidden>Escribí su nombre.</p></div>
          <div class="field"><label for="iv-email">Su email</label><input id="iv-email" type="email" autocapitalize="none" spellcheck="false" inputmode="email" autocomplete="off" aria-describedby="iv-email-ayuda iv-email-err" />
            <p class="field__help" id="iv-email-ayuda">Con este email va a entrar.</p><p class="field__err" id="iv-email-err" hidden></p></div>
        </div>
        ${casillasPermisos(PERMISOS_NUEVO)}
        <p class="form__msg err" id="iv-msg" role="alert"></p>
        <div class="acciones"><button type="submit" class="btn btn--ink btn--lg">Crear el link</button><button type="button" class="btn btn--ghost btn--lg" data-cerrar>Cancelar</button></div>
      </form>`);
    const f = $("#f-invitar");
    engancharCasillas(f);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nombre = $("#iv-nombre").value.trim(), email = correo($("#iv-email").value), permisos = leerCasillas(f);
      $("#iv-msg").textContent = "";
      const ok = [
        marcar($("#iv-nombre"), "iv-nombre-err", !nombre),
        marcar($("#iv-email"), "iv-email-err", !EMAIL_OK.test(email) ? "Escribí un email válido, por ejemplo nombre@gmail.com." : email === correo(YO.email) ? "Ese es tu email: vos ya estás en el equipo." : false),
      ];
      if (ok.includes(false)) { const p = $(".is-invalid", f); p && p.focus(); return; }
      const btn = $('button[type="submit"]', f);
      ocupado(btn, true, "Creando el link…");
      const r = await store.invitar({ email, nombre, permisos });
      ocupado(btn, false);
      if (!r.ok) {
        if (r.error === "ya-en-equipo" || r.error === "email-invalido") { marcar($("#iv-email"), "iv-email-err", MENSAJES[r.error]); $("#iv-email").focus(); return; }
        $("#iv-msg").textContent = MENSAJES[r.error] || MENSAJES.otro;
        return;
      }
      dlgInvitacionLista({ token: r.token, nombre, email });
      if (vistaActual === "equipo") VISTAS.equipo();
    });
  };
  const dlgInvitacionLista = (i) => {
    const link = linkInvitacion(i.token), quien = primerNombre(i.nombre) || i.email;
    abrirDlg(`${cabezaDlg(NEG.nombre, `Listo. Mandale el link a ${quien}`)}
      <p>Con este link, ${esc(quien)} crea su cuenta con <b>${esc(i.email)}</b> y entra a tu panel con lo que elegiste. Sirve una sola vez y vence en 7 días.</p>
      <div class="field"><label for="iv-link">Link de invitación</label>
        <div class="slug slug--link"><input id="iv-link" value="${esc(link)}" readonly /><button type="button" class="btn btn--ghost btn--sm" id="iv-copiar">${ico("copiar")}Copiar</button></div></div>
      <div class="acciones"><a class="btn btn--ink btn--lg" href="${waInvitacion(i)}" target="_blank" rel="noopener">${ico("chat")}Mandar por WhatsApp</a>
        <button type="button" class="btn btn--ghost btn--lg" data-cerrar>Listo</button></div>`);
    $("#iv-copiar").addEventListener("click", (e) => { copiarTexto(link, e.currentTarget, $("#iv-link")); aviso("Link copiado."); });
  };
  const dlgPermisos = (m) => {
    if (!m) return;
    abrirDlg(`${cabezaDlg(m.email, `Qué puede hacer ${m.nombre || m.email}`)}
      <form class="nuevo" id="f-perm" novalidate>
        ${casillasPermisos(m.permisos)}
        <p class="field__help">Vale enseguida. Si tiene el panel abierto, lo ve al volver a la pantalla.</p>
        <p class="form__msg err" id="pm-msg" role="alert"></p>
        <div class="acciones"><button type="submit" class="btn btn--ink btn--lg">Guardar</button><button type="button" class="btn btn--ghost btn--lg" data-cerrar>Cancelar</button></div>
      </form>`);
    const f = $("#f-perm");
    engancharCasillas(f);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', f);
      ocupado(btn, true, "Guardando…");
      const r = await store.cambiarPermisos(m.id, leerCasillas(f));
      ocupado(btn, false);
      if (!r.ok) { $("#pm-msg").textContent = MENSAJES[r.error] || MENSAJES.otro; return; }
      cerrarDlg(); aviso(`Listo: cambiaste lo que puede hacer ${m.nombre || m.email}.`);
      VISTAS.equipo();
    });
  };

  // ---------- Cuenta ----------
  VISTAS.cuenta = () => {
    const local_ = store.modo === "local";
    $("#vista").innerHTML = `
      <header class="vhead"><div><h1>Cuenta</h1><p class="vhead__frase">Tus datos para entrar al panel. Cada administrador entra con su email y su contraseña.</p></div></header>
      <div class="cu">
        <section class="card cu-yo" aria-labelledby="cu-0">
          <div class="cu-yo__top"><span class="cu-yo__av" aria-hidden="true">${esc(iniciales(YO.nombre || YO.email))}</span>
            <div class="cu-yo__q"><h2 id="cu-0">${esc(YO.nombre || "Tu cuenta")}</h2><p>${esDueno() ? "Podés hacer todo y manejar el equipo" : "Parte del equipo"}</p></div></div>
          <div class="cu-yo__neg"><span class="mono" aria-hidden="true">${NEG.foto ? `<img src="${NEG.foto}" alt="" />` : esc(iniciales(NEG.nombre))}</span>
            <div><p class="cu-yo__rol">${esDueno() ? "Dueño de" : "En el equipo de"}</p><b>${esc(NEG.nombre)}</b><small>${esc([NEG.rubro, NEG.ciudad].filter(Boolean).join(" · "))}</small></div></div>
          <a class="cu-yo__link" href="${linkWeb(NEG.slug)}" target="_blank" rel="noopener">${ico("afuera")}<span>bookea.ar/<b>${esc(NEG.slug)}</b></span></a>
          ${esDueno() ? `<div class="cu-yo__eq"><h3 id="cu-5">Tu equipo</h3><p>Sumá a las personas que te ayudan y elegí qué puede ver y hacer cada una.</p>
            <button type="button" class="btn btn--crema" id="cu-equipo">${ico("equipo")}Ver y sumar personas</button></div>`
          : `<div class="cu-yo__eq"><h3 id="cu-5">Tu lugar en el equipo</h3><p>Lo que podés hacer lo elige el dueño del negocio. En este panel podés:</p>
            <div class="eq__p">${chipsPermisos(YO.permisos, YO.rol)}</div><p>Si necesitás algo más, pedíselo al dueño.</p></div>`}
        </section>
        <section class="card cu-c" aria-labelledby="cu-1"><div><h2 id="cu-1">Tus datos</h2><p class="card__sub">Tu nombre aparece en el panel. El email es con el que entrás${local_ ? "" : " y adonde te llega el link si te olvidás la contraseña"}.</p></div>
          <form class="cu-f" id="f-datos" novalidate>
            <div class="field"><label for="cu-nombre">Tu nombre</label><input id="cu-nombre" value="${esc(YO.nombre)}" autocomplete="name" aria-describedby="cu-nombre-err" /><p class="field__err" id="cu-nombre-err" hidden>Escribí tu nombre.</p></div>
            <div class="field"><label for="cu-user">Email</label><input id="cu-user" type="email" value="${esc(YO.email)}" disabled aria-describedby="cu-user-ayuda" /><p class="field__help" id="cu-user-ayuda">El email no se puede cambiar desde acá.</p></div>
            <div class="acciones"><button type="submit" class="btn btn--ink">Guardar</button></div>
          </form></section>
        <section class="card cu-c" aria-labelledby="cu-2"><div><h2 id="cu-2">Cambiar contraseña</h2><p class="card__sub">Usá al menos 8 caracteres. Cada vez que abrís o refrescás el panel te la pide de nuevo.</p></div>
          <form class="cu-f" id="f-clave" novalidate>
            <input type="email" autocomplete="username" value="${esc(YO.email)}" hidden />
            <div class="field"><label for="cu-a">Contraseña actual</label><input id="cu-a" type="password" autocomplete="current-password" aria-describedby="cu-a-err" /><p class="field__err" id="cu-a-err" hidden>La contraseña actual no coincide.</p></div>
            <div class="field"><label for="cu-n">Contraseña nueva</label><input id="cu-n" type="password" autocomplete="new-password" aria-describedby="cu-n-err" /><p class="field__err" id="cu-n-err" hidden>Usá al menos 8 caracteres.</p></div>
            <div class="field"><label for="cu-r">Repetí la nueva</label><input id="cu-r" type="password" autocomplete="new-password" aria-describedby="cu-r-err" /><p class="field__err" id="cu-r-err" hidden>Las dos contraseñas no coinciden.</p></div>
            <p class="form__msg err" id="cu-msg" role="alert"></p>
            <div class="acciones"><button type="submit" class="btn btn--ink">Cambiar contraseña</button></div>
          </form></section>
        ${YO.admin ? `<section class="card cu-c" aria-labelledby="cu-4"><div><h2 id="cu-4">Equipo de Bookea</h2><p class="card__sub">Los negocios que se registran esperan tu aprobación antes de poder usar el panel.</p></div>
          <button type="button" class="btn btn--ink" id="cu-sol">Ver solicitudes de negocios</button></section>` : ""}
        ${local_ ? `<section class="card cu-c peligro" aria-labelledby="cu-3"><div><h2 id="cu-3">Datos de prueba</h2><p class="card__sub">En esta vista de prueba, todo se guarda solo en este navegador. Si borrás todo, vuelve el negocio de ejemplo y se pierden las cuentas que creaste.</p></div>
          <button type="button" class="btn btn--warn" id="cu-reset">Borrar todo y volver al ejemplo</button></section>` : ""}
      </div>`;
    $("#f-datos").addEventListener("submit", async (e) => {
      e.preventDefault();
      const nom = $("#cu-nombre").value.trim(), btn = $('button[type="submit"]', e.target);
      if (!marcar($("#cu-nombre"), "cu-nombre-err", !nom ? "Escribí tu nombre." : false)) return;
      ocupado(btn, true, "Guardando…");
      const r = await store.cambiarNombre(nom);
      ocupado(btn, false);
      if (!r.ok) { marcar($("#cu-nombre"), "cu-nombre-err", "No se pudo guardar. " + (MENSAJES[r.error] || MENSAJES.otro)); return; }
      YO.nombre = nom; pintarLado(); aviso("Datos guardados.");
    });
    $("#f-clave").addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = $("#cu-a").value, nn = $("#cu-n").value, rr = $("#cu-r").value, btn = $('button[type="submit"]', e.target), msg = $("#cu-msg");
      msg.textContent = "";
      const okN = marcar($("#cu-n"), "cu-n-err", nn.length < 8 ? "Usá al menos 8 caracteres." : false);
      const okR = marcar($("#cu-r"), "cu-r-err", nn !== rr || !rr);
      const okA = marcar($("#cu-a"), "cu-a-err", !a ? "Escribí tu contraseña actual." : false);
      if (!okA || !okN || !okR) return;
      ocupado(btn, true, "Cambiando…");
      const r = await store.cambiarClave(a, nn);
      ocupado(btn, false);
      if (!r.ok) {
        if (r.error === "actual-mal") { marcar($("#cu-a"), "cu-a-err", "La contraseña actual no coincide."); return; }
        if (r.error === "clave-debil") { marcar($("#cu-n"), "cu-n-err", MENSAJES["clave-debil"]); return; }
        msg.textContent = MENSAJES[r.error] || MENSAJES.otro;
        return;
      }
      e.target.reset(); aviso("Contraseña cambiada.");
    });
    const sol = $("#cu-sol");
    sol && sol.addEventListener("click", () => ir("solicitudes"));
    const eq = $("#cu-equipo");
    eq && eq.addEventListener("click", () => ir("equipo"));
    const reset = $("#cu-reset");
    reset && reset.addEventListener("click", async (e) => {
      if (e.currentTarget.dataset.seguro !== "1") { e.currentTarget.dataset.seguro = "1"; e.currentTarget.textContent = "Tocá de nuevo para confirmar"; return; }
      local.del(CLAVE); await cargar(); await salir(); aviso("Listo. Volvió el negocio de ejemplo.");
    });
  };

  // ---------- Entrada: sumarse a un equipo con el link de una invitación (admin.html?invitacion=…) ----------
  let INVITACION = (() => { const t = new URLSearchParams(window.location.search).get("invitacion"); return t && /^[0-9a-f]{32,128}$/i.test(t) ? t : null; })();
  let INV_DATOS = null;
  // Una vez usado, el link se olvida (de la dirección y del panel), así no se intenta usar de nuevo
  const sacarInvitacionDeLaDireccion = () => {
    INVITACION = null; INV_DATOS = null;
    try { history.replaceState(null, "", window.location.pathname + window.location.hash); } catch { /* queda la dirección */ }
  };
  const listaPermisos = (lista) => PERMISOS.filter((x) => (lista || []).includes(x.k)).map((x) => x.t.toLowerCase());
  const mostrarInvitacion = async () => {
    mostrarEntrada("unirse");
    $("#u-sub").textContent = "Buscando tu invitación…";
    $(".u-campos").hidden = true; $("#u-crear").hidden = true;
    const r = await store.verInvitacion(INVITACION);
    if (!r.ok || !r.invitacion.valida) {
      $("#u-neg").textContent = r.ok ? r.invitacion.negocio : "";
      $("#t-unirse").textContent = "Este link ya no sirve";
      $("#u-sub").textContent = r.ok ? MENSAJES["invitacion-vencida"] : (MENSAJES[r.error] || MENSAJES["invitacion-no-existe"]);
      return;
    }
    INV_DATOS = r.invitacion;
    const puedeHacer = listaPermisos(INV_DATOS.permisos);
    $("#u-neg").textContent = "Invitación de " + INV_DATOS.negocio;
    $("#t-unirse").textContent = `Sumate al equipo de ${INV_DATOS.negocio}`;
    $("#u-sub").textContent = `Te invitaron a usar el panel de Bookea con ${INV_DATOS.email}. Elegí tu contraseña y listo.`
      + (puedeHacer.length ? ` Vas a poder ${puedeHacer.join(", ").replace(/, ([^,]*)$/, " y $1")}.` : "");
    $(".u-campos").hidden = false; $("#u-crear").hidden = false;
    $("#u-nombre").value = INV_DATOS.nombre || "";
    $("#u-email").value = INV_DATOS.email;
    $("#i-email").value = INV_DATOS.email; // por si ya tiene cuenta y toca "Ingresá"
    (INV_DATOS.nombre ? $("#u-clave") : $("#u-nombre")).focus({ preventScroll: true });
  };
  $("#f-unirse").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!INV_DATOS) return;
    const v = (id) => document.getElementById(id), btn = $("#u-crear"), msg = $("#u-msg");
    const nombre = v("u-nombre").value.trim(), email = correo(v("u-email").value), clave = v("u-clave").value, clave2 = v("u-clave2").value;
    msg.textContent = "";
    const ok = [
      marcar(v("u-nombre"), "u-nombre-err", !nombre),
      marcar(v("u-email"), "u-email-err", !EMAIL_OK.test(email) ? "Escribí un email válido." : email !== INV_DATOS.email ? `${MENSAJES["invitacion-otro-email"]} Usá ${INV_DATOS.email}.` : false),
      marcar(v("u-clave"), "u-clave-err", clave.length < 8 ? "Usá al menos 8 caracteres." : false),
      marcar(v("u-clave2"), "u-clave2-err", clave2 !== clave || !clave2),
    ];
    if (ok.includes(false)) { const p = $(".is-invalid", e.target); p && p.focus(); return; }
    ocupado(btn, true, "Creando tu cuenta…");
    const r = await store.unirse({ token: INVITACION, nombre, email, clave });
    ocupado(btn, false);
    if (!r.ok) {
      if (r.error === "existe") { marcar(v("u-email"), "u-email-err", "Ya hay una cuenta con ese email. Tocá “Ingresá” y entrá con tu contraseña."); return; }
      if (r.error === "clave-debil") { marcar(v("u-clave"), "u-clave-err", MENSAJES["clave-debil"]); v("u-clave").focus(); return; }
      if (r.error === "sin-negocio") { msg.textContent = "Tu cuenta se creó, pero no pudimos sumarte al equipo. Pedile al dueño un link nuevo."; return; }
      msg.textContent = MENSAJES[r.error] || MENSAJES.otro;
      return;
    }
    sacarInvitacionDeLaDireccion();
    e.target.reset();
    if (r.confirmar) {
      mostrarEntrada("ingresar");
      $("#i-email").value = email;
      const m = $("#i-msg"); m.className = "form__msg ok";
      m.textContent = `Te mandamos un mail a ${email}. Abrilo y tocá el link para confirmar tu email; después entrás acá con tu email y tu contraseña.`;
      return;
    }
    const p = primerNombre(nombre);
    pasar(r.datos, "agenda", () => bienvenida(p ? `Hola, ${p}.` : "Hola.", `Ya estás en el equipo de ${r.datos.negocio.nombre}.`));
  });

  // ---------- Llegada desde "Sumá tu negocio" (index.html) ----------
  // Ese formulario es el primer paso del registro: trae el nombre, el negocio y el rubro
  // (en la dirección y, por las dudas, anotados en el navegador). Acá se sigue con el email y la contraseña.
  const ALTA = (() => {
    let d = null;
    try { d = JSON.parse(sessionStorage.getItem("bookea:alta") || "null"); sessionStorage.removeItem("bookea:alta"); } catch { /* sin datos */ }
    const q = new URLSearchParams(window.location.search);
    if (q.has("alta")) {
      d = { nombre: q.get("nombre") || (d && d.nombre), negocio: q.get("negocio") || (d && d.negocio), rubro: q.get("rubro") || (d && d.rubro) };
      try { history.replaceState(null, "", window.location.pathname + window.location.hash); } catch { /* queda la dirección larga */ }
    }
    return d && typeof d === "object" ? d : null;
  })();
  const entradaInicial = () => {
    if (INVITACION) return mostrarInvitacion();
    if (!ALTA) return mostrarEntrada();
    mostrarEntrada("registro");
    for (const k of ["nombre", "negocio", "rubro"]) if (ALTA[k]) $("#r-" + k).value = String(ALTA[k]).slice(0, 80);
    const falta = ["#r-nombre", "#r-negocio", "#r-rubro", "#r-email"].map((sel) => $(sel)).find((el) => !el.value);
    falta && falta.focus({ preventScroll: true });
  };

  // ---------- Arranque ----------
  $$(".solo-nube").forEach((el) => (el.hidden = !NUBE));
  $$(".solo-local").forEach((el) => (el.hidden = NUBE));
  sesion.del(CLAVE_SES); sesion.del(CLAVE_VISTA);
  if (!NUBE) {
    // Modo de prueba: cada vez que se carga o se refresca la página, se pide email y contraseña de nuevo
    // (la sesión vive solo en memoria y no se guarda en el navegador).
    cargar().then(entradaInicial);
  } else {
    // Con la base también se pide email y contraseña en cada carga. La excepción son los links de los mails
    // (confirmar la cuenta u "olvidé mi contraseña"), que traen la sesión en la dirección.
    const hash = window.location.hash;
    const vieneDeRecuperar = /type=recovery/.test(hash);
    const linkMalo = /error_description=/.test(hash);
    $("#entrada").hidden = true; $("#cargando").hidden = false;
    store.sesionActual().then((r) => {
      // El link del mail de un cliente (cuenta de bookea.ar) cayó en el panel: sigue en la página de reservas, con la misma sesión
      if (r.error === "cliente" && /access_token=/.test(hash)) { window.location.replace("./?cuenta=" + (vieneDeRecuperar ? "clave" : "confirmada") + hash); return; }
      if (/access_token|error_description|type=/.test(window.location.hash)) history.replaceState(null, "", window.location.pathname + window.location.search);
      if (r.ok && vieneDeRecuperar) { YO = r.datos.cuenta; $("#nc-email").value = r.datos.cuenta.email; mostrarEntrada("nueva"); return; }
      if (r.ok) { pasar(r.datos, "agenda", saludar); return; }
      entradaInicial();
      const msg = $("#i-msg"); msg.className = "form__msg err";
      if (linkMalo) msg.textContent = "Ese link venció o ya se usó. Si querés cambiar la contraseña, pedí uno nuevo.";
      else if (r.error !== "sin-sesion") msg.textContent = MENSAJES[r.error] || MENSAJES.otro;
    });
  }
})();
