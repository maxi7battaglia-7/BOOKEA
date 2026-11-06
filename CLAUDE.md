# Proyecto: Bookea (turnos para canchas y barberías)

- El producto se llama **Bookea**.
- Sitio estático, sin frameworks.
  - Landing: `index.html`, `styles.css` y `script.js`. Arriba, el buscador para el cliente; abajo, la parte para negocios.
  - Reservas: `reservar.html`, `app.css` y `reservar.js`, con los turnos libres de cada lugar y la reserva. Por ahora los datos son de ejemplo y el pago es simulado.
- **Antes de cualquier cambio visual, leer `DESIGN.md`.** Es la dirección elegida por el dueño: Stripe + Figma + Trello, con los colores de la camiseta del Venezia.
- Vista previa publicada: https://claude.ai/artifact/EPAeEsx11Px3yKWRQBkgpL. Se regenera con `python3 scripts/preview.py` y se republica con `dist/bookea.html`, más `dist/reservar.html` como archivo aparte (`reservar.html`).
- Marca en `marca/`: isotipo B (SVG y PNG), lámina de construcción y filosofía "Franja Exacta".
- Textos en castellano rioplatense (voseo).
- Rubros del MVP: pádel, fútbol, tenis y barberías. Mercado inicial: Mendoza (Valle de Uco, San Rafael, Gran Mendoza).
- No inventar testimonios, cifras de clientes ni logos.
- A futuro habrá app y registro: no prometer en ningún texto "sin bajar una app" ni "sin crear cuenta".
- Un solo plan para todos y sin precio visible en la página: no poner montos de Bookea, planes, "gratis" ni "sin comisión".
- Bookea no se limita a canchas y barberías ni a Mendoza: los textos hablan de "negocios que trabajan con turnos". Los rubros y zonas del buscador y los negocios de ejemplo son solo la muestra actual.
- Panel del negocio en `admin.html`/`admin.css`/`admin.js`; se publica como `admin.html` junto a la landing. Cuenta de prueba: losalamos / bookea2026. Datos en localStorage (`bookea:panel:v1`).
- Panel: la sesión vive solo en memoria. Cada carga o refresco de admin.html vuelve a pedir usuario y contraseña (pedido del dueño).
