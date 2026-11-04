# Bookea

Turnos online con seña para canchas de pádel, fútbol y tenis y para barberías. Arranca en Mendoza.

## Qué hay hoy
- **Landing** (`index.html`, `styles.css`, `script.js`): HTML, CSS y JS sin frameworks. Incluye:
  - un mosaico de fotos arriba
  - una agenda de ejemplo que funciona (rubros, reservar un horario libre y la confirmación por WhatsApp)
  - un buscador de turnos
  - funciones, precios, un formulario para sumarse y preguntas frecuentes
- **Marca** (`marca/`): isotipo B en SVG y PNG, lámina de construcción y filosofía "Franja Exacta".
- **Dirección de diseño** (`DESIGN.md`): referencias, sistema aplicado y decisiones.

## Ver la landing
Abrí `index.html` en el navegador.

Para generar un solo archivo con el CSS y el JS adentro, listo para publicar como página de claude.ai:

```bash
python3 scripts/preview.py   # crea dist/bookea.html
```

## Pendiente
- El formulario todavía no envía datos.
- Los precios, los negocios de ejemplo, `hola@bookea.ar` y `bookea.ar/losalamos` son provisorios.

## Créditos
Las fotos son de Wikimedia Commons. El detalle de cada una está en `assets/credits.json` y en el pie de la página.
