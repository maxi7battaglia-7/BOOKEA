// Bookea — interacciones de la landing
// Todo lo que muestra la agenda son datos de ejemplo.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pesos = (n) => "$ " + n.toLocaleString("es-AR");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Hora de Mendoza ----------
  const horaMendoza = () => {
    try {
      return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Mendoza" }).format(new Date());
    } catch { return "21:04"; }
  };
  const notaHora = (h) => {
    if (h >= 13 && h < 17) return "Hora de la siesta. Las barberías abren a las 17.";
    if (h >= 17 && h < 20) return "Arranca la tarde y se mueven las reservas.";
    if (h >= 20 || h < 1) return "Las canchas de la noche ya se están llenando.";
    if (h >= 1 && h < 7) return "Todos duermen. Las reservas, no.";
    return "Las canchas de la mañana todavía tienen lugar.";
  };
  const tick = () => {
    const t = horaMendoza();
    const c = $("#clock"); if (c) c.textContent = t;
    const n = $("#clock-note"); if (n) n.textContent = notaHora(parseInt(t, 10));
  };
  tick(); setInterval(tick, 30000);
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();

  // ---------- Pestañas accesibles: flechas, Inicio y Fin, una sola en el orden de tabulación ----------
  function tablist(list, onSelect) {
    const tabs = $$('[role="tab"]', list);
    const sync = () => tabs.forEach((t) => t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1);
    sync();
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => { onSelect(t); sync(); });
      t.addEventListener("keydown", (e) => {
        const n = tabs.length;
        const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        const next = tabs[(to + n) % n];
        next.focus(); onSelect(next); sync();
      });
    });
  }

  // ---------- Agenda del hero ----------
  const F = (n) => ({ n, fixed: true });
  const B = (n, s) => ({ n, s });
  const AGENDAS = {
    padel: {
      venue: "Club Los Álamos", date: "Martes 10 de noviembre · turnos de 90 min", unit: "Cancha",
      cols: ["Cancha 1", "Cancha 2", "Cancha 3"],
      times: ["17:00", "18:30", "20:00", "21:30", "23:00"],
      price: (t) => (t < "20:00" ? 28000 : 34000),
      grid: [
        [F("Escuela · Prof. Sosa"), null, B("Lucía P.")],
        [B("Juan M."), B("Caro y Agus"), B("Nico R.")],
        [F("Los del martes"), B("Fede L."), null],
        [B("Pato S."), null, F("Los Pumas")],
        [null, null, B("Seba T.")],
      ],
    },
    futbol: {
      venue: "Complejo La Acequia", date: "Martes 10 de noviembre · turnos de 60 min", unit: "Cancha",
      cols: ["Cancha 1", "Cancha 2"],
      times: ["19:00", "20:00", "21:00", "22:00", "23:00"],
      price: () => 48000,
      grid: [
        [F("Escuelita"), null],
        [F("Los del laburo"), B("Tomi B.")],
        [B("Martín D."), F("Liga de los martes")],
        [null, B("Gonza R.")],
        [null, null],
      ],
    },
    tenis: {
      venue: "Club Polvo Rojo", date: "Martes 10 de noviembre · turnos de 60 min", unit: "Cancha",
      cols: ["Polvo 1", "Polvo 2", "Cemento"],
      times: ["08:00", "09:00", "18:00", "19:00", "20:00"],
      price: () => 22000,
      grid: [
        [F("Clase · Prof. Ana"), null, null],
        [B("Raúl y Beto"), null, null],
        [B("Sofía M."), F("Clase · Prof. Ana"), null],
        [F("Dobles del martes"), B("Ignacio V."), B("Pablo F.")],
        [null, B("Laura C."), null],
      ],
    },
    barberia: {
      venue: "Barbería Don Ruiz", date: "Martes 10 de noviembre · cerramos de 13 a 17", unit: "Barbero",
      cols: ["Lucas", "Fede"],
      times: ["11:00", "11:45", "12:30", "siesta", "17:00", "17:45", "18:30"],
      price: () => 18000,
      grid: [
        [B("Diego A.", "Corte"), null],
        [null, B("Mateo F.", "Corte y barba")],
        [B("Juani P.", "Barba"), B("Fran G.", "Corte")],
        null,
        [B("Ramiro T.", "Corte y barba"), null],
        [B("Lucho B.", "Corte"), B("Enzo M.", "Corte")],
        [null, B("Cris D.", "Barba")],
      ],
    },
  };
  const NOMBRES = ["Sofi", "Agus", "Cami", "Lean", "Vale", "Joaco", "Flor", "Rocío", "Tincho", "Meli"];
  let nombreIdx = 0;
  let rubro = "padel";
  const sena = (p) => Math.round(p * 0.25);

  const grid = $("#ag-grid");
  function renderAgenda() {
    const a = AGENDAS[rubro];
    $("#ag-venue").textContent = a.venue;
    $("#ag-date").textContent = a.date;
    grid.style.setProperty("--cols", a.cols.length);
    const out = ['<div class="ag-h" aria-hidden="true"></div>'];
    a.cols.forEach((c) => out.push(`<div class="ag-h">${c}</div>`));
    a.times.forEach((t, r) => {
      if (t === "siesta") {
        out.push(`<div class="ag-t">13:00</div><div class="ag-closed">Siesta · cerrado hasta las 17:00</div>`);
        return;
      }
      out.push(`<div class="ag-t">${t}</div>`);
      a.cols.forEach((c, k) => {
        const v = a.grid[r][k];
        const p = a.price(t);
        let html;
        if (!v) html = `<button type="button" class="slot slot--free" data-r="${r}" data-k="${k}" aria-label="Reservar ${c} a las ${t}"><b>Libre</b><small>${pesos(p)}</small></button>`;
        else if (v.mine) html = `<button type="button" class="slot slot--new" data-r="${r}" data-k="${k}" aria-label="Deshacer reserva de ${v.n}, ${c} a las ${t}"><b>${v.n}</b><small>Seña ${pesos(sena(p))} pagada</small></button>`;
        else if (v.fixed) html = `<div class="slot slot--fixed"><b>${v.n}</b><small>Turno fijo</small></div>`;
        else html = `<div class="slot slot--taken"><b>${v.n}</b><small>${v.s || "Seña pagada"}</small></div>`;
        out.push(`<div class="ag-c">${html}</div>`);
      });
    });
    grid.innerHTML = out.join("");
    updateKpi();
  }
  function updateKpi() {
    const a = AGENDAS[rubro];
    let total = 0, taken = 0, money = 0;
    a.times.forEach((t, r) => {
      if (t === "siesta") return;
      a.cols.forEach((_, k) => { total++; if (a.grid[r][k]) { taken++; money += a.price(t); } });
    });
    $("#ag-occ").textContent = `${taken} de ${total}`;
    $("#ag-money").textContent = `${pesos(money)} reservados`;
  }
  function confirmar(a, t, c, v) {
    const wa = $(".wa");
    const p = a.price(t);
    const donde = a.unit === "Barbero" ? `con ${c}` : c;
    $("#wa-text").innerHTML =
      `<p>¡Listo, ${v.n}! Tu turno en <b>${a.venue}</b> quedó confirmado.</p>` +
      `<p>Martes 10/11 · ${t} · ${donde}</p>` +
      `<p>Seña de ${pesos(sena(p))} recibida por Mercado Pago. Te recordamos 3 horas antes.</p>`;
    $("#wa-time").textContent = horaMendoza();
    if (wa && !reduce) { wa.classList.remove("is-bump"); void wa.offsetWidth; wa.classList.add("is-bump"); }
  }
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("button.slot");
    if (!b) return;
    const a = AGENDAS[rubro];
    const r = +b.dataset.r, k = +b.dataset.k;
    const cur = a.grid[r][k];
    if (cur && cur.mine) { a.grid[r][k] = null; renderAgenda(); focusSlot(r, k); return; }
    const v = { n: NOMBRES[nombreIdx++ % NOMBRES.length], mine: true };
    a.grid[r][k] = v;
    renderAgenda();
    confirmar(a, a.times[r], a.cols[k], v);
    focusSlot(r, k);
  });
  const focusSlot = (r, k) => { const el = grid.querySelector(`button[data-r="${r}"][data-k="${k}"]`); if (el) el.focus({ preventScroll: true }); };
  tablist($(".agenda__tabs"), (tab) => {
    $$(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === tab)));
    rubro = tab.dataset.rubro;
    grid.setAttribute("aria-labelledby", tab.id);
    renderAgenda();
    const a = AGENDAS[rubro];
    $("#ag-status").textContent = `Agenda de ${a.venue}: ${$("#ag-occ").textContent} turnos ocupados.`;
  });
  renderAgenda();

  // Entre 1081 y 1400 px la tarjeta de WhatsApp va debajo del texto del hero
  const waCard = $(".wa"), waHome = $(".stage__inner"), heroCopy = $(".hero__copy");
  const medio = window.matchMedia("(min-width: 1081px) and (max-width: 1400px)");
  const ubicarWa = () => {
    if (!waCard) return;
    if (medio.matches && waCard.parentElement !== heroCopy) heroCopy.appendChild(waCard);
    else if (!medio.matches && waCard.parentElement !== waHome) waHome.appendChild(waCard);
  };
  ubicarWa();
  medio.addEventListener("change", ubicarWa);

  // ---------- Buscador: escribí como tu cliente ----------
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const HOY = new Date(2026, 10, 10); // martes 10/11, el día de la agenda de ejemplo
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const NOMBRE_RUBRO = { padel: "Pádel", futbol: "Fútbol 5", tenis: "Tenis", barberia: "Barbería" };
  const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const aMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  function buscar(q) {
    const s = norm(q);
    let ru = "padel";
    if (/futbol|f5|fulbito|futbolito/.test(s)) ru = "futbol";
    else if (/tenis/.test(s)) ru = "tenis";
    else if (/corte|barba|barber|pelo/.test(s)) ru = "barberia";
    let fecha = new Date(HOY);
    if (/manana(?!.*temprano)|pasado/.test(s) && !/a la manana/.test(s)) fecha.setDate(HOY.getDate() + (/pasado/.test(s) ? 2 : 1));
    if (/manana temprano|manana a la/.test(s)) fecha.setDate(HOY.getDate() + 1);
    DIAS.forEach((d, i) => {
      if (new RegExp("\\b" + norm(d) + "\\b").test(s)) { const diff = (i - HOY.getDay() + 7) % 7; fecha = new Date(HOY); fecha.setDate(HOY.getDate() + diff); }
    });
    const a = AGENDAS[ru];
    let h = { padel: 21, futbol: 21, tenis: 19, barberia: 18 }[ru];
    // La hora: el número después de "a las", o el último que no sea el "5" de "fútbol 5"
    const nums = [...s.matchAll(/(\d{1,2})(?:[:.](\d{2}))?/g)].filter((n) => !/(futbol|f)\s*$/.test(s.slice(0, n.index)));
    const m = s.match(/las?\s+(\d{1,2})(?:[:.](\d{2}))?/) || nums[nums.length - 1] || null;
    if (m && +m[1] <= 24) h = +m[1] + (m[2] ? +m[2] / 60 : 0);
    else if (/temprano/.test(s)) h = 8;
    else if (/tarde/.test(s)) h = 18;
    else if (/noche/.test(s)) h = 21;
    const times = a.times.filter((t) => t !== "siesta").sort((x, y) => Math.abs(aMin(x) - h * 60) - Math.abs(aMin(y) - h * 60)).slice(0, 3).sort();
    const dd = `${fecha.getDate()}/${fecha.getMonth() + 1}`;
    const rows = times.map((t) => {
      const libres = a.cols.filter((c) => hash(dd + t + c + ru) % 3 !== 0);
      const c = libres[0] || a.cols[0];
      return { t, c, p: a.price(t), libre: libres.length > 0 };
    });
    if (!rows.some((r) => r.libre) && rows.length) rows[rows.length - 1].libre = true;
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    const cerca = mm ? `${hh}:${String(mm).padStart(2, "0")}` : `${hh}`;
    return { head: `${NOMBRE_RUBRO[ru]} · ${DIAS[fecha.getDay()]} ${dd} · cerca de las ${cerca}`, rows, ru };
  }
  const q = $("#q");
  function pintarBusqueda() {
    const r = buscar(q.value || "");
    $("#ans-head").textContent = r.head;
    $("#ans-rows").innerHTML = r.rows.map((x, i) =>
      `<li class="row-in" style="animation-delay:${i * 60}ms"><span><b>${x.t}</b> · ${r.ru === "barberia" ? "con " + x.c : x.c}</span><span>${pesos(x.p)}</span><span class="st ${x.libre ? "" : "st--off"}">${x.libre ? "Libre" : "Completo"}</span></li>`
    ).join("");
  }
  if (q) {
    let tm;
    q.addEventListener("input", () => { clearTimeout(tm); tm = setTimeout(pintarBusqueda, 350); });
    $$(".ex-btn").forEach((b) => b.addEventListener("click", () => { q.value = b.dataset.q; pintarBusqueda(); q.focus({ preventScroll: true }); }));
    pintarBusqueda();
  }

  // ---------- Reglas de cancelación ----------
  let horas = 6, devuelve = true;
  const nota = () => {
    $("#hrs").textContent = `${horas} h`;
    $("#rule-note").textContent = devuelve
      ? `Si cancela con más de ${horas} h, la seña vuelve sola.`
      : `Si cancela, la seña queda para vos y el turno se libera.`;
  };
  $$("[data-step]").forEach((b) => b.addEventListener("click", () => { horas = Math.min(48, Math.max(1, horas + +b.dataset.step)); nota(); }));
  const sw = $(".switch");
  if (sw) sw.addEventListener("click", () => { devuelve = !devuelve; sw.setAttribute("aria-checked", String(devuelve)); nota(); });

  // ---------- Precios ----------
  const PLANES = {
    piloto: { price: "$ 0", per: "durante el piloto", btn: "Sumarme al piloto",
      desc: "Para los primeros negocios de Mendoza. Tenés todo lo del plan Completo sin costo, te ayudamos a cargar la agenda en persona y a cambio nos contás qué mejorar." },
    esencial: { price: "$ 24.900", per: "por mes", btn: "Empezar con Esencial",
      desc: "Una agenda con hasta 4 canchas o 3 barberos, link de reservas, seña con Mercado Pago, recordatorios por WhatsApp y turnos fijos." },
    completo: { price: "$ 44.900", per: "por mes", btn: "Empezar con Completo",
      desc: "Todo lo de Esencial, con canchas y barberos sin límite, precio según el horario, reglas de cancelación, varias sedes y el resumen del mes." },
  };
  const stage = $("#plan-stage");
  const elegir = (btn) => {
    if (btn.getAttribute("aria-selected") === "true") return;
    const p = PLANES[btn.dataset.plan];
    $$(".plan").forEach((x) => x.setAttribute("aria-selected", String(x === btn)));
    stage.setAttribute("aria-labelledby", btn.id);
    const swap = () => {
      $("#pl-price").textContent = p.price; $("#pl-per").textContent = p.per;
      $("#pl-desc").textContent = p.desc; $("#pl-btn").textContent = p.btn;
      stage.classList.remove("is-swap");
    };
    if (reduce) swap(); else { stage.classList.add("is-swap"); setTimeout(swap, 200); }
  };
  tablist($(".plans"), elegir);

  // ---------- Copiar ----------
  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const txt = b.dataset.copy, orig = b.textContent;
    try { await navigator.clipboard.writeText(txt); b.textContent = "Copiado"; }
    catch { const r = document.createRange(); const t = b.previousElementSibling; if (t) { r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } b.textContent = "Seleccionado"; }
    setTimeout(() => (b.textContent = orig), 1600);
  }));

  // ---------- Formulario (sin servidor todavía) ----------
  const form = $("#form-sumate");
  if (form) {
    const msg = $(".form__msg", form);
    const btn = $('button[type="submit"]', form);
    const invalido = (f) => f.name === "whatsapp" ? f.value.replace(/\D/g, "").length < 8 : !f.value.trim();
    const marcar = (f) => {
      const bad = invalido(f);
      f.classList.toggle("is-invalid", bad);
      f.setAttribute("aria-invalid", String(bad));
      $("#" + f.id + "-err").hidden = !bad;
      return bad;
    };
    // Una vez marcado, el error se corrige mientras escribís
    $$("[required]", form).forEach((f) => f.addEventListener("input", () => { if (f.getAttribute("aria-invalid") === "true") marcar(f); }));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const malos = $$("[required]", form).filter(marcar);
      if (malos.length) {
        msg.textContent = malos.length === 1 ? "Falta completar un campo." : `Faltan completar ${malos.length} campos.`;
        msg.className = "form__msg err";
        malos[0].focus();
        return;
      }
      btn.disabled = true; btn.textContent = "Enviando…";
      msg.textContent = ""; msg.className = "form__msg";
      setTimeout(() => {
        btn.disabled = false; btn.textContent = "Quiero probarlo";
        msg.textContent = "¡Listo! Te escribimos por WhatsApp hoy mismo.";
        msg.className = "form__msg ok";
        form.reset();
      }, 700);
    });
  }

  // ---------- Preguntas: signo + / − ----------
  $$(".faq summary").forEach((s) => { const pm = document.createElement("span"); pm.className = "pm"; pm.setAttribute("aria-hidden", "true"); s.appendChild(pm); });

  // ---------- Entradas ----------
  const grupos = [
    [".intro", [".intro__title"]],
    [".how", [".h-sec", ".ex"]],
    [".search", [".search__title", ".search__line", ".search__answer", ".search__examples"]],
    [".features", [".h-sec", ".cell"]],
    [".place", [".place__title", ".letter__sheet", ".letter__pic"]],
    [".pricing", [".plan", ".plan-stage"]],
    [".join", [".join__title", ".join__next li", ".form"]],
    [".faq", [".faq__title", ".faq details"]],
    [".foot", [".tile"]],
  ];
  const items = [];
  grupos.forEach(([sec, sels]) => {
    const root = $(sec); if (!root) return;
    let i = 0;
    sels.forEach((sel) => $$(sel, root).forEach((el) => { el.classList.add("rise"); el.style.setProperty("--d", `${Math.min(i++, 6) * 75}ms`); items.push(el); }));
  });
  const pic = $(".place__pic"); if (pic) items.push(pic);
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add("is-in"));

  // ---------- Hero: persiana del escenario ----------
  const hero = $(".hero"), sh = $(".shutter");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    hero && hero.classList.add("is-loaded");
    setTimeout(() => sh && sh.classList.add("is-in"), 150);
  }));
})();
