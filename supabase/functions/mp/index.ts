// Bookea — función "mp" de Supabase (Edge Function, Deno): cada negocio cobra la seña de sus turnos con su propia
// cuenta de Mercado Pago (Checkout Pro con preferencias, la forma que Mercado Pago documenta para marketplaces), y
// Bookea se queda con su comisión (marketplace_fee). Hasta el 28/11 era con la API de Orders, pero ahí un cobro con
// comisión no se podía pagar (ver supabase/LEEME.md, "Probarlo").
//
// Rutas (https://<proyecto>.supabase.co/functions/v1/mp/…):
//   POST /mp/conectar  el panel, con la sesión del dueño: { negocio } → { url } de Mercado Pago para darle permiso a Bookea
//   GET  /mp/oauth     Mercado Pago vuelve acá con el permiso: guarda las llaves del negocio (en Vault) y vuelve al panel
//   POST /mp/cobrar    la página, con la sesión del cliente: { turno } → { url } para pagar la seña en Mercado Pago;
//                      con { turno, revisar: true, pago? } → { estado }: le pregunta a Mercado Pago si ya se pagó
//                      ("pago" es el payment_id con el que vuelve de Mercado Pago; igual se comprueba con Mercado Pago)
//   POST /mp/avisos    los avisos de Mercado Pago (webhook del evento "Pagos", firmado con la clave secreta)
//   POST /mp/devolver  la base avisa que hay señas para devolver (no lleva nada: mira la cola en la base)
//   POST /mp/revisar   pg_cron, cada 5 minutos: repasa los cobros abiertos, por si el aviso de un pago no llegó
//   POST /mp/renovar   pg_cron, una vez por día: renueva las llaves que están por vencer
//
// Nunca le cree al navegador: el monto, la comisión y la cuenta del negocio salen de la base, y lo que pasó con cada
// cobro se le pregunta a Mercado Pago con las llaves del negocio. Las llaves no salen nunca de acá ni de la base.
//
// Secretos (Supabase → Edge Functions → Secrets): MP_CLIENT_ID y MP_CLIENT_SECRET (la aplicación BOOKEA en Mercado
// Pago → Credenciales) y MP_WEBHOOK_SECRET (Webhooks → clave secreta). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los
// pone Supabase. Al publicarla, "Verify JWT" va apagado: cada ruta controla quién la llama. Guía: supabase/LEEME.md.

type Datos = Record<string, any>;

const env = (k: string): string => Deno.env.get(k) ?? "";
const supa = (): string => env("SUPABASE_URL").replace(/\/+$/, "");
// La clave secreta de la base: la nueva (sb_secret_…) si Supabase la da, o la de antes (service_role). Si en Supabase se
// apagaron las claves de antes y la función no recibe la nueva, se carga a mano como secreto BOOKEA_SECRET_KEY.
const claveBase = (): string => {
  if (env("BOOKEA_SECRET_KEY")) return env("BOOKEA_SECRET_KEY");
  try {
    const nuevas = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}");
    const k = nuevas && typeof nuevas === "object" ? Object.values(nuevas).find((x) => typeof x === "string" && x) : "";
    if (k) return k as string;
  } catch { /* no vino la lista nueva */ }
  return env("SUPABASE_SERVICE_ROLE_KEY");
};
const mpApi = (): string => env("MP_API_URL") || "https://api.mercadopago.com";
const mpAuth = (): string => env("MP_AUTH_URL") || "https://auth.mercadopago.com";
const sitio = (): string => (env("BOOKEA_SITIO") || "https://bookea.ar").replace(/\/+$/, "");
const vuelta = (): string => env("MP_REDIRECT_URI") || `${supa()}/functions/v1/mp/oauth`;
const origenes = (): Set<string> => new Set(["https://bookea.ar", "https://www.bookea.ar", "https://maxi7battaglia-7.github.io",
  ...env("BOOKEA_ORIGENES").split(",").map((s) => s.trim()).filter(Boolean)]);

class Falla extends Error {
  codigo: string;
  estado: number;
  constructor(codigo: string, estado = 400, detalle = "") {
    super(detalle || codigo);
    this.codigo = codigo;
    this.estado = estado;
  }
}

