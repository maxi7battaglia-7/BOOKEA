// Bookea — conexión del panel con la base de datos (Supabase).
// Se usa solo si config.js tiene la dirección y la clave pública del proyecto; si no, el panel
// funciona en modo de prueba y guarda todo en el navegador (ver admin.js, almacenLocal).
//
// Cuentas: email y contraseña las maneja Supabase Auth (guarda solo un hash, nunca la contraseña).
// Cada cuenta está atada a su negocio por la tabla "miembros", y la base solo le deja leer y
// cambiar los datos de ese negocio (ver supabase/esquema.sql).
(() => {
  "use strict";
  const LIBRERIA = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  const COLS_NEG = ["nombre", "rubro", "ciudad", "direccion", "whatsapp", "slug", "foto", "descripcion", "mapa"];
  const AJUSTES = ["recursos", "duracion", "horario", "franjas", "senaPct", "cancelarHoras", "devolverSena"];
  const POR_PAGINA = 1000; // Supabase devuelve como mucho 1000 filas por pedido
  const DIAS_ATRAS = 400; // se traen los turnos del último año y pico, y todos los que vienen

  const cargarLibreria = () => new Promise((ok, mal) => {
    if (window.supabase && window.supabase.createClient) return ok();
    const s = document.createElement("script");
    s.src = LIBRERIA; s.async = true;
    s.onload = () => (window.supabase && window.supabase.createClient ? ok() : mal(new Error("libreria")));
    s.onerror = () => mal(new Error("libreria"));
    document.head.append(s);
  });

  // ---------- De la base al panel y vuelta ----------
  const negDeFila = (f) => {
    const n = { id: f.id };
    for (const c of COLS_NEG) n[c] = f[c] ?? "";
    for (const c of AJUSTES) if (f.ajustes && f.ajustes[c] !== undefined) n[c] = f.ajustes[c];
    return n;
  };
  const filaDeNeg = (n) => {
    const f = {};
    for (const c of COLS_NEG) f[c] = n[c] ?? "";
    f.ajustes = {};
    for (const c of AJUSTES) if (n[c] !== undefined) f.ajustes[c] = n[c];
    return f;
  };
  const resDeFila = (f) => ({
    id: f.id, recurso: f.recurso, fecha: f.fecha, hora: +f.hora, cliente: f.cliente || "", wa: f.wa || "",
    precio: +f.precio || 0, sena: +f.sena || 0, estado: f.estado, retenida: !!f.retenida, origen: f.origen || "", nota: f.nota || "",
  });
  const filaDeRes = (r, negocio_id) => ({
    id: r.id, negocio_id, recurso: String(r.recurso), fecha: r.fecha, hora: Math.round(+r.hora), cliente: r.cliente || "", wa: r.wa || "",
    precio: Math.max(0, Math.round(+r.precio || 0)), sena: Math.max(0, Math.round(+r.sena || 0)), estado: r.estado,
    retenida: !!r.retenida, origen: r.origen || "", nota: r.nota || "",
  });

  // ---------- Errores, en palabras del panel ----------
  const tipoDeError = (e) => {
    if (!e) return "red";
    const cod = String(e.code || ""), msj = String(e.message || ""), st = +e.status || 0;
    if (cod === "invalid_credentials" || /invalid login credentials/i.test(msj)) return "credenciales";
    if (cod === "email_not_confirmed" || /email not confirmed/i.test(msj)) return "sin-confirmar";
    if (cod === "user_already_exists" || /already registered|already exists/i.test(msj)) return "existe";
    if (cod === "weak_password" || /password should|weak password/i.test(msj)) return "clave-debil";
    if (cod === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(msj)) return "email-invalido";
    if (cod === "over_request_rate_limit" || cod === "over_email_send_rate_limit" || st === 429) return "muchos";
    if (cod === "23505" && /slug/.test(msj)) return "slug";
    if (cod === "23505") return "ocupado";
    if (cod === "23514") return "invalido";
    if (cod === "PGRST301" || cod === "42501" || st === 401 || /jwt/i.test(msj)) return "sesion";
    if (/fetch|network|failed to/i.test(msj) || st === 0) return "red";
    return "otro";
  };
  const fallo = (e) => ({ ok: false, error: tipoDeError(e), detalle: e && e.message });

  const hoyMenos = (dias) => {
    const d = new Date(Date.now() - dias * 864e5);
    return d.toISOString().slice(0, 10);
  };
  const enTandas = (lista, n) => { const out = []; for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n)); return out; };

  const crear = ({ supabaseUrl, supabaseAnonKey }) => {
    let sb = null, cuenta = null, negId = null;
    // Lo último que sabemos que quedó guardado en la base, para mandar solo lo que cambió
    let fotoNeg = null;
    const fotoRes = new Map();
    const alRecuperarCbs = [];

    const listo = async () => {
      if (sb) return sb;
      await cargarLibreria();
      // persistSession: false → la sesión vive solo en memoria: cada vez que se abre o se refresca el panel
      // se vuelve a pedir email y contraseña (pedido del dueño). Los links de los mails igual funcionan,
      // porque traen la sesión en la dirección (detectSessionInUrl).
      sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true },
      });
      // Entró con el link de "olvidé mi contraseña": hay que pedirle una nueva
      sb.auth.onAuthStateChange((evento) => { if (evento === "PASSWORD_RECOVERY") alRecuperarCbs.forEach((cb) => cb()); });
      return sb;
    };

    const traerReservas = async () => {
      const out = [];
      for (let desde = 0; ; desde += POR_PAGINA) {
        const { data, error } = await sb.from("reservas").select("*")
          .eq("negocio_id", negId).gte("fecha", hoyMenos(DIAS_ATRAS))
          .order("fecha", { ascending: true }).order("hora", { ascending: true }).order("id", { ascending: true })
          .range(desde, desde + POR_PAGINA - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < POR_PAGINA) break;
      }
      return out.map(resDeFila);
    };

    // Trae el negocio de la cuenta y sus reservas
    const cargarTodo = async (user) => {
      const { data: ms, error: e1 } = await sb.from("miembros").select("negocio_id, rol, creado")
        .eq("user_id", user.id).order("creado", { ascending: true });
      if (e1) return fallo(e1);
      if (!ms || !ms.length) return { ok: false, error: "sin-negocio" };
      negId = ms[0].negocio_id;
      const { data: fila, error: e2 } = await sb.from("negocios").select("*").eq("id", negId).single();
      if (e2) return fallo(e2);
      let reservas;
      try { reservas = await traerReservas(); } catch (e) { return fallo(e); }
      const negocio = negDeFila(fila);
      cuenta = { id: user.id, email: user.email, nombre: (user.user_metadata && user.user_metadata.nombre) || "", rol: ms[0].rol };
      fotoNeg = JSON.stringify(filaDeNeg(negocio));
      fotoRes.clear();
      for (const r of reservas) fotoRes.set(r.id, JSON.stringify(filaDeRes(r, negId)));
      return { ok: true, datos: { cuenta, negocio, reservas } };
    };

    const api = {
      modo: "nube",

      // ¿Vuelve del mail de confirmación o del de "olvidé mi contraseña"? (la sesión viene en la dirección)
      async sesionActual() {
        try { await listo(); } catch { return { ok: false, error: "libreria" }; }
        const { data } = await sb.auth.getSession();
        if (!data || !data.session) return { ok: false, error: "sin-sesion" };
        return cargarTodo(data.session.user);
      },

      async ingresar(email, clave) {
        try { await listo(); } catch { return { ok: false, error: "libreria" }; }
        try {
          const { data, error } = await sb.auth.signInWithPassword({ email, password: clave });
          if (error) return fallo(error);
          return cargarTodo(data.user);
        } catch (e) { return fallo(e); }
      },

      // Crea la cuenta. El negocio lo crea la base en el mismo paso (con nombre, negocio y rubro).
      async registrar({ nombre, negocio, rubro, email, clave }) {
        try { await listo(); } catch { return { ok: false, error: "libreria" }; }
        try {
          const vuelta = window.location.href.split("#")[0].split("?")[0];
          const { data, error } = await sb.auth.signUp({
            email, password: clave, options: { data: { nombre, negocio, rubro }, emailRedirectTo: vuelta },
          });
          if (error) return fallo(error);
          // Supabase no avisa si el email ya tenía cuenta (para no revelarlo): devuelve una cuenta sin identidades
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ok: false, error: "existe" };
          if (!data.session) return { ok: true, confirmar: true };
          return cargarTodo(data.user);
        } catch (e) { return fallo(e); }
      },

      async salir() {
        cuenta = negId = fotoNeg = null; fotoRes.clear();
        try { if (sb) await sb.auth.signOut(); } catch { /* sin conexión: igual se cierra acá */ }
      },

      // Manda a la base solo lo que cambió desde la última vez
      async guardar(neg, reservas) {
        if (!sb || !negId) return { ok: false, error: "sesion" };
        try {
          const filaNeg = filaDeNeg(neg), kNeg = JSON.stringify(filaNeg);
          if (kNeg !== fotoNeg) {
            const { error } = await sb.from("negocios").update(filaNeg).eq("id", negId);
            if (error) return fallo(error);
            fotoNeg = kNeg;
          }
          const vivos = new Set(), cambiadas = [], nuevas = [];
          for (const r of reservas) {
            const f = filaDeRes(r, negId), k = JSON.stringify(f);
            vivos.add(r.id);
            const antes = fotoRes.get(r.id);
            if (antes === k) continue;
            (antes ? cambiadas : nuevas).push([f, k]);
          }
          const borrar = [...fotoRes.keys()].filter((id) => !vivos.has(id));
          for (const tanda of enTandas(borrar, 100)) {
            const { error } = await sb.from("reservas").delete().eq("negocio_id", negId).in("id", tanda);
            if (error) return fallo(error);
            tanda.forEach((id) => fotoRes.delete(id));
          }
          // primero las que cambiaron (por ejemplo, un turno cancelado) y después las nuevas,
          // así un horario que se liberó se puede volver a ocupar en el mismo guardado
          for (const lista of [cambiadas, nuevas]) {
            for (const tanda of enTandas(lista, 500)) {
              const { error } = await sb.from("reservas").upsert(tanda.map(([f]) => f));
              if (error) return fallo(error);
              tanda.forEach(([f, k]) => fotoRes.set(f.id, k));
            }
          }
          return { ok: true };
        } catch (e) { return fallo(e); }
      },

      // Vuelve a traer todo, por si se cargó algo desde otro dispositivo
      async recargar() {
        if (!sb || !cuenta) return { ok: false, error: "sesion" };
        const { data } = await sb.auth.getSession();
        if (!data || !data.session) return { ok: false, error: "sesion" };
        return cargarTodo(data.session.user);
      },

      async cambiarNombre(nombre) {
        try {
          const { error } = await sb.auth.updateUser({ data: { nombre } });
          if (error) return fallo(error);
          if (cuenta) cuenta.nombre = nombre;
          return { ok: true };
        } catch (e) { return fallo(e); }
      },

      async cambiarClave(actual, nueva) {
        try {
          const prueba = await sb.auth.signInWithPassword({ email: cuenta.email, password: actual });
          if (prueba.error) return { ok: false, error: tipoDeError(prueba.error) === "credenciales" ? "actual-mal" : tipoDeError(prueba.error) };
          const { error } = await sb.auth.updateUser({ password: nueva });
          if (error) return fallo(error);
          return { ok: true };
        } catch (e) { return fallo(e); }
      },

      // "Me olvidé la contraseña": Supabase manda un mail con un link que vuelve a esta página
      async recuperar(email) {
        try { await listo(); } catch { return { ok: false, error: "libreria" }; }
        try {
          const vuelta = window.location.href.split("#")[0].split("?")[0];
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: vuelta });
          if (error) return fallo(error);
          return { ok: true };
        } catch (e) { return fallo(e); }
      },
      alRecuperar(cb) { alRecuperarCbs.push(cb); },
      async ponerClave(nueva) {
        try {
          const { data, error } = await sb.auth.updateUser({ password: nueva });
          if (error) return fallo(error);
          return cargarTodo(data.user);
        } catch (e) { return fallo(e); }
      },
    };
    return api;
  };

  window.BookeaNube = { crear };
})();
