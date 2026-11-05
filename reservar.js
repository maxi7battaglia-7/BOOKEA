// Bookea — página de reservas.
// Los negocios, horarios y precios son de ejemplo, y el pago es una simulación:
// todavía no hay servidor ni Mercado Pago conectado.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pesos = (n) => "$ " + n.toLocaleString("es-AR");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // ---------- Datos de ejemplo ----------
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const ZONAS = {
    tunuyan: "Tunuyán", tupungato: "Tupungato", "san-carlos": "San Carlos", "san-rafael": "San Rafael",
    capital: "Ciudad de Mendoza", "godoy-cruz": "Godoy Cruz", guaymallen: "Guaymallén", "las-heras": "Las Heras",
    lujan: "Luján de Cuyo", maipu: "Maipú",
  };
  const REGION = {
    tunuyan: "uco", tupungato: "uco", "san-carlos": "uco", "san-rafael": "sur",
    capital: "gran", "godoy-cruz": "gran", guaymallen: "gran", "las-heras": "gran", lujan: "gran", maipu: "gran",
  };
  const NOMBRE_REGION = { uco: "el Valle de Uco", sur: "el Sur", gran: "el Gran Mendoza" };
  const RUBROS = {
    padel: { nombre: "Pádel", unidad: "cancha", unidades: "canchas", dur: 90 },
    futbol: { nombre: "Fútbol 5", unidad: "cancha", unidades: "canchas", dur: 60 },
    tenis: { nombre: "Tenis", unidad: "cancha", unidades: "canchas", dur: 60 },
    barberia: { nombre: "Barbería", unidad: "barbero", unidades: "barberos", dur: 45 },
  };
  const SERVICIOS = [
    { id: "corte", n: "Corte", p: 12000 },
    { id: "barba", n: "Barba", p: 8000 },
    { id: "corte-barba", n: "Corte y barba", p: 18000 },
  ];
  const H_PADEL = ["09:00", "10:30", "17:00", "18:30", "20:00", "21:30", "23:00"];
  const H_FUTBOL = ["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];
  const H_TENIS = ["08:00", "09:00", "10:00", "17:00", "18:00", "19:00", "20:00"];
  const H_BARBER = ["10:00", "10:45", "11:30", "12:15", "17:00", "17:45", "18:30", "19:15", "20:00"]; // de 13 a 17, siesta
  const noche = (dia, tarde) => (t) => (t >= "20:00" ? dia : tarde);
  const LUGARES = [
    { id: "los-alamos", nombre: "Club Los Álamos", rubro: "padel", zona: "tunuyan", detalle: "3 canchas, 1 techada", recursos: ["Cancha 1", "Cancha 2", "Cancha 3 (techada)"], horas: H_PADEL, precio: noche(34000, 28000) },
    { id: "padel-del-valle", nombre: "Pádel del Valle", rubro: "padel", zona: "tupungato", detalle: "2 canchas de blindex", recursos: ["Cancha 1", "Cancha 2"], horas: H_PADEL, precio: noche(32000, 26000) },
    { id: "vidrio-y-pared", nombre: "Vidrio y Pared", rubro: "padel", zona: "san-rafael", detalle: "3 canchas techadas", recursos: ["Cancha 1", "Cancha 2", "Cancha 3"], horas: H_PADEL, precio: noche(34000, 30000) },
    { id: "la-bandeja", nombre: "La Bandeja Pádel", rubro: "padel", zona: "godoy-cruz", detalle: "4 canchas techadas", recursos: ["Cancha 1", "Cancha 2", "Cancha 3", "Cancha 4"], horas: H_PADEL, precio: noche(38000, 32000) },
    { id: "padel-las-vinas", nombre: "Pádel Las Viñas", rubro: "padel", zona: "lujan", detalle: "3 canchas al aire libre", recursos: ["Cancha 1", "Cancha 2", "Cancha 3"], horas: H_PADEL, precio: noche(36000, 30000) },
    { id: "la-acequia", nombre: "Complejo La Acequia", rubro: "futbol", zona: "tunuyan", detalle: "2 canchas de sintético", recursos: ["Cancha 1", "Cancha 2"], horas: H_FUTBOL, precio: () => 48000 },
    { id: "los-platanos", nombre: "Cancha Los Plátanos", rubro: "futbol", zona: "san-carlos", detalle: "2 canchas de sintético", recursos: ["Cancha 1", "Cancha 2"], horas: H_FUTBOL, precio: () => 44000 },
    { id: "el-potrero", nombre: "El Potrero F5", rubro: "futbol", zona: "san-rafael", detalle: "3 canchas de sintético", recursos: ["Cancha 1", "Cancha 2", "Cancha 3"], horas: H_FUTBOL, precio: () => 50000 },
    { id: "futbol-sur", nombre: "Fútbol Sur", rubro: "futbol", zona: "maipu", detalle: "4 canchas, 2 techadas", recursos: ["Cancha 1", "Cancha 2", "Cancha 3 (techada)", "Cancha 4 (techada)"], horas: H_FUTBOL, precio: () => 54000 },
    { id: "polvo-rojo", nombre: "Club Polvo Rojo", rubro: "tenis", zona: "tunuyan", detalle: "2 de polvo de ladrillo, 1 de cemento", recursos: ["Polvo 1", "Polvo 2", "Cemento"], horas: H_TENIS, precio: () => 22000 },
    { id: "raqueta-valle", nombre: "Raqueta Valle", rubro: "tenis", zona: "tupungato", detalle: "2 de polvo de ladrillo", recursos: ["Polvo 1", "Polvo 2"], horas: H_TENIS, precio: () => 20000 },
    { id: "tenis-del-parque", nombre: "Tenis del Parque", rubro: "tenis", zona: "capital", detalle: "4 de polvo de ladrillo", recursos: ["Polvo 1", "Polvo 2", "Polvo 3", "Polvo 4"], horas: H_TENIS, precio: () => 26000 },
    { id: "don-ruiz", nombre: "Barbería Don Ruiz", rubro: "barberia", zona: "tunuyan", detalle: "2 barberos, cerramos de 13 a 17", recursos: ["Lucas", "Fede"], horas: H_BARBER },
    { id: "la-navaja", nombre: "La Navaja", rubro: "barberia", zona: "san-rafael", detalle: "3 barberos, cerramos de 13 a 17", recursos: ["Mati", "Gonza", "Leo"], horas: H_BARBER },
    { id: "barberia-central", nombre: "Barbería Central", rubro: "barberia", zona: "capital", detalle: "3 barberos, cerramos de 13 a 17", recursos: ["Juan", "Nico", "Seba"], horas: H_BARBER },
    { id: "corte-fino", nombre: "Corte Fino", rubro: "barberia", zona: "godoy-cruz", detalle: "2 barberos, cerramos de 13 a 17", recursos: ["Ale", "Bruno"], horas: H_BARBER },
  ];
  const SENA_BARBERIA = 4000;
  const sena = (precio) => Math.round((precio * 0.25) / 500) * 500;

  // ---------- Fecha y hora de Mendoza ----------
  const ahoraMendoza = () => {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
        .formatToParts(new Date()).map((x) => [x.type, x.value]));
      return { fecha: new Date(+p.year, +p.month - 1, +p.day), min: (+p.hour % 24) * 60 + +p.minute };
    } catch { const n = new Date(); return { fecha: new Date(n.getFullYear(), n.getMonth(), n.getDate()), min: n.getHours() * 60 + n.getMinutes() }; }
  };
  const AHORA = ahoraMendoza();
  const fechaDe = (off) => { const d = new Date(AHORA.fecha); d.setDate(d.getDate() + off); return d; };
  const nombreDia = (off) => {
    const d = fechaDe(off);
    const n = off === 0 ? "Hoy" : off === 1 ? "Mañana" : DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1);
    return `${n} ${d.getDate()}/${d.getMonth() + 1}`;
  };
  const aMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  // Disponibilidad simulada, estable para cada lugar, día, hora y cancha
  const hash = (s) => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
  const reservados = new Set();
  const clave = (l, off, t, r) => `${l.id}|${off}|${t}|${r}`;
  const libre = (l, off, t, r) => {
    if (reservados.has(clave(l, off, t, r))) return false;
    if (off === 0 && aMin(t) < AHORA.min + 30) return false; // ya pasó o es muy pronto
    return hash(clave(l, off, t, r)) % 5 > 1;
  };
  const enFranja = (t, f) => {
    const m = aMin(t);
    if (f === "manana") return m < 12 * 60;
    if (f === "tarde") return m >= 12 * 60 && m < 19 * 60;
    if (f === "noche") return m >= 19 * 60;
    return true;
  };

  // ---------- Estado de la búsqueda ----------
  const form = $("#busq");
  const bd = $("#bd");
  bd.innerHTML = Array.from({ length: 7 }, (_, i) => `<option value="${i}">${nombreDia(i)}</option>`).join("");

  const leerInicial = () => {
    let q = location.search.slice(1);
    if (!q) { try { q = sessionStorage.getItem("bookea:busqueda") || ""; } catch {} }
    const p = new URLSearchParams(q);
    const rubro = RUBROS[p.get("rubro")] ? p.get("rubro") : "padel";
    const zona = ZONAS[p.get("zona")] ? p.get("zona") : "";
    const dia = Math.min(6, Math.max(0, parseInt(p.get("dia") || "0", 10) || 0));
    const franja = ["manana", "tarde", "noche"].includes(p.get("franja")) ? p.get("franja") : "";
    return { rubro, zona, dia, franja };
  };
  let S = leerInicial();
  const aplicarAlForm = () => {
    $(`input[name="rubro"][value="${S.rubro}"]`, form).checked = true;
    $("#bz").value = S.zona; bd.value = String(S.dia); $("#bh").value = S.franja;
  };
  const guardar = () => {
    const q = new URLSearchParams({ rubro: S.rubro, zona: S.zona, dia: S.dia, franja: S.franja }).toString();
    try { sessionStorage.setItem("bookea:busqueda", q); } catch {}
    try { history.replaceState(null, "", location.pathname + "?" + q); } catch {}
  };
  form.addEventListener("change", () => {
    const fd = new FormData(form);
    S = { rubro: fd.get("rubro"), zona: fd.get("zona"), dia: +fd.get("dia"), franja: fd.get("franja") };
    guardar(); pintar();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  // ---------- Resultados ----------
  const lista = $("#lista");
  const turnosDe = (l) => l.horas
    .filter((t) => enFranja(t, S.franja))
    .map((t) => ({ t, libres: l.recursos.filter((r) => libre(l, S.dia, t, r)) }))
    .filter((x) => x.libres.length);

  function tarjeta(l) {
    const R = RUBROS[l.rubro];
    const turnos = turnosDe(l);
    const precioTxt = l.rubro === "barberia"
      ? `Corte ${pesos(12000)} · corte y barba ${pesos(18000)} · seña ${pesos(SENA_BARBERIA)}`
      : (() => { const ps = [...new Set(l.horas.map((t) => l.precio(t)))].sort((a, b) => a - b);
          return `Turno de ${R.dur} min desde ${pesos(ps[0])} · seña desde ${pesos(sena(ps[0]))}`; })();
    const slots = turnos.length
      ? `<ul class="slots" aria-label="Horarios libres de ${esc(l.nombre)}">${turnos.map((x) =>
          `<li><button type="button" class="hora" data-l="${l.id}" data-t="${x.t}"><b>${x.t}</b><small>${x.libres.length} ${x.libres.length === 1 ? R.unidad : R.unidades}</small></button></li>`).join("")}</ul>`
      : `<div class="sin"><p>No le quedan turnos libres ${S.franja ? "en esa franja " : ""}para ${nombreDia(S.dia).toLowerCase()}.</p>${S.dia < 6 ? `<button type="button" class="link" data-dia="${S.dia + 1}">Ver ${nombreDia(S.dia + 1).toLowerCase()}</button>` : ""}</div>`;
    return `<article class="lugar">
      <div class="lugar__info">
        <h2 class="lugar__nombre">${esc(l.nombre)}</h2>
        <p class="lugar__zona">${ZONAS[l.zona]} · ${esc(l.detalle)}</p>
        <p class="lugar__precio">${precioTxt}</p>
      </div>
      <div class="lugar__turnos">${slots}</div>
    </article>`;
  }

  function pintar() {
    const R = RUBROS[S.rubro];
    const delRubro = LUGARES.filter((l) => l.rubro === S.rubro);
    const ordenar = (arr) => arr.sort((a, b) => turnosDe(b).length - turnosDe(a).length);
    $("#res-t").textContent = S.zona ? `${R.nombre} en ${ZONAS[S.zona]}` : `Turnos de ${R.nombre.toLowerCase()}`;

    let html = "";
    let aca = [];
    if (S.zona) {
      aca = ordenar(delRubro.filter((l) => l.zona === S.zona));
      const cerca = ordenar(delRubro.filter((l) => l.zona !== S.zona && REGION[l.zona] === REGION[S.zona]));
      const resto = ordenar(delRubro.filter((l) => REGION[l.zona] !== REGION[S.zona]));
      if (aca.length) html += aca.map(tarjeta).join("");
      else html += `<div class="vacio"><h2>Todavía no hay ${R.nombre.toLowerCase() === "barbería" ? "barberías" : "lugares de " + R.nombre.toLowerCase()} en ${ZONAS[S.zona]} con Bookea.</h2><p>Si conocés uno, contale de Bookea.</p></div>`;
      if (cerca.length) html += `<h2 class="grupo">También en ${NOMBRE_REGION[REGION[S.zona]]}</h2>` + cerca.map(tarjeta).join("");
      if (resto.length) html += `<h2 class="grupo">En otras zonas</h2>` + resto.map(tarjeta).join("");
    } else {
      aca = ordenar(delRubro);
      html = aca.map(tarjeta).join("");
    }
    lista.innerHTML = html;
    const conTurnos = (S.zona ? aca : delRubro).filter((l) => turnosDe(l).length).length;
    const donde = S.zona ? ` en ${ZONAS[S.zona]}` : "";
    $("#res-meta").textContent = `${nombreDia(S.dia)}${S.franja ? " · " + $("#bh").selectedOptions[0].textContent.toLowerCase() : ""} · ${conTurnos} ${conTurnos === 1 ? "lugar con turnos libres" : "lugares con turnos libres"}${donde}`;
  }

  lista.addEventListener("click", (e) => {
    const otroDia = e.target.closest("[data-dia]");
    if (otroDia) { S.dia = +otroDia.dataset.dia; aplicarAlForm(); guardar(); pintar(); return; }
    const b = e.target.closest(".hora");
    if (b) abrirReserva(LUGARES.find((l) => l.id === b.dataset.l), b.dataset.t, b);
  });

  // ---------- Reserva: elegir, tus datos, seña, confirmado ----------
  const dlg = $("#reserva"), rv = $("#rv");
  let R0 = null; // reserva en curso
  let volverA = null;

  const resumen = () => {
    const precio = R0.lugar.rubro === "barberia" ? R0.servicio.p : R0.lugar.precio(R0.t);
    const s = R0.lugar.rubro === "barberia" ? SENA_BARBERIA : sena(precio);
    return { precio, s };
  };
  const cabecera = (titulo) => `
    <div class="rv__top">
      <div>
        <p class="rv__lugar">${esc(R0.lugar.nombre)} · ${ZONAS[R0.lugar.zona]}</p>
        <h2 class="rv__t" id="rv-t" tabindex="-1">${titulo}</h2>
      </div>
      <button type="button" class="rv__x" data-cerrar aria-label="Cerrar">×</button>
    </div>
    <p class="rv__cuando">${nombreDia(R0.dia)} · ${R0.t} · ${RUBROS[R0.lugar.rubro].dur} min</p>`;

  function paso1() {
    const L = R0.lugar, U = RUBROS[L.rubro];
    const libres = L.recursos.filter((r) => libre(L, R0.dia, R0.t, r));
    if (!R0.recurso || !libres.includes(R0.recurso)) R0.recurso = libres[0];
    if (L.rubro === "barberia" && !R0.servicio) R0.servicio = SERVICIOS[2];
    const { precio, s } = resumen();
    rv.innerHTML = cabecera("Elegí tu turno") + `
      <fieldset class="opc">
        <legend>${U.unidad === "barbero" ? "Barbero" : "Cancha"}</legend>
        ${libres.map((r) => `<label class="opc__i"><input type="radio" name="recurso" value="${esc(r)}" ${r === R0.recurso ? "checked" : ""}/><span>${esc(r)}</span></label>`).join("")}
      </fieldset>
      ${L.rubro === "barberia" ? `<fieldset class="opc"><legend>Servicio</legend>${SERVICIOS.map((sv) =>
        `<label class="opc__i"><input type="radio" name="servicio" value="${sv.id}" ${sv.id === R0.servicio.id ? "checked" : ""}/><span>${sv.n}<small>${pesos(sv.p)}</small></span></label>`).join("")}</fieldset>` : ""}
      <dl class="cuenta">
        <div><dt>Precio del turno</dt><dd>${pesos(precio)}</dd></div>
        <div><dt>Seña para reservar</dt><dd>${pesos(s)}</dd></div>
        <div class="cuenta__resto"><dt>Pagás en el lugar</dt><dd>${pesos(precio - s)}</dd></div>
      </dl>
      <button type="button" class="btn btn--ink btn--lg btn--block" data-sig="2">Continuar</button>`;
    rv.onchange = (e) => {
      if (e.target.name === "recurso") R0.recurso = e.target.value;
      if (e.target.name === "servicio") R0.servicio = SERVICIOS.find((x) => x.id === e.target.value);
      paso1(); $(`input[name="${e.target.name}"][value="${CSS.escape(e.target.value)}"]`, rv)?.focus();
    };
  }

  function paso2() {
    const { s } = resumen();
    rv.onchange = null;
    rv.innerHTML = cabecera("Tus datos") + `
      <p class="rv__sub">${esc(R0.recurso)}${R0.servicio ? " · " + R0.servicio.n : ""}</p>
      <form class="rv__form" id="rv-datos" novalidate>
        <div class="field">
          <label for="rv-nombre">Nombre y apellido</label>
          <input id="rv-nombre" name="nombre" autocomplete="name" required aria-describedby="rv-nombre-err" value="${esc(R0.nombre || "")}" />
          <p class="field__err" id="rv-nombre-err" hidden>Escribí tu nombre para que el lugar sepa quién reservó.</p>
        </div>
        <div class="field">
          <label for="rv-wa">WhatsApp</label>
          <input id="rv-wa" name="wa" type="tel" inputmode="tel" autocomplete="tel" required aria-describedby="rv-wa-ayuda rv-wa-err" value="${esc(R0.wa || "")}" />
          <p class="field__help" id="rv-wa-ayuda">Con código de área, por ejemplo 2622 15 123456.</p>
          <p class="field__err" id="rv-wa-err" hidden>Escribí un WhatsApp con código de área (8 números o más).</p>
        </div>
        <div class="rv__acc">
          <button type="button" class="btn btn--ghost-ink" data-sig="1">Volver</button>
          <button type="submit" class="btn btn--ink btn--lg">Pagar seña de ${pesos(s)}</button>
        </div>
      </form>`;
    const f = $("#rv-datos");
    const chequear = (inp) => {
      const bad = inp.name === "wa" ? inp.value.replace(/\D/g, "").length < 8 : !inp.value.trim();
      inp.setAttribute("aria-invalid", String(bad)); inp.classList.toggle("is-invalid", bad);
      $("#" + inp.id + "-err").hidden = !bad; return bad;
    };
    $$("input", f).forEach((i) => i.addEventListener("input", () => { if (i.getAttribute("aria-invalid") === "true") chequear(i); }));
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const malos = $$("input", f).filter(chequear);
      if (malos.length) { malos[0].focus(); return; }
      R0.nombre = $("#rv-nombre").value.trim(); R0.wa = $("#rv-wa").value.trim();
      ir(3);
    });
  }

  function paso3() {
    const { s } = resumen();
    rv.innerHTML = cabecera("Pagá la seña") + `
      <div class="mp" data-ui>
        <p class="mp__k">Seña para ${esc(R0.lugar.nombre)}</p>
        <p class="mp__v">${pesos(s)}</p>
        <p class="mp__nota">En la app real, acá se abre Mercado Pago y la seña va directo a la cuenta del lugar. En esta vista previa no se cobra nada.</p>
      </div>
      <div class="rv__acc">
        <button type="button" class="btn btn--ghost-ink" data-sig="2">Volver</button>
        <button type="button" class="btn btn--orange btn--lg" data-pagar>Simular pago aprobado</button>
      </div>`;
  }

  function paso4() {
    reservados.add(clave(R0.lugar, R0.dia, R0.t, R0.recurso));
    const { precio, s } = resumen();
    const nombre = R0.nombre.split(" ")[0];
    rv.innerHTML = `
      <div class="rv__top">
        <div>
          <p class="rv__lugar ok">Seña pagada · turno confirmado</p>
          <h2 class="rv__t" id="rv-t" tabindex="-1">¡Listo, ${esc(nombre)}!</h2>
        </div>
        <button type="button" class="rv__x" data-cerrar aria-label="Cerrar">×</button>
      </div>
      <dl class="cuenta cuenta--fin">
        <div><dt>Dónde</dt><dd>${esc(R0.lugar.nombre)}, ${ZONAS[R0.lugar.zona]}</dd></div>
        <div><dt>Cuándo</dt><dd>${nombreDia(R0.dia)} · ${R0.t}</dd></div>
        <div><dt>${RUBROS[R0.lugar.rubro].unidad === "barbero" ? "Barbero" : "Cancha"}</dt><dd>${esc(R0.recurso)}${R0.servicio ? " · " + R0.servicio.n : ""}</dd></div>
        <div><dt>Seña pagada</dt><dd>${pesos(s)}</dd></div>
        <div class="cuenta__resto"><dt>Pagás en el lugar</dt><dd>${pesos(precio - s)}</dd></div>
      </dl>
      <p class="rv__sub">En la app real te llega la confirmación al WhatsApp ${esc(R0.wa)} y un recordatorio unas horas antes.</p>
      <button type="button" class="btn btn--ink btn--lg btn--block" data-cerrar>Listo</button>`;
    pintar();
  }

  const PASOS = { 1: paso1, 2: paso2, 3: paso3, 4: paso4 };
  function ir(n) {
    PASOS[n]();
    const t = $("#rv-t"); if (t) t.focus({ preventScroll: true });
  }
  function abrirReserva(lugar, t, origen) {
    R0 = { lugar, t, dia: S.dia, recurso: null, servicio: null, nombre: R0?.nombre, wa: R0?.wa };
    volverA = origen;
    ir(1);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    $("#rv-t")?.focus({ preventScroll: true });
  }
  const cerrar = () => { if (dlg.open) dlg.close(); };
  dlg.addEventListener("close", () => {
    // si se reservó, el botón ya no existe: vuelve el foco al lugar
    if (volverA && document.contains(volverA)) volverA.focus();
    else $("#res-t").focus?.();
  });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) return cerrar(); // clic afuera del panel
    if (e.target.closest("[data-cerrar]")) return cerrar();
    const sig = e.target.closest("[data-sig]"); if (sig) return ir(+sig.dataset.sig);
    const pagar = e.target.closest("[data-pagar]");
    if (pagar) {
      pagar.disabled = true; pagar.textContent = "Procesando…";
      setTimeout(() => ir(4), 900);
    }
  });

  // ---------- Links a una sección de la landing ("Sumá tu negocio") ----------
  // La landing siempre abre arriba; solo baja a la sección si este link lo deja anotado.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="#"]');
    if (!a) return;
    const h = a.getAttribute("href");
    try { sessionStorage.setItem("bookea:ir", h.slice(h.indexOf("#"))); } catch {}
  });

  // ---------- Arranque ----------
  $("#res-t").setAttribute("tabindex", "-1");
  aplicarAlForm(); guardar(); pintar();
})();