const esUuid = (x: unknown): boolean => typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const esOrden = (x: unknown): boolean => typeof x === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(x);
const esPago = (x: unknown): boolean => /^[0-9]{1,24}$/.test(String(x ?? ""));
const pesos = (n: number): string => `${Math.round(n)}.00`;
// Una fecha como la pide Mercado Pago, con la hora de Argentina: 2026-11-28T12:00:00.000-03:00
const fechaMP = (ms: number): string => new Date(ms - 3 * 3600e3).toISOString().replace("Z", "-03:00");
const numero = (x: unknown): number | null => (x === null || x === undefined || x === "" ? null : Number.isFinite(+x) ? +x : null);
// La dirección para pagar tiene que ser de Mercado Pago (nunca se manda al cliente a otro lado)
const esDeMercadoPago = (u: unknown): boolean => {
  try {
    const x = new URL(String(u));
    return x.protocol === "https:" && /(^|\.)(mercadopago|mercadolibre)\.com(\.[a-z]{2})?$/.test(x.hostname);
  } catch {
    return false;
  }
};

// ---------- Respuestas (la página y el panel la llaman desde bookea.ar) ----------
const cors = (req: Request): Record<string, string> => {
  const o = req.headers.get("origin") || "";
  return origenes().has(o)
    ? { "Access-Control-Allow-Origin": o, "Vary": "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Max-Age": "86400" }
    : {};
};
const responder = (req: Request, cuerpo: Datos, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });
const leer = async (req: Request): Promise<Datos> => {
  try {
    const d = await req.json();
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
};

// ---------- La base (con la clave secreta: las funciones mp_… de esquema.sql) ----------
async function base(fn: string, args: Datos = {}): Promise<any> {
  const k = claveBase();
  const h: Record<string, string> = { apikey: k, "Content-Type": "application/json", Accept: "application/json" };
  if (k.startsWith("eyJ")) h.Authorization = `Bearer ${k}`; // la clave vieja (JWT); la nueva (sb_secret_…) va solo en apikey
  const r = await fetch(`${supa()}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
  const t = await r.text();
  let d: any = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = null; }
  if (!r.ok) {
    const cod = String((d && d.code) || "");
    const codigo = cod === "42501" ? "permiso" : cod === "P0002" ? "no-existe" : "base";
    throw new Falla(codigo, cod === "42501" ? 403 : cod === "P0002" ? 404 : 500, `${fn}: ${r.status} ${cod} ${(d && d.message) || ""}`);
  }
  return d;
}

// Quién llama (la sesión de Supabase de la página o del panel)
async function cuentaDe(req: Request): Promise<{ id: string; email: string } | null> {
  const h = req.headers.get("authorization") || "";
  if (!/^Bearer [A-Za-z0-9._-]+$/.test(h)) return null;
  const r = await fetch(`${supa()}/auth/v1/user`, { headers: { apikey: claveBase(), Authorization: h } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && typeof u.id === "string" ? { id: u.id, email: String(u.email || "") } : null;
}

// ---------- Mercado Pago ----------
async function mp(llave: string, metodo: string, ruta: string, cuerpo?: Datos, idem?: string): Promise<{ ok: boolean; estado: number; d: Datos }> {
  const h: Record<string, string> = { Authorization: `Bearer ${llave}`, Accept: "application/json" };
  if (cuerpo !== undefined) h["Content-Type"] = "application/json";
  if (idem) h["X-Idempotency-Key"] = idem;
  const r = await fetch(mpApi() + ruta, { method: metodo, headers: h, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000) });
  const t = await r.text();
  let d: Datos = {};
  try { d = t ? JSON.parse(t) : {}; } catch { d = {}; }
  return { ok: r.ok, estado: r.status, d: d && typeof d === "object" ? d : {} };
}
// Pedir llaves a Mercado Pago (al conectar, con el código; al renovar, con el refresh token)
async function pedirLlaves(campos: Record<string, string>): Promise<{ ok: boolean; estado: number; d: Datos }> {
  const extra: Record<string, string> = env("MP_TEST_TOKEN") === "true" ? { test_token: "true" } : {};
  const r = await fetch(`${mpApi()}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: env("MP_CLIENT_ID"), client_secret: env("MP_CLIENT_SECRET"), ...campos, ...extra }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && !!(d && d.access_token), estado: r.status, d: d || {} };
}

