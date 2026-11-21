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
  // "pagina" (la de bookea.ar/nombre) se manda solo si la base ya la tiene (si todavía no se corrió esquema.sql, no
  // se manda, así guardar Mi negocio sigue andando)
  let conPagina = false;
  const negDeFila = (f) => {
    // estado: pendiente / aprobado / rechazado (lo cambia solo el equipo de Bookea). Si la base todavía no
    // tiene la columna (esquema viejo), se toma como aprobado para no dejar a nadie afuera.
    const n = { id: f.id, estado: f.estado || "aprobado" };
    for (const c of COLS_NEG) n[c] = f[c] ?? "";
    for (const c of AJUSTES) if (f.ajustes && f.ajustes[c] !== undefined) n[c] = f.ajustes[c];
    conPagina = "pagina" in f;
    n.pagina = f.pagina && typeof f.pagina === "object" && !Array.isArray(f.pagina) ? f.pagina : {};
    return n;
  };
  const filaDeNeg = (n) => {
    const f = {};
    for (const c of COLS_NEG) f[c] = n[c] ?? "";
    f.ajustes = {};
    for (const c of AJUSTES) if (n[c] !== undefined) f.ajustes[c] = n[c];
    if (conPagina) f.pagina = n.pagina && typeof n.pagina === "object" ? n.pagina : {};
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
    if (cod === "email_address_not_authorized" || /not authorized/i.test(msj)) return "email-no-autorizado";
    if (cod === "email_address_invalid" || /invalid.*email|email.*invalid/i.test(msj)) return "email-invalido";
    if (cod === "over_request_rate_limit" || cod === "over_email_send_rate_limit" || st === 429) return "muchos";
    if (/bucket not found/i.test(msj)) return "sin-fotos"; // falta correr esquema.sql (el bucket de las fotos)
    if (cod === "23505" && /slug/.test(msj)) return "slug";
    if (/ya est[aá] en el equipo/i.test(msj)) return "ya-en-equipo";
    if (/ya est[aá] en un negocio/i.test(msj)) return "ya-en-negocio";
    if (/invitaci[oó]n ya se us[oó]|venci[oó]/i.test(msj)) return "invitacion-vencida";
    if (/invitaci[oó]n es para otro email/i.test(msj)) return "invitacion-otro-email";
    if (cod === "22023") return "email-invalido";
    if (cod === "23505") return "ocupado";
    if (cod === "23514") return "invalido";
    // sin permiso (las reglas de la base): no es que venció la sesión
    if (cod === "42501" || /row-level security/i.test(msj)) return "permiso";
    if (cod === "PGRST301" || st === 401 || /jwt/i.test(msj)) return "sesion";
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
      const { data: ms, error: e1 } = await sb.from("miembros").select("*")
        .eq("user_id", user.id).order("creado", { ascending: true });
      if (e1) return fallo(e1);
      // Sin negocio: o es la cuenta de un cliente que reserva en bookea.ar (cuenta.js), o la de alguien sin equipo
      if (!ms || !ms.length) return { ok: false, error: user.user_metadata && user.user_metadata.cliente ? "cliente" : "sin-negocio" };
      negId = ms[0].negocio_id;
      const { data: fila, error: e2 } = await sb.from("negocios").select("*").eq("id", negId).single();
      if (e2) return fallo(e2);
      let reservas;
      try { reservas = await traerReservas(); } catch (e) { return fallo(e); }
      const negocio = negDeFila(fila);
      // ¿Es del equipo de Bookea? (si la tabla no existe todavía, no lo es)
      const { data: ad } = await sb.from("admins_bookea").select("user_id").eq("user_id", user.id);
      cuenta = {
        id: user.id, email: user.email, nombre: (user.user_metadata && user.user_metadata.nombre) || "",
        rol: ms[0].rol, permisos: Array.isArray(ms[0].permisos) ? ms[0].permisos : [], admin: !!(ad && ad.length),
      };
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
          const puedeNeg = cuenta && (cuenta.rol === "dueno" || cuenta.permisos.includes("negocio"));
          if (kNeg !== fotoNeg && puedeNeg) {
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

      // ---------- Equipo de Bookea: negocios que se registraron ----------
      async solicitudes() {
        try {
          const { data, error } = await sb.from("negocios")
            .select("id, nombre, rubro, ciudad, slug, estado, nombre_dueno, email_dueno, creado, revisado")
            .order("creado", { ascending: false });
          if (error) return fallo(error);
          return { ok: true, lista: data };
        } catch (e) { return fallo(e); }
      },
      async revisar(id, aprobar) {
        try {
          const { data, error } = await sb.rpc("revisar_negocio", { n: id, aprobar });
          if (error) return fallo(error);
          return { ok: true, estado: data };
        } catch (e) { return fallo(e); }
      },
      // ---------- Equipo del negocio ----------
      // Lo ve solo el dueño: las personas que ya están y las invitaciones sin usar
      async equipo() {
        try {
          const [m, i] = await Promise.all([
            sb.from("miembros").select("user_id, rol, permisos, nombre, email, creado").eq("negocio_id", negId).order("creado", { ascending: true }),
            sb.from("invitaciones").select("id, email, nombre, permisos, token, creado, vence, usada").eq("negocio_id", negId).order("creado", { ascending: false }),
          ]);
          if (m.error) return fallo(m.error);
          if (i.error) return fallo(i.error);
          const ahora = Date.now();
          return {
            ok: true,
            miembros: m.data.map((x) => ({ id: x.user_id, rol: x.rol, permisos: x.permisos || [], nombre: x.nombre || "", email: x.email || "", yo: x.user_id === cuenta.id })),
            invitaciones: i.data.filter((x) => !x.usada && new Date(x.vence).getTime() > ahora)
              .map((x) => ({ id: x.id, email: x.email, nombre: x.nombre, permisos: x.permisos || [], token: x.token, vence: x.vence })),
          };
        } catch (e) { return fallo(e); }
      },
      async invitar({ email, nombre, permisos }) {
        try {
          const { data, error } = await sb.rpc("crear_invitacion", { n: negId, correo: email, quien: nombre, puede: permisos });
          if (error) return fallo(error);
          return { ok: true, token: data };
        } catch (e) { return fallo(e); }
      },
      async anularInvitacion(id) {
        try {
          const { error } = await sb.rpc("anular_invitacion", { i: id });
          if (error) return fallo(error);
          return { ok: true };
        } catch (e) { return fallo(e); }
      },
      async cambiarPermisos(id, permisos) {
        try {
          const { data, error } = await sb.rpc("cambiar_permisos", { n: negId, u: id, puede: permisos });
          if (error) return fallo(error);
          return { ok: true, permisos: data };
        } catch (e) { return fallo(e); }
      },
      async quitarMiembro(id) {
        try {
          const { error } = await sb.rpc("quitar_miembro", { n: negId, u: id });
          if (error) return fallo(error);
          return { ok: true };
        } catch (e) { return fallo(e); }
      },
      // Quien abre el link de una invitación (todavía sin cuenta)
      async verInvitacion(token) {
        try { await listo(); } catch { return { ok: false, error: "libreria" }; }
        try {
          const { data, error } = await sb.rpc("ver_invitacion", { t: token });
          if (error) return fallo(error);
          if (!data) return { ok: false, error: "invitacion-no-existe" };
          return { ok: true, invitacion: data };
        } catch (e) { return fallo(e); }
      },
      // Crea la cuenta con el link: la base la suma al equipo en el mismo paso
      async unirse({ token, nombre, email, clave }) {
        try { await listo(); } catch { return { ok: false, error: "libreria" }; }
        try {
          const vuelta = window.location.href.split("#")[0].split("?")[0];
          const { data, error } = await sb.auth.signUp({
            email, password: clave, options: { data: { nombre, invitacion: token }, emailRedirectTo: vuelta },
          });
          if (error) return fallo(error);
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ok: false, error: "existe" };
          if (!data.session) return { ok: true, confirmar: true };
          return cargarTodo(data.user);
        } catch (e) { return fallo(e); }
      },
      // Una cuenta que ya existía (sin negocio) entra con su email y acepta el link
      async aceptarInvitacion(token) {
        try {
          const { error } = await sb.rpc("aceptar_invitacion", { t: token });
          if (error) return fallo(error);
          const { data } = await sb.auth.getSession();
          if (!data || !data.session) return { ok: false, error: "sesion" };
          return cargarTodo(data.session.user);
        } catch (e) { return fallo(e); }
      },

      // Una foto de "Tu página": va a Supabase Storage, a la carpeta del negocio (negocios/<id>/...). Devuelve su dirección.
      async subirFoto(blob, tipo) {
        if (!sb || !negId) return { ok: false, error: "sesion" };
        try {
          const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
          const ruta = `${negId}/${tipo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
          const { error } = await sb.storage.from("negocios").upload(ruta, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
          if (error) return fallo(error);
          return { ok: true, url: sb.storage.from("negocios").getPublicUrl(ruta).data.publicUrl };
        } catch (e) { return fallo(e); }
      },
      // La que se reemplazó o se quitó: se borra (si no se puede, queda guardada y no molesta)
      async borrarFoto(url) {
        if (!sb || !negId) return { ok: false, error: "sesion" };
        const m = /\/storage\/v1\/object\/public\/negocios\/([0-9a-f-]{36}\/[a-z0-9._-]+)$/i.exec(url || "");
        if (m && m[1].startsWith(negId + "/")) { try { await sb.storage.from("negocios").remove([m[1]]); } catch { /* queda guardada */ } }
        return { ok: true };
      },

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
