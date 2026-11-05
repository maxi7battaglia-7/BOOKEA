# Bookea

Turnos online con seña para canchas de pádel, fútbol y tenis y para barberías. Arranca en Mendoza.

## Qué hay hoy
- **Landing** (`index.html`, `styles.css`, `script.js`): HTML, CSS y JS sin frameworks. Incluye:
  - pantalla de carga con el logo
  - mosaico de fotos
  - buscador de turnos para el cliente
  - la parte para negocios: cómo funciona, funciones, formulario para sumarse y preguntas frecuentes
- **Reservas** (`reservar.html`, `app.css`, `reservar.js`): turnos libres de cada lugar y reserva en cuatro pasos. Por ahora los negocios son de ejemplo y el pago de la seña es simulado.
- **Panel del negocio** (`admin.html`, `admin.css`, `admin.js`): usuario y contraseña, agenda por día y por semana, finanzas, clientes, datos del negocio y cuenta. Para probar: usuario `losalamos`, contraseña `bookea2026`. Por ahora todo se guarda en el navegador (localStorage) y las contraseñas como hash SHA-256 con sal.
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
- El panel guarda cuentas y datos en el navegador. La versión real necesita servidor: cuentas, sesiones y contraseñas del lado del servidor, y la agenda compartida con la página de reservas.
- Los negocios de ejemplo, `hola@bookea.ar` y `bookea.ar/losalamos` son provisorios.

## Créditos
Las fotos son de Wikimedia Commons. El detalle de cada una está en `assets/credits.json` y en el pie de la página.
