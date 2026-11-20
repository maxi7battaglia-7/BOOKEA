// Bookea — cuentas de los clientes en el frente (quienes reservan turnos en bookea.ar).
// Para pagar la seña hace falta una cuenta: nombre, email, celular y contraseña.
// Dos modos, según config.js (como el panel):
//   · Nube (config.js con los datos de Supabase): la cuenta es de Supabase Auth (guarda solo un hash de la
//     contraseña), los datos van a la tabla "clientes" y los turnos a "turnos" (supabase/esquema.sql).
//     Cada cliente ve solo lo suyo. La base manda el mail de turno confirmado y el de cancelado (avisos-por-mail.sql).
//     La sesión queda guardada en este navegador (no hay que entrar cada vez).
//   · Prueba (config.js vacío: la vista previa, la copia sin internet y las pruebas): todo en este navegador.
// sitio.js usa window.BookeaCuenta.crear(config) y no sabe en qué modo está.
(() => {
  "use strict";
  const LIBRERIA = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const SESION = "bookea:cliente-sesion"; // donde supabase-js guarda la sesión del cliente (el panel no guarda la suya)
  // Los links de los mails vuelven con la sesión en la dirección (#access_token=…) y con ?cuenta=confirmada o
  // ?cuenta=clave. sitio.js limpia la dirección al arrancar, así que se guardan acá, antes (este archivo carga primero).
  const HASH0 = /access_token=|error_description=/.test(location.hash) ? location.hash : "";
  const VUELTA = (/[?&]cuenta=(confirmada|clave)\b/.exec(location.search) || [])[1] || "";

  const cargarLibreria = () => new Promise((ok, mal) => {
    if (window.supabase && window.supabase.createClient) return ok();
    const s = document.createElement("script");
    s.src = LIBRERIA; s.async = true;
    s.onload = () => (window.supabase && window.supabase.createClient ? ok() : mal(new Error("libreria")));
    s.onerror = () => mal(new Error("libreria"));
    document.head.append(s);
  });

  // ---------- Errores, en palabras de la página ----------
  const tipoDeError = (e) => {
    if (!e) return "red";
    const cod = String(e.code || ""), msj = String(e.message || ""), st = +e.status || 0;
    if (cod === "invalid_credentials" || /invalid login credentials/i.test(msj)) return "credenciales";
    if (cod === "email_not_confirmed" || /email not confirmed/i.test(msj)) return "sin-confirmar";
    if (cod === "user_already_exists" || /already registered|already exists/i.test(msj)) return "existe";
    if (cod === "weak_password" || /password should|weak password/i.test(msj)) return "clave-debil";
    if (cod === "email_address_not_authorized" || /not authorized/i.test(msj)) return "email-no-autorizado";
    if (cod === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(msj)) return "email-invalido";
    if (cod === "over_request_rate_limit" || cod === "over_email_send_rate_limit" || st === 429) return "muchos";
    if (/faltan tus datos/i.test(msj)) return "sin-datos";
    if (/maneja un negocio/i.test(msj)) return "negocio";
    if (/10 turnos/i.test(msj)) return "limite";
    if (/ya pas[oó]/i.test(msj)) return "pasado";
    if (/no est[aá] disponible/i.test(msj)) return "no-disponible"; // el negocio cambió sus horarios o ya no está
    if (cod === "23505") return "ocupado";
    if (cod === "23514" || cod === "22P02" || cod === "22007" || cod === "22008") return "invalido";
    if (cod === "P0002") return "no-existe";
    if (cod === "PGRST202" || cod === "PGRST205" || cod === "42P01" || cod === "42883" || st === 404) return "sin-base";
    if (cod === "42501" || /row-level security|permission denied/i.test(msj)) return "permiso";
    if (cod === "PGRST301" || st === 401 || /jwt/i.test(msj)) return "sesion";
    if (/fetch|network|failed to/i.test(msj) || st === 0) return "red";
    return "otro";
  };
  const fallo = (e) => ({ ok: false, error: tipoDeError(e), detalle: e && e.message });

  // Un turno de la base, con la forma que usa sitio.js. Los de un negocio de verdad llevan "n-" adelante (como
  // sus lugares en la página) y los datos del lugar, por si la página todavía no lo tiene cargado.
  const turnoDeFila = (f) => ({
    id: f.id, vid: (f.negocio_id ? "n-" : "") + f.lugar_id, svc: f.servicio_id || "turno", key: String(f.fecha).slice(0, 10),
    t: String(f.hora).slice(0, 5), end: String(f.fin).slice(0, 5), unit: f.cancha,
    precio: +f.precio || 0, sena: +f.sena || 0, cancel: +f.cancelar_horas || 0, devuelve: f.devuelve_sena !== false, code: f.codigo,
    lugar: f.lugar || "", zona: f.zona || "", rubro: f.rubro || "", servicio: f.servicio || "",
  });
  const clienteDe = (f, email) => (f ? { id: f.id, nombre: f.nombre || "", email: f.email || email || "", celular: f.celular || "", promos: !!f.promos } : null);
  // Lo que se manda a reservar_turno (los nombres van para el mail de confirmación)
  // En un negocio de verdad van su id, la cancha (recurso) y el horario como en su agenda (fecha_agenda y minuto):
  // el precio, la seña y lo demás los pone la base con lo que el negocio cargó en Mi negocio.
  const filaDeTurno = (r) => Object.assign({
    lugar_id: r.vid, lugar: r.lugar, zona: r.zona || "", rubro: r.rubro || "", servicio_id: r.svc || "", servicio: r.servicio || "",
    cancha: r.unit, fecha: r.key, hora: r.t, fin: r.end, precio: Math.round(+r.precio || 0), sena: Math.round(+r.sena || 0),
    cancelar_horas: Math.round(+r.cancel || 0),
  }, r.nid ? { negocio_id: r.nid, recurso: r.rec, fecha_agenda: r.fa, minuto: r.min } : {});
  // Adónde vuelven los links de los mails (confirmar la cuenta, contraseña nueva): esta misma página
  const vuelta = (que) => window.location.href.split("#")[0].split("?")[0] + "?cuenta=" + que;

  // ======================================================================
  // Nube: Supabase
  // ======================================================================
  const nube = ({ supabaseUrl, supabaseAnonKey }) => {
    let sb = null, email = "", cliente = null;
    // Lo público (los negocios de la página y sus horarios ocupados) se pide directo, sin bajar la librería:
    // así el inicio sigue cargando rápido. Con la clave pública, como cualquier visitante.
    const publico = async (fn, args) => {
      try {
        const r = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(args || {}),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) return fallo(Object.assign(new Error((data && data.message) || "http " + r.status), { code: data && data.code, status: r.status }));
        return { ok: true, lista: Array.isArray(data) ? data : [] };
      } catch (e) { return fallo(e); }
    };
    const alRecuperarCbs = [];
    const listo = async () => {
      if (sb) return sb;
      await cargarLibreria();
      // supabase-js lee la sesión de la dirección al crearse: si sitio.js ya la limpió, se vuelve a poner un momento
      if (HASH0 && !/access_token=|error_description=/.test(location.hash)) {
        try { history.replaceState(history.state, "", location.pathname + location.search + HASH0); } catch { /* sin history */ }
      }
      sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: true, storageKey: SESION, autoRefreshToken: true, detectSessionInUrl: true },
      });
      // Entró con el link de "me olvidé la contraseña": hay que pedirle una nueva
      sb.auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") alRecuperarCbs.forEach((cb) => cb()); });
      return sb;
    };
    // ¿Hay algo que mirar? Sin sesión guardada ni link de un mail, la librería no se baja (el inicio carga más rápido)
    const hayRastro = () => {
      try { if (localStorage.getItem(SESION)) return true; } catch { /* sin localStorage */ }
      return !!(HASH0 || VUELTA);
    };
    // Con la cuenta abierta: sus datos de cliente (puede no tenerlos, si la cuenta ya existía de antes)
    const cargar = async (user) => {
      email = user.email || "";
      const { data, error } = await sb.from("clientes").select("*").eq("id", user.id);
      if (error) return fallo(error);
      cliente = clienteDe(data && data[0], email);
      return { ok: true, cliente, email };
    };
    const conLibreria = async (fn) => {
      try { await listo(); } catch { return { ok: false, error: "libreria" }; }
      try { return await fn(); } catch (e) { return fallo(e); }
    };

    return {
      modo: "nube",
      vuelta: VUELTA, // "confirmada" o "clave" si se llegó desde un link de un mail
      // Los negocios de verdad que muestra la página (y el de un link, bookea.ar/su-link, aunque todavía no esté en la lista)
      lugares(incluir) { return publico("lugares_publicos", { incluir: incluir || null }); },
      // Los horarios ocupados de un negocio, al momento: [cancha, fecha de la agenda, minuto]
      ocupados(lugar) { return publico("horarios_ocupados", { lugar }); },
      async iniciar() {
        if (!hayRastro()) return { ok: true, cliente: null };
        return conLibreria(async () => {
          const { data } = await sb.auth.getSession();
          // el link ya se usó: que la dirección no quede con la sesión a la vista
          if (/access_token=|error_description=/.test(location.hash)) {
            try { history.replaceState(history.state, "", location.pathname + location.search); } catch { /* sin history */ }
          }
          if (!data || !data.session) return { ok: true, cliente: null, linkVencido: /error_description=/.test(HASH0) };
          return cargar(data.session.user);
        });
      },
      registrar({ nombre, email: correo, celular, clave, promos }) {
        return conLibreria(async () => {
          const { data, error } = await sb.auth.signUp({
            email: correo, password: clave,
            options: { data: { nombre, celular, promos: !!promos, cliente: true }, emailRedirectTo: vuelta("confirmada") },
          });
          if (error) return fallo(error);
          // Supabase no avisa si el email ya tenía cuenta (para no revelarlo): devuelve una cuenta sin identidades
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ok: false, error: "existe" };
          if (!data.session) return { ok: true, confirmar: true };
          return cargar(data.user);
        });
      },
      ingresar(correo, clave) {
        return conLibreria(async () => {
          const { data, error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
          if (error) return fallo(error);
          return cargar(data.user);
        });
      },
      // Datos de cliente: completarlos (cuenta que ya existía) o corregirlos
      guardarDatos({ nombre, celular, promos }) {
        return conLibreria(async () => {
          const { data, error } = await sb.rpc("guardar_mis_datos", { nom: nombre, cel: celular, promos_si: !!promos });
          if (error) return fallo(error);
          cliente = clienteDe(data, email);
          return { ok: true, cliente };
        });
      },
      async salir() {
        cliente = null; email = "";
        try { if (sb) await sb.auth.signOut(); } catch { /* sin conexión: igual se cierra acá */ }
        try { localStorage.removeItem(SESION); } catch { /* sin localStorage */ }
      },
      recuperar(correo) {
        return conLibreria(async () => {
          const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: vuelta("clave") });
          if (error) return fallo(error);
          return { ok: true };
        });
      },
      alRecuperar(cb) { alRecuperarCbs.push(cb); },
      ponerClave(nueva) {
        return conLibreria(async () => {
          const { data, error } = await sb.auth.updateUser({ password: nueva });
          if (error) return fallo(error);
          return cargar(data.user);
        });
      },
      turnos() {
        return conLibreria(async () => {
          const { data, error } = await sb.from("turnos").select("*").eq("estado", "confirmado")
            .order("fecha", { ascending: true }).order("hora", { ascending: true });
          if (error) return fallo(error);
          return { ok: true, lista: data.map(turnoDeFila) };
        });
      },
      reservar(r) {
        return conLibreria(async () => {
          const { data, error } = await sb.rpc("reservar_turno", { t: filaDeTurno(r) });
          if (error) return fallo(error);
          return { ok: true, turno: turnoDeFila(data) };
        });
      },
      cancelar(id) {
        return conLibreria(async () => {
          const { data, error } = await sb.rpc("cancelar_turno", { turno: id });
          if (error) return fallo(error);
          return { ok: true, devuelve: !!(data && data.devuelve) };
        });
      },
      borrar() {
        return conLibreria(async () => {
          const { error } = await sb.rpc("borrar_mi_cuenta");
          if (error) return fallo(error);
          await this.salir();
          return { ok: true };
        });
      },
    };
  };

  // ======================================================================
  // Prueba: todo en este navegador (localStorage)
  // ======================================================================
  const local = () => {
    const K = "bookea:clientes:v1", KT = "bookea:turnos";
    const mem = {};
    const leer = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : (mem[k] ?? d); } catch { return mem[k] ?? d; } };
    const escribir = (k, v) => { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin localStorage */ } };
    const db = () => leer(K, { cuentas: [], sesion: null });
    const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    const nuevaSal = () => hex(crypto.getRandomValues(new Uint8Array(12)));
    const hashear = async (clave, sal) => {
      const datos = new TextEncoder().encode(`${sal}:${clave}`);
      if (crypto.subtle) return hex(await crypto.subtle.digest("SHA-256", datos));
      let h = 2166136261; for (const b of datos) { h ^= b; h = Math.imul(h, 16777619); } // respaldo sin crypto.subtle
      return "fnv" + (h >>> 0).toString(16);
    };
    const publico = (c) => (c ? { id: c.id, nombre: c.nombre, email: c.email, celular: c.celular, promos: !!c.promos } : null);
    const yo = () => { const d = db(); return d.cuentas.find((c) => c.id === d.sesion) || null; };
    const misTurnos = (id) => leer(KT, []).filter((t) => !t.cliente || t.cliente === id); // los de antes del registro no tienen dueño
    const cuando = (t) => new Date(`${t.key}T${t.t}:00-03:00`).getTime();

    return {
      modo: "local",
      vuelta: "",
      async iniciar() { const c = yo(); return { ok: true, cliente: publico(c), email: c ? c.email : "" }; },
      async registrar({ nombre, email, celular, clave, promos }) {
        const d = db(), correo = String(email).trim().toLowerCase();
        if (d.cuentas.some((c) => c.email === correo)) return { ok: false, error: "existe" };
        const sal = nuevaSal();
        const c = { id: "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), email: correo, nombre, celular, promos: !!promos, sal, hash: await hashear(clave, sal), creado: Date.now() };
        d.cuentas.push(c); d.sesion = c.id; escribir(K, d);
        return { ok: true, cliente: publico(c), email: correo };
      },
      async ingresar(email, clave) {
        const d = db(), correo = String(email).trim().toLowerCase(), c = d.cuentas.find((x) => x.email === correo);
        if (!c || (await hashear(clave, c.sal)) !== c.hash) return { ok: false, error: "credenciales" };
        d.sesion = c.id; escribir(K, d);
        return { ok: true, cliente: publico(c), email: correo };
      },
      async guardarDatos({ nombre, celular, promos }) {
        const d = db(), c = d.cuentas.find((x) => x.id === d.sesion);
        if (!c) return { ok: false, error: "sesion" };
        Object.assign(c, { nombre, celular, promos: !!promos }); escribir(K, d);
        return { ok: true, cliente: publico(c) };
      },
      async salir() { const d = db(); d.sesion = null; escribir(K, d); },
      async lugares() { return { ok: true, lista: [] }; }, // en modo de prueba, solo los lugares de ejemplo
      async ocupados() { return { ok: true, lista: [] }; },
      async recuperar() { return { ok: false, error: "local" }; },
      alRecuperar() {},
      async ponerClave() { return { ok: false, error: "local" }; },
      async turnos() { const c = yo(); return c ? { ok: true, lista: misTurnos(c.id) } : { ok: false, error: "sesion" }; },
      async reservar(r) {
        const c = yo(); if (!c) return { ok: false, error: "sesion" };
        const todos = leer(KT, []);
        if (todos.some((t) => t.vid === r.vid && t.unit === r.unit && t.key === r.key && t.t === r.t)) return { ok: false, error: "ocupado" };
        if (cuando(r) < Date.now() - 60e3) return { ok: false, error: "pasado" };
        const code = "BK-" + Math.random().toString(36).slice(2, 7).toUpperCase().padEnd(5, "X");
        const turno = { id: r.id, vid: r.vid, svc: r.svc, key: r.key, t: r.t, end: r.end, unit: r.unit, precio: r.precio, sena: r.sena, cancel: r.cancel, code, cliente: c.id };
        escribir(KT, todos.concat(turno));
        return { ok: true, turno };
      },
      async cancelar(id) {
        const todos = leer(KT, []), t = todos.find((x) => x.id === id);
        if (!t) return { ok: false, error: "no-existe" };
        escribir(KT, todos.filter((x) => x.id !== id));
        return { ok: true, devuelve: (cuando(t) - Date.now()) / 3600e3 > t.cancel };
      },
      async borrar() {
        const d = db(), id = d.sesion;
        d.cuentas = d.cuentas.filter((c) => c.id !== id); d.sesion = null; escribir(K, d);
        escribir(KT, leer(KT, []).filter((t) => t.cliente !== id));
        return { ok: true };
      },
    };
  };

  const crear = (config = {}) => (config.supabaseUrl && config.supabaseAnonKey ? nube(config) : local());
  window.BookeaCuenta = { crear };
})();
