// Bookea — interacciones de la landing
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
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

  // ---------- Buscador de turnos: arma la búsqueda y lleva a reservar.html ----------
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const hoyMendoza = () => {
    try {
      const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza" }).format(new Date()).split("-").map(Number);
      return new Date(y, m - 1, d);
    } catch { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  };
  const finder = $("#finder");
  if (finder) {
    const fd = $("#fd"), base = hoyMendoza();
    fd.innerHTML = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base); d.setDate(base.getDate() + i);
      const nombre = i === 0 ? "Hoy" : i === 1 ? "Mañana" : DIAS[d.getDay()][0].toUpperCase() + DIAS[d.getDay()].slice(1);
      return `<option value="${i}">${nombre} ${d.getDate()}/${d.getMonth() + 1}</option>`;
    }).join("");
    finder.addEventListener("submit", (e) => {
      e.preventDefault();
      const p = new URLSearchParams(new FormData(finder));
      try { sessionStorage.setItem("bookea:busqueda", p.toString()); } catch {}
      location.href = "reservar.html?" + p.toString();
    });
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

  // ---------- Preguntas: se despliegan y se pliegan con una animación corta ----------
  // Una abierta por vez. El "name" del HTML hace eso sin JS, pero cierra las otras de golpe:
  // acá se saca y se cierran animadas.
  const faqs = $$(".faq details");
  const curva = "cubic-bezier(0.22, 1, 0.36, 1)";
  const animarAlto = (d, desde, hasta, ms) => {
    if (d._anim) d._anim.cancel();
    d.style.overflow = "hidden";
    const a = d.animate({ height: [`${desde}px`, `${hasta}px`] }, { duration: ms, easing: curva });
    d._anim = a;
    const fin = () => { if (d._anim === a) { d._anim = null; d.style.overflow = ""; } };
    a.onfinish = fin; a.oncancel = fin;
    return a;
  };
  const cerrar = (d) => {
    if (!d.open || d.classList.contains("is-cerrando")) return;
    if (reduce) { d.open = false; return; }
    const desde = d.offsetHeight, hasta = d.querySelector("summary").offsetHeight;
    d.classList.add("is-cerrando");
    animarAlto(d, desde, hasta, 260).onfinish = () => {
      d.open = false; d.classList.remove("is-cerrando"); d._anim = null; d.style.overflow = "";
    };
  };
  const abrir = (d) => {
    faqs.forEach((o) => o !== d && cerrar(o));
    if (d.open && !d.classList.contains("is-cerrando")) return;
    const desde = d.offsetHeight;
    d.classList.remove("is-cerrando");
    d.open = true;
    if (reduce) return;
    animarAlto(d, desde, d.scrollHeight, 340);
    const p = d.querySelector("p");
    if (p) p.animate({ opacity: [0, 1], transform: ["translateY(-8px)", "none"] }, { duration: 320, delay: 60, easing: curva, fill: "backwards" });
  };
  faqs.forEach((d) => {
    d.removeAttribute("name");
    d.querySelector("summary").addEventListener("click", (e) => {
      e.preventDefault();
      if (d.open && !d.classList.contains("is-cerrando")) cerrar(d); else abrir(d);
    });
  });

  // "¿Quiénes somos?" lleva a Preguntas frecuentes con su respuesta abierta
  $$("[data-abrir]").forEach((a) => a.addEventListener("click", () => { const d = document.getElementById(a.dataset.abrir); if (d) abrir(d); }));

  // ---------- Entradas ----------
  const grupos = [
    [".intro", [".intro__title"]],
    [".how", [".h-sec", ".ex"]],
    [".features", [".h-sec", ".cell"]],
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
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add("is-in"));

  // ---------- Siempre arriba de todo al cargar y al recargar ----------
  const alInicio = () => window.scrollTo(0, 0);
  // El script del <head> guarda el ancla solo si NO es una recarga (ver index.html)
  const irAlDestino = () => {
    const destino = window.__bkAncla && document.querySelector(window.__bkAncla);
    if (destino) destino.scrollIntoView({ block: "start" }); else alInicio();
  };
  alInicio();
  window.addEventListener("load", alInicio, { once: true });
  window.addEventListener("pageshow", (e) => { if (e.persisted) alInicio(); });
  window.addEventListener("beforeunload", alInicio);

  // ---------- Título: cada palabra en su ranura para la entrada ----------
  const titulo = $(".hero__title");
  if (titulo && !titulo.querySelector(".w")) {
    titulo.setAttribute("aria-label", titulo.textContent.trim());
    titulo.innerHTML = titulo.textContent.trim().split(/\s+/)
      .map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(" ");
  }

  // ---------- Hero: persiana del escenario ----------
  const hero = $(".hero"), sh = $(".shutter");
  const arrancarHero = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    hero && hero.classList.add("is-loaded");
    setTimeout(() => sh && sh.classList.add("is-in"), 600);
    // Terminada la entrada, el menú responde al cursor sin la demora escalonada de la entrada
    setTimeout(() => document.documentElement.classList.add("nav-lista"), 1200);
  }));

  // ---------- Pantalla de carga: el logo se arma y después sube ----------
  const splash = $(".splash");
  const t0 = performance.now();
  const salir = () => {
    if (!splash || splash.classList.contains("is-out")) return;
    irAlDestino(); // arriba de todo, o a la sección si llegaste con un link a ella
    splash.classList.add("is-out");
    document.documentElement.classList.add("is-ready");
    arrancarHero();
    setTimeout(() => splash.remove(), 1000);
  };
  if (!splash) { irAlDestino(); document.documentElement.classList.add("is-ready"); arrancarHero(); }
  else {
    // Se ve al menos lo que tarda en armarse el logo (más corto con "reducir movimiento")
    const listo = () => setTimeout(salir, Math.max(0, (reduce ? 600 : 1500) - (performance.now() - t0)));
    if (document.readyState === "complete") listo(); else window.addEventListener("load", listo, { once: true });
    setTimeout(salir, 4000); // tope por si algo tarda en cargar
  }
})();
