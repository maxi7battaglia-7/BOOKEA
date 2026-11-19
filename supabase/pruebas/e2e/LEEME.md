# Prueba de punta a punta del modo "nube"

Prueba el panel real (`admin.html`) contra un Postgres local con `supabase/esquema.sql`, sin Supabase:

- `puente.js` sirve la carpeta de Bookea y responde como un Supabase de juguete. Cada consulta corre con el
  rol `authenticated` y el id de la cuenta, así las reglas de permisos (RLS) se aplican de verdad.
- `falso-supabase.js` reemplaza a supabase-js en el navegador con la misma forma que usa `nube.js`.
- `nube-e2e.js` (Playwright) crea cuentas (de negocios y de clientes del frente), carga turnos, prueba que una cuenta no vea ni toque el negocio de
  otra, el link repetido, el cambio y la recuperación de contraseña, y dos dispositivos reservando el mismo horario.

Necesita Postgres (con `su postgres`), Node y Playwright con Chromium:

    node supabase/pruebas/e2e/nube-e2e.js

Las capturas quedan en `supabase/pruebas/e2e/capturas/` (no se suben al repo).
