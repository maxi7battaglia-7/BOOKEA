# Bookea

Turnos online con seña para canchas de pádel, fútbol y tenis y para barberías. Arranca en Mendoza.

## Qué hay hoy
- **Frente** (`index.html`, `sitio.css`, `sitio.js`): una sola página, sin frameworks, que está publicada en https://bookea.ar. Incluye:
  - el buscador (rubro con foto, dónde, cuándo y hora), "Libres ahora" y los lugares de cada rubro
  - resultados con filtros, la ficha de cada lugar (fotos, cupos de la semana, horarios, precios) y la reserva
  - pago de la seña al reservar (sin carrito: el turno queda guardado 10 minutos), pago simulado y "Mis turnos" (con cancelar), guardados en el navegador de quien reserva
  - la parte para negocios: cómo funciona, funciones, "Sumá tu negocio" (primer paso del registro del panel) y preguntas
  - letras Inter Tight y JetBrains Mono servidas desde `assets/fuentes/` (licencia OFL), colores de Bookea
- **reservar.html**: solo redirige al inicio, para que los links viejos (`reservar.html?rubro=padel…`) sigan andando.
- **Panel del negocio** (`admin.html`, `styles.css`, `admin.css`, `admin.js`, `toque.js`): email y contraseña, agenda por día y por semana, finanzas, clientes, datos del negocio y cuenta. Con `config.js` vacío funciona en modo de prueba (todo en el navegador; para probar: `demo@example.com` / `bookea2026`). Con Supabase conectado (`nube.js`, `supabase/esquema.sql`), cada cuenta queda atada a su negocio y los datos viven en la base: ver `supabase/LEEME.md`.
- **Marca** (`marca/`): isotipo B en SVG y PNG, lámina de construcción y filosofía "Franja Exacta".
- **Dirección de diseño** (`DESIGN.md`): referencias, sistema aplicado y decisiones.

## Ver el sitio
Abrí `index.html` en el navegador, o entrá a https://bookea.ar.

Para generar la vista previa con el CSS y el JS adentro, lista para publicar en claude.ai:

```bash
python3 scripts/preview.py   # crea dist/bookea.html, dist/reservar.html y dist/admin.html
```

Para una copia que se usa sin internet: `python3 scripts/sin-internet.py` (crea `dist/bookea-sin-internet.zip`).

## Pendiente
- Las reservas usan datos de ejemplo y un pago simulado: falta el servidor, la base de negocios y Mercado Pago.
- El panel guarda cuentas y datos en Supabase (`config.js` ya apunta al proyecto). Falta conectar la página de reservas a la misma base.
- Los negocios de ejemplo y `bookea.ar/losalamos` son provisorios. `hola@bookea.ar` recibe solo cuando esté el reenvío de Cloudflare (Email Routing).

## Créditos
Las fotos son de Wikimedia Commons. El detalle de cada una está en `assets/credits.json` y en el pie de la página.