// Las llaves de un negocio; si vencen en menos de 30 días, se renuevan antes
async function llavesDe(negocio: string): Promise<Datos> {
  const ll = await base("mp_llaves", { n: negocio });
  if (!ll || !ll.llave) throw new Falla("sin-cuenta", 409);
  if (ll.reconectar) throw new Falla("reconectar", 409);
  if (Date.parse(ll.vence) - Date.now() < 30 * 864e5) return await renovar(negocio, ll);
  return ll;
}
async function renovar(negocio: string, ll: Datos): Promise<Datos> {
  const r = await pedirLlaves({ grant_type: "refresh_token", refresh_token: String(ll.renovar || "") });
  if (r.ok) {
    await base("mp_guardar_cuenta", { n: negocio, quien: null, d: { ...r.d, user_id: r.d.user_id ?? ll.usuario } });
    return { ...ll, llave: r.d.access_token, renovar: r.d.refresh_token, vence: new Date(Date.now() + (+r.d.expires_in || 15552000) * 1000).toISOString() };
  }
  console.error(`mp: no se pudo renovar la cuenta del negocio ${negocio}: ${r.estado} ${r.d.error || ""}`);
  if (r.d.error === "invalid_grant") { // el dueño quitó el permiso, o ya no sirve: hay que conectarla de nuevo
    await base("mp_marcar_reconectar", { n: negocio });
    throw new Falla("reconectar", 409);
  }
  if (Date.parse(ll.vence) > Date.now() + 60e3) return ll; // Mercado Pago no contestó: la llave de ahora todavía sirve
  throw new Falla("mercado-pago", 502);
}

// Lo que dice Mercado Pago de un cobro, anotado en la base: sus pagos (los que tienen su referencia; "extra" son pagos
// que ya se trajeron por su id, por si la búsqueda de Mercado Pago todavía no los muestra) y qué pasó con cada uno
async function consultar(llave: string, orden: string, turno?: string, extra: Datos[] = []): Promise<Datos | null> {
  // Primero, que sea un cobro de Bookea y de ese turno (sin pago, mp_resultado solo dice cómo está)
  let r: Datos = (await base("mp_resultado", { orden, pago: "", estado: "", detalle: "", pagado: null })) || {};
  if (r.accion === "desconocido") return null;
  if (turno && r.turno && r.turno !== turno) {
    console.error(`mp: el cobro ${orden} no es del turno que dice la base`);
    return null;
  }
  const q = new URLSearchParams({ external_reference: orden, sort: "date_created", criteria: "asc", limit: "30" });
  const b = await mp(llave, "GET", `/v1/payments/search?${q}`);
  if (!b.ok) console.error(`mp: no se pudieron buscar los pagos del cobro ${orden}: ${b.estado}`);
  if (!b.ok && !extra.length) return null;
  const todos = new Map<string, Datos>();
  for (const p of [...(b.ok && Array.isArray(b.d.results) ? b.d.results : []), ...extra]) {
    if (p && esPago(p.id) && p.external_reference === orden) todos.set(String(p.id), p);
  }
  const lista = [...todos.values()];
  // Cada intento de pago, con su motivo (status_detail): lo que Mercado Pago no le dice al cliente ("No pudimos procesar
  // tu pago"). Queda en los Logs de la función y en mp_cobros.pagos (pedido del dueño, 27/11: saber por qué no se cobra).
  const pagos = resumenPagos(lista);
  if (lista.length) console.log(`mp: cobro ${orden}: pagos ${JSON.stringify(pagos)}`);
  try {
    if (lista.length) await base("mp_anotar_pagos", { orden, pagos });
  } catch (e) {
    console.error(`mp: no se pudieron anotar los pagos del cobro ${orden}: ${(e as Error).message}`);
  }
  // Primero los acreditados (así un cobro pagado y otro rechazado del mismo link quedan bien), después los demás
  const prioridad = (p: Datos) => (p.status === "approved" ? 0 : p.status === "refunded" ? 1 : 2);
  const acciones = new Set<string>();
  for (const p of lista.sort((a, c) => prioridad(a) - prioridad(c))) {
    r = (await base("mp_resultado", { orden, pago: String(p.id), estado: String(p.status || ""), detalle: String(p.status_detail || ""),
      pagado: numero(p.transaction_amount) })) || {};
    acciones.add(String(r.accion || ""));
  }
  const accion = ["confirmado", "devolver", "devuelto", "rechazado"].find((a) => acciones.has(a)) || "nada";
  return { ...r, accion };
}
// Los intentos de pago de un cobro, sin datos de nadie (ni la tarjeta ni el que paga)
function resumenPagos(lista: Datos[]): Datos[] {
  const t = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  return lista.slice(0, 10).map((p: Datos) => {
    const fee = Array.isArray(p.fee_details) ? p.fee_details.find((f: Datos) => f && f.type === "application_fee") : null;
    return { id: t(p.id, 40), estado: t(p.status, 40), detalle: t(p.status_detail, 60), medio: t(p.payment_method_id, 30),
      tipo: t(p.payment_type_id, 30), monto: t(p.transaction_amount, 20), comision: t(fee && fee.amount, 20) };
  });
}
// Un pago por su id, con las llaves del negocio (404 si no es de esa cuenta)
async function pagoDe(llave: string, id: string): Promise<{ ok: boolean; estado: number; d: Datos }> {
  return await mp(llave, "GET", `/v1/payments/${encodeURIComponent(id)}`);
}

