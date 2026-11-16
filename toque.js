// Bookea — el toque en pantallas táctiles, igual en el sitio, las reservas y el panel.
// Mientras el dedo apoya, el botón se aprieta (.is-apreta); al soltar se agranda un poco y el color
// queda un momento (.is-suelta) antes de apagarse despacio. Los estilos están en styles.css y admin.css.
// Solo con dedo, no con mouse. Si el dedo arrastra para hacer scroll, no queda marcado.
(() => {
  const tactil = window.matchMedia("(hover: none), (pointer: coarse)");
  const SEL = [
    ".brand", ".nav__links a", ".btn", ".mini", ".call__copy", ".foot__copy", // sitio
    ".rubro", ".hora",                                                          // buscador y reservas
    ".menu__i", ".slot", ".nav-fecha button", ".lado__salir",                   // panel
  ].join(", ");
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
