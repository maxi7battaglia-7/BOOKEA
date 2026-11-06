// Bookea — interacciones de la landing
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Año del pie ----------
  const y = $("#year"); if (y) y.textContent = new Date().getFullYear();

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


  // ---------- Entradas ----------
  const grupos = [
    [".intro", [".intro__title"]],
    [".how", [".h-sec", ".how__sub", ".ex"]],
    [".features", [".h-sec", ".features__sub", ".cell"]],
    [".join", [".join__title", ".join__next li", ".form"]],
    [".faq", [".faq__title", ".faq details"]],
    [".foot", [".foot__brand", ".foot__col"]],
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
    // La B de "Bookea" es la B del isotipo, sin el fondo: panzas verde agua y naranja, palo noche
    // (el crema del logo se perdería sobre el blanco). Mismo dibujo que marca/isotipo.svg.
    const isotipo = `<svg class="marca-b" viewBox="263 180 487 640" aria-hidden="true"><defs><mask id="hb-panzas" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">`
      + `<path d="M391,180 H520 A175,175 0 0 1 520,530 H391 Z" fill="#fff"/><path d="M391,426 H545 A197,197 0 0 1 545,820 H391 Z" fill="#fff"/>`
      + `<path d="M391,284 H520 A71,71 0 0 1 520,426 H391 Z" fill="#000"/><path d="M391,530 H545 A93,93 0 0 1 545,716 H391 Z" fill="#000"/></mask></defs>`
      + `<g transform="translate(8,0)"><g mask="url(#hb-panzas)"><polygon points="0,0 1000,0 1000,553.38 0,377.06" fill="#1fa08c"/>`
      + `<polygon points="0,377.06 1000,553.38 1000,1000 0,1000" fill="#e4572e"/></g><rect x="255" y="180" width="136" height="640" fill="#11151c"/></g></svg>`;
    titulo.innerHTML = titulo.textContent.trim().split(/\s+/)
      .map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w === "Bookea" ? isotipo + "ookea" : w}</span></span>`).join(" ");
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

// Toque en pantallas táctiles: mientras el dedo apoya, el botón se aprieta (.is-apreta); al soltar,
// se agranda un poco y el color queda un momento (.is-suelta) antes de apagarse despacio.
// Si el dedo arrastra para hacer scroll, no queda marcado.
(() => {
  const tactil = window.matchMedia("(hover: none), (pointer: coarse)");
  const SEL = ".brand, .nav__links a, .nav .nav__cta";
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
  // Un link que lleva a otra página espera un instante, así se llega a ver el toque.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || !a.classList.contains("is-suelta") || e.defaultPrevented) return;
    const href = a.getAttribute("href");
    if (href.startsWith("#") || a.target || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    setTimeout(() => { window.location.href = a.href; }, 260);
  });
})();