// ---------- Rutas ----------
// El dueño toca "Conectar Mercado Pago" en el panel
async function conectar(req: Request): Promise<Datos> {
  const u = await cuentaDe(req);
  if (!u) throw new Falla("sesion", 401);
  const b = await leer(req);
  if (!esUuid(b.negocio)) throw new Falla("datos", 400);
  if (!env("MP_CLIENT_ID") || !env("MP_CLIENT_SECRET")) throw new Falla("sin-configurar", 503);
  const p = await base("mp_empezar_conexion", { n: b.negocio, quien: u.id });
  const q = new URLSearchParams({ client_id: env("MP_CLIENT_ID"), response_type: "code", platform_id: "mp", state: p.estado,
    redirect_uri: vuelta(), code_challenge: p.desafio, code_challenge_method: "S256" });
  return { url: `${mpAuth()}/authorization?${q}` };
}

// Mercado Pago vuelve con el permiso (o sin él)
async function alVolver(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams;
  const ir = (r: string) => Response.redirect(`${sitio()}/admin.html?mp=${r}`, 302);
  const estado = q.get("state") || "";
  if (!/^[0-9a-f]{64}$/.test(estado)) return ir("error");
  const e = await base("mp_tomar_estado", { e: estado }); // sirve una sola vez
  if (!e) return ir("vencido");
  const code = q.get("code") || "";
  if (!code) return ir("cancelado"); // dijo que no
  const r = await pedirLlaves({ grant_type: "authorization_code", code, redirect_uri: vuelta(), code_verifier: String(e.verificador) });
  if (!r.ok) {
    console.error(`mp: Mercado Pago no dio las llaves: ${r.estado} ${r.d.error || ""} ${r.d.message || ""}`);
    return ir("error");
  }
  // Qué llave dio Mercado Pago (solo el prefijo: APP_USR o TEST), si es de prueba (live_mode) y de qué cuenta
  console.log(`mp: Mercado Pago dio las llaves del negocio ${e.negocio}: llave ${String(r.d.access_token || "").split("-")[0].slice(0, 10)}…`
    + ` · live_mode ${r.d.live_mode} · cuenta ${r.d.user_id}${env("MP_TEST_TOKEN") === "true" ? " · pedidas con test_token" : ""}`);
  await base("mp_guardar_cuenta", { n: e.negocio, quien: e.quien, d: r.d });
  return ir("conectado");
}

