# Bookea

Turnos online con seña para canchas de pádel, fútbol y tenis y para barberías. Arranca en Mendoza.

## Qué hay hoy
- **Landing** (`index.html`, `styles.css`, `script.js`): HTML, CSS y JS sin frameworks. Incluye:
  - pantalla de carga con el logo
  - mosaico de fotos
  - buscador de turnos para el cliente
  - la parte para negocios: cómo funciona, funciones, formulario para sumarse y preguntas frecuentes
- **Reservas** (`reservar.html`, `app.css`, `reservar.js`): turnos libres de cada lugar y reserva en cuatro pasos. Por ahora los negocios son de ejemplo y el pago de la seña es simulado.
- **Panel del negocio** (`admin.html`, `admin.css`, `admin.js`): email y contraseña, agenda por día y por semana, finanzas, clientes, datos del negocio y cuenta. Con `config.js` vacío funciona en modo de prueba (todo en el navegador; para probar: `demo@example.com` / `bookea2026`). Con Supabase conectado (`nube.js`, `supabase/esquema.sql`), cada cuenta queda atada a su negocio y los datos viven en la base: ver `supabase/LEEME.md`.
- **Marca** (`marca/`): isotipo B en SVG y PNG, lámina de construcción y filosofía "Franja Exacta".
- **Dirección de diseño** (`DESIGN.md`): referencias, sistema aplicado y decisiones.

## Ver la landing
Abrí `index.html` en el navegador.

Para generar las dos páginas con el CSS y el JS adentro, listas para publicar en claude.ai:

```bash
python3 scripts/preview.py   # crea dist/bookea.html, dist/reservar.html y dist/admin.html
```

## Pendiente
- El formulario para negocios todavía no envía datos.
- Las reservas usan datos de ejemplo y un pago simulado: falta el servidor, la base de negocios y Mercado Pago.
- El panel ya puede guardar cuentas y datos en Supabase (falta crear el proyecto y completar `config.js`). Falta conectar la página de reservas a la misma base.
- Los negocios de ejemplo, `hola@bookea.ar` y `bookea.ar/losalamos` son provisorios.

## Créditos
Las fotos son de Wikimedia Commons. El detalle de cada una está en `assets/credits.json` y en el pie de la página.
