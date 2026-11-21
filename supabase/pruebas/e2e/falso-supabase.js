// Cliente de Supabase "de juguete" para las pruebas: tiene la misma forma que supabase-js
// en lo que usa nube.js, pero habla con puente.js (Postgres local con las reglas de verdad).
(() => {
  const KEY = 'sb-prueba-sesion';
  const post = async (url, cuerpo) => (await fetch(url, { method: 'POST', body: JSON.stringify(cuerpo) })).json();
  const errorDe = (e) => e && Object.assign(new Error(e.message), e);

  class Consulta {
    constructor(base, cliente, tabla) { Object.assign(this, { base, cliente, tabla, op: 'select', cols: '*', filtros: [], orden: [], rango: null, soloUna: false, valores: null }); }
    select(cols = '*') { if (this.op === 'select') this.cols = cols; return this; }
    update(v) { this.op = 'update'; this.valores = v; return this; }
    upsert(v) { this.op = 'upsert'; this.valores = Array.isArray(v) ? v : [v]; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filtros.push(['eq', c, v]); return this; }
    gte(c, v) { this.filtros.push(['gte', c, v]); return this; }
    in(c, v) { this.filtros.push(['in', c, v]); return this; }
    order(c, o = {}) { this.orden.push([c, o.ascending !== false]); return this; }
    range(a, b) { this.rango = [a, b]; return this; }
    single() { this.soloUna = true; return this; }
    async correr() {
      const s = this.cliente._sesion();
      const r = await post(this.base + '/api/q', { token: s && s.access_token, tabla: this.tabla, op: this.op, cols: this.cols, filtros: this.filtros, orden: this.orden, rango: this.rango, single: this.soloUna, valores: this.valores });
      return { data: r.error ? null : r.data, error: errorDe(r.error) || null };
    }
    then(ok, mal) { return this.correr().then(ok, mal); }
  }

  const crear = (base, opc = {}) => {
    const oyentes = [];
    const guarda = !(opc.auth && opc.auth.persistSession === false); // como supabase-js: en memoria o en localStorage
    const clave = (opc.auth && opc.auth.storageKey) || KEY; // el frente (cuenta.js) guarda la sesión con su propio nombre
    let enMemoria = null;
    const cliente = {
      _sesion() { if (!guarda) return enMemoria; try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; } },
      _guardar(s) { if (!guarda) { enMemoria = s; return; } if (s) localStorage.setItem(clave, JSON.stringify(s)); else localStorage.removeItem(clave); },
      from(t) { return new Consulta(base, cliente, t); },
      // Storage de juguete (las fotos de "Tu página"): sube como la cuenta, así se aplican los permisos del bucket
      storage: {
        from(bucket) {
          return {
            async upload(ruta, blob, opc = {}) {
              const s = cliente._sesion();
              const b64 = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
              const r = await post(base + '/api/storage/subir', { token: s && s.access_token, bucket, ruta, tipo: opc.contentType || blob.type, b64 });
              return { data: r.error ? null : { path: ruta }, error: errorDe(r.error) || null };
            },
            getPublicUrl(ruta) { return { data: { publicUrl: `${base}/storage/v1/object/public/${bucket}/${ruta}` } }; },
            async remove(rutas) {
              const s = cliente._sesion();
              const r = await post(base + '/api/storage/borrar', { token: s && s.access_token, bucket, rutas });
              return { data: r.error ? null : rutas, error: errorDe(r.error) || null };
            },
          };
        },
      },
      async rpc(fn, args) {
        const s = cliente._sesion();
        const r = await post(base + '/api/q', { token: s && s.access_token, op: 'rpc', fn, args });
        return { data: r.error ? null : r.data, error: errorDe(r.error) || null };
      },
      auth: {
        async getSession() { await inicial; return { data: { session: cliente._sesion() }, error: null }; },
        async signInWithPassword({ email, password }) {
          const r = await post(base + '/api/auth/login', { email, password });
          if (r.error) return { data: { user: null, session: null }, error: errorDe(r.error) };
          cliente._guardar(r.data.session); oyentes.forEach((f) => f('SIGNED_IN', r.data.session));
          return { data: r.data, error: null };
        },
        async signUp({ email, password, options = {} }) {
          const r = await post(base + '/api/auth/signup', { email, password, data: options.data });
          if (r.error) return { data: { user: null, session: null }, error: errorDe(r.error) };
          if (r.data.session) cliente._guardar(r.data.session);
          return { data: r.data, error: null };
        },
        async signOut() { cliente._guardar(null); oyentes.forEach((f) => f('SIGNED_OUT', null)); return { error: null }; },
        async updateUser(cambios) {
          const s = cliente._sesion();
          const r = await post(base + '/api/auth/update', { token: s && s.access_token, ...cambios });
          if (r.error) return { data: { user: null }, error: errorDe(r.error) };
          cliente._guardar({ ...s, user: r.data.user });
          return { data: r.data, error: null };
        },
        async resetPasswordForEmail(email) { const r = await post(base + '/api/auth/recover', { email }); return { data: {}, error: errorDe(r.error) || null }; },
        onAuthStateChange(f) { oyentes.push(f); return { data: { subscription: { unsubscribe() {} } } }; },
      },
    };
    // detectSessionInUrl: los links de los mails traen la sesión en la dirección (#access_token=...&type=...)
    const m = /access_token=([^&]+)/.exec(location.hash);
    const inicial = m && !(opc.auth && opc.auth.detectSessionInUrl === false)
      ? post(base + '/api/auth/token', { id: decodeURIComponent(m[1]) }).then((r) => {
        if (!r.data) return;
        cliente._guardar(r.data.session);
        if (/type=recovery/.test(location.hash)) setTimeout(() => oyentes.forEach((f) => f('PASSWORD_RECOVERY', r.data.session)));
      })
      : Promise.resolve();
    (window.__clientes = window.__clientes || []).push(cliente); // para que la prueba use el mismo cliente que el panel
    return cliente;
  };
  window.supabase = { createClient: (url, clave, opc) => crear(url, opc) };
})();