// El cliente va a pagar la seña (o vuelve de Mercado Pago y la página pregunta cómo quedó)
async function cobrar(req: Request): Promise<Datos> {
  const u = await cuentaDe(req);
  if (!u) throw new Falla("sesion", 401);
  const b = await leer(req);
  if (!esUuid(b.turno)) throw new Falla("datos", 400);
  const d = await base("mp_datos_cobro", { turno: b.turno, quien: u.id });
  let estado = String(d.estado);
  const abiertos: Datos[] = Array.isArray(d.abiertos) ? d.abiertos : [];
  let ll: Datos | null = null;
  let reusar = "";
  // Primero, los cobros que ya tiene: si alguno se pagó, el turno queda confirmado; si sigue abierto, se usa ese link
  if (abiertos.length && d.negocio) {
    ll = await llavesDe(d.negocio);
    // Volvió de Mercado Pago con el id del pago: se trae directo (la búsqueda puede tardar unos segundos en mostrarlo)
    let vuelto: Datos | null = null;
    if (esPago(b.pago)) {
      const p = await pagoDe(ll.llave, String(b.pago));
      if (p.ok && esPago(p.d.id)) vuelto = p.d;
    }
    for (const a of abiertos) {
      if (!esOrden(a.orden)) continue;
      const r = await consultar(ll.llave, a.orden, d.turno, vuelto && vuelto.external_reference === a.orden ? [vuelto] : []);
      if (r && r.estado) estado = String(r.estado);
      if (!reusar && r && r.cobro === "creado" && esDeMercadoPago(a.url)) reusar = a.url;
    }
  }
  if (b.revisar || estado !== "pendiente") return { estado };
  if (!d.cobra) throw new Falla("no-cobra", 409);
  if (!(d.minutos >= 3)) throw new Falla("vencido", 409);
  if (reusar) return { estado, url: reusar };
  ll = ll || (await llavesDe(d.negocio));
  const monto = Math.round(+d.monto), titulo = String(d.titulo || "Seña").slice(0, 120);
  const orden = `bk-${d.turno}-${d.intento}`; // la referencia del cobro: con esta se buscan después sus pagos
  const volver = (r: string) => `${sitio()}/?pago=${r}&turno=${d.turno}`;
  const ahora = Date.now();
  const pedido: Datos = {
    items: [{ id: `sena-${String(d.codigo || "").slice(0, 20)}`, title: titulo, description: titulo, quantity: 1, unit_price: monto, currency_id: "ARS" }],
    external_reference: orden,
    back_urls: { success: volver("ok"), failure: volver("error"), pending: volver("pendiente") },
    auto_return: "approved",
    binary_mode: true, // aprobado o rechazado en el momento: el turno no puede quedar días "en proceso"
    payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], installments: 1 }, // sin efectivo (tarda días)
    // el link vence antes que el turno guardado
    expires: true, expiration_date_from: fechaMP(ahora - 60e3), expiration_date_to: fechaMP(ahora + Math.min(30, d.minutos - 2) * 60e3),
  };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(d.email || ""))) pedido.payer = { email: d.email };
  const comision = +d.comision > 0 && +d.comision < monto ? Math.round(+d.comision) : 0;
  if (comision) pedido.marketplace_fee = comision; // la parte de Bookea: Mercado Pago la pasa a la cuenta de Bookea
  const o = await mp(ll.llave, "POST", "/checkout/preferences", pedido, `bookea-${d.turno}-${d.intento}`);
  if (!o.ok || !o.d.id || !esDeMercadoPago(o.d.init_point)) {
    console.error(`mp: Mercado Pago no armó el cobro del turno ${d.turno}: ${o.estado} ${JSON.stringify(o.d).slice(0, 800)}`);
    throw new Falla("mercado-pago", 502);
  }
  console.log(`mp: cobro ${orden} armado: preferencia ${o.d.id} · ${comision ? `comisión ${comision}` : "sin comisión"}`
    + `${o.d.marketplace ? ` · ${o.d.marketplace}` : ""}${o.d.marketplace_fee !== undefined ? ` (Mercado Pago dice ${o.d.marketplace_fee})` : ""}`);
  await base("mp_cobro_creado", { turno: d.turno, orden, url: o.d.init_point, monto, comision });
  return { estado, url: o.d.init_point };
}

