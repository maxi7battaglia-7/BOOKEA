# Prueba de punta a punta del modo "nube"

Prueba el panel real (`admin.html`) contra un Postgres local con `supabase/esquema.sql`, sin Supabase:

- `puente.js` sirve la carpeta de Bookea y responde como un Supabase de juguete. Cada consulta corre con el
  rol `authenticated` y el id de la cuenta, así las reglas de permisos (RLS) se aplican de verdad. También
  contesta como la API de Supabase lo que la página pide directo sin cuenta (`/rest/v1/rpc/lugares_publicos` y
  `horarios_ocupados`, con el rol `anon`), como GitHub Pages muestra `404.html` en una dirección que no existe, y un
  Storage de juguete para las fotos de "Tu página" (las sube como la cuenta, así se aplican los permisos del bucket, y
  las sirve en `/storage/v1/object/public/…`).
- `falso-supabase.js` reemplaza a supabase-js en el navegador con la misma forma que usa `nube.js`.
- `nube-e2e.js` (Playwright) crea cuentas (de negocios y de clientes del frente), carga turnos, prueba que una cuenta no vea ni toque el negocio de
  otra, el link repetido, el cambio y la recuperación de contraseña, y dos dispositivos reservando el mismo horario.
  Al final abre un negocio de verdad (`/nombre` es su página y `/nombre/reservar`, sus turnos), reserva un turno que
  entra en su agenda, prueba que si el negocio lo cancela se cancela también el del cliente, y que lo que la dueña
  carga en "Tu página" (portada, logo, historia, Instagram) se ve en su página.

- `mp-falso.js` (lo usa `puente.js`): un Mercado Pago de juguete (permiso con PKCE, cobros de la API de Orders, avisos
  firmados, devoluciones) y la función `supabase/functions/mp/index.ts` corriendo adentro, tal cual se publica, con
  Supabase Auth y la clave secreta simulados. Nada sale de la compu; las llaves son inventadas.
- `mp-e2e.js`: el cobro de la seña con Mercado Pago de punta a punta: conectar la cuenta, cobrar con la comisión, el
  aviso firmado (y uno mal firmado), pagos rechazados y tardíos, devoluciones (y sin saldo), renovar las llaves y
  reconectar; y en el navegador, la tarjeta de Mi negocio, la pestaña que vuelve de Mercado Pago, pagar desde la
  página, volver con el turno confirmado y "Pagar seña" desde Mis turnos.

Necesita Postgres (con `su postgres`), Node (22 o más nuevo, que lee TypeScript) y Playwright con Chromium:

    node supabase/pruebas/e2e/nube-e2e.js
    node supabase/pruebas/e2e/mp-e2e.js

Las capturas quedan en `supabase/pruebas/e2e/capturas/` (no se suben al repo).