// El aviso de Mercado Pago: x-signature = "ts=…,v1=…", HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
const texto = new TextEncoder();
const hex = (b: ArrayBuffer): string => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const iguales = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
};
async function firmaOk(req: Request, dataId: string, secreto: string): Promise<boolean> {
  const partes: Record<string, string> = {};
  for (const p of (req.headers.get("x-signature") || "").split(",")) {
    const i = p.indexOf("=");
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  if (!partes.ts || !partes.v1) return false;
  const rid = req.headers.get("x-request-id") || "";
  const plantilla = (dataId ? `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};` : "") + (rid ? `request-id:${rid};` : "") + `ts:${partes.ts};`;
  const k = await crypto.subtle.importKey("raw", texto.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return iguales(hex(await crypto.subtle.sign("HMAC", k, texto.encode(plantilla))), partes.v1.toLowerCase());
}
async function aviso(req: Request): Promise<Datos> {
  const url = new URL(req.url);
  const b = await leer(req);
  const qid = url.searchParams.get("data.id") || "";
  const id = String(qid || (b.data && b.data.id) || "");
  const tipo = String(url.searchParams.get("type") || url.searchParams.get("topic") || b.type || "");
  const secreto = env("MP_WEBHOOK_SECRET");
  if (secreto && !(await firmaOk(req, qid || id, secreto))) {
    console.warn(`mp: aviso con una firma que no coincide (cobro ${id || "?"}): ¿MP_WEBHOOK_SECRET es la firma secreta de esta aplicación?`);
    throw new Falla("firma", 401);
  }
  console.log(`mp: aviso de Mercado Pago: ${b.action || tipo || "?"} ${id} · cuenta ${b.user_id ?? "?"}${b.live_mode !== undefined ? ` · live_mode ${b.live_mode}` : ""}`);
  if (!secreto) console.error("mp: falta la firma secreta de los avisos: el aviso no se puede comprobar (igual se consulta a Mercado Pago)");
  if (tipo !== "payment" || !esPago(id)) return { ok: true, ignorado: true }; // otros eventos (o el de prueba del panel)
  // De qué negocio es: el aviso dice de qué cuenta de Mercado Pago es el pago; el pago se le pide a Mercado Pago con sus
  // llaves (si el aviso mintiera la cuenta, Mercado Pago no lo encuentra) y su referencia dice qué cobro es
  const usuario = String(b.user_id ?? "");
  const negocios: string[] = /^[0-9]{1,20}$/.test(usuario) ? (await base("mp_negocios_de_cuenta", { usuario })) || [] : [];
  if (!negocios.length) return { ok: true, ignorado: true }; // no es de un negocio de Bookea (igual se repasa cada 5 minutos)
  const ll = await llavesDe(negocios[0]);
  const p = await pagoDe(ll.llave, id);
  if (p.estado === 404) return { ok: true, ignorado: true };
  if (!p.ok) throw new Falla("mercado-pago", 502); // Mercado Pago lo vuelve a mandar
  const k = esOrden(p.d.external_reference) ? await base("mp_cobro", { orden: p.d.external_reference }) : null;
  if (!k || !k.negocio || !negocios.includes(k.negocio)) return { ok: true, ignorado: true }; // no es un cobro de Bookea
  const llk = k.negocio === negocios[0] ? ll : await llavesDe(k.negocio);
  const r = await consultar(llk.llave, k.orden, k.turno || undefined, [p.d]);
  if (!r) throw new Falla("mercado-pago", 502);
  if (r.accion === "devolver") await devolver();
  return { ok: true, accion: r.accion };
}

// Cada 5 minutos (pg_cron): los cobros abiertos de las últimas 2 horas se le preguntan a Mercado Pago. Si el aviso de un
// pago no llegó (o el cliente cerró la página antes de volver), el turno se confirma igual, o la seña se devuelve.
async function revisar(): Promise<Datos> {
  const lista = await base("mp_por_revisar", {});
  const llaves = new Map<string, Datos>();
  let n = 0, devolverAlgo = false;
  for (const k of Array.isArray(lista) ? lista : []) {
    if (!esOrden(k.orden) || !esUuid(k.negocio)) continue;
    try {
      if (!llaves.has(k.negocio)) llaves.set(k.negocio, await llavesDe(k.negocio));
      const r = await consultar((llaves.get(k.negocio) as Datos).llave, k.orden, k.turno || undefined);
      if (r) n++;
      if (r && r.accion === "devolver") devolverAlgo = true;
    } catch (e) {
      console.error(`mp: no se pudo revisar el cobro ${k.orden}: ${(e as Error).message}`);
    }
  }
  if (devolverAlgo) await devolver();
  return { ok: true, revisados: n };
}

// Devolver las señas de la cola (lo decidió la base: un turno pagado que se canceló con tiempo, o un pago de más)
async function devolver(): Promise<Datos> {
  const cola = await base("mp_por_devolver", {});
  let n = 0;
  for (const k of Array.isArray(cola) ? cola : []) {
    if (!esOrden(k.orden)) continue;
    let hecha = false, detalle = "";
    try {
      if (!esUuid(k.negocio)) throw new Falla("sin-cuenta", 409);
      const ll = await llavesDe(k.negocio);
      if (esPago(k.pago)) { // la devolución entera del pago que se acreditó
        const r = await mp(ll.llave, "POST", `/v1/payments/${k.pago}/refunds`, {}, `bookea-devolver-${k.orden}`);
        hecha = r.ok;
        detalle = r.ok ? `devuelto ${r.d.id || ""} ${r.d.status || ""}`.trim() : `${r.estado} ${r.d.message || r.d.error || ""}`;
        if (!hecha) { // ¿ya estaba devuelto (por ejemplo, desde Mercado Pago)?
          const p = await pagoDe(ll.llave, k.pago);
          if (p.ok && p.d.status === "refunded") { hecha = true; detalle = "ya estaba devuelto"; }
        }
      } else if (/^ORD/.test(k.orden)) { // un cobro de antes del 28/11 (API de Orders)
        const r = await mp(ll.llave, "POST", `/v1/orders/${encodeURIComponent(k.orden)}/refund`, undefined, `bookea-devolver-${k.orden}`);
        hecha = r.ok;
        detalle = r.ok ? String(r.d.status || "refunded") : `${r.estado} ${r.d.message || r.d.error || ""}`;
      } else throw new Falla("sin-pago", 409);
    } catch (e) {
      detalle = e instanceof Falla ? e.codigo : String((e && (e as Error).message) || e);
    }
    if (!hecha) console.error(`mp: no se pudo devolver la seña del cobro ${k.orden}: ${detalle}`);
    await base("mp_devolucion", { orden: k.orden, hecha, detalle: detalle.slice(0, 200) });
    if (hecha) n++;
  }
  return { ok: true, devueltas: n };
}

// Una vez por día: las llaves que vencen en menos de 30 días se renuevan
async function renovarTodas(): Promise<Datos> {
  const lista = await base("mp_por_renovar", {});
  let n = 0;
  for (const neg of Array.isArray(lista) ? lista : []) {
    try {
      if (esUuid(neg)) { await llavesDe(neg); n++; }
    } catch { /* queda anotado en el registro; mañana se vuelve a intentar */ }
  }
  return { ok: true, renovadas: n };
}

export async function atender(req: Request): Promise<Response> {
  const ruta = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop() || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  try {
    if (ruta === "oauth" && req.method === "GET") return await alVolver(req);
    if (req.method !== "POST") return responder(req, { error: "metodo" }, 405);
    if (ruta === "conectar") return responder(req, await conectar(req));
    if (ruta === "cobrar") return responder(req, await cobrar(req));
    if (ruta === "avisos") return responder(req, await aviso(req));
    if (ruta === "devolver") return responder(req, await devolver());
    if (ruta === "revisar") return responder(req, await revisar());
    if (ruta === "renovar") return responder(req, await renovarTodas());
    return responder(req, { error: "ruta" }, 404);
  } catch (e) {
    const f = e instanceof Falla ? e : null;
    if (!f || f.estado >= 500) console.error(`mp ${ruta}:`, (e as Error).message);
    if (ruta === "oauth") return Response.redirect(`${sitio()}/admin.html?mp=error`, 302);
    return responder(req, { error: f ? f.codigo : "interno" }, f ? f.estado : 500);
  }
}

Deno.serve(atender);
