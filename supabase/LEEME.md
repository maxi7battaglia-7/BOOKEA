# Cuentas y datos de verdad: conectar Bookea con Supabase

Hoy el panel funciona en **modo de prueba**: las cuentas, el negocio y los turnos se guardan solo en el
navegador de quien lo usa. Para que cada dueño tenga su cuenta, entre desde cualquier celular o compu y vea
siempre su negocio, Bookea usa **Supabase** (una base de datos Postgres con cuentas de usuario incluidas).

## Cómo queda armado

- **Cuenta = email + contraseña.** Las guarda Supabase Auth: guarda solo un hash de la contraseña (bcrypt),
  nunca la contraseña. Si alguien se la olvida, le llega un mail con un link para elegir otra.
- **Cada cuenta queda atada a su negocio.** Al crear la cuenta, la base crea el negocio en el mismo paso y
  anota a esa cuenta como dueña (tabla `miembros`). No hay forma de quedar con una cuenta sin negocio ni de
  anotarse en el negocio de otro.
- **Nadie ve lo de otro negocio.** Las reglas de la base (Row Level Security) solo dejan leer y cambiar los
  datos de los negocios de los que la cuenta es miembro. Lo controla la base, no la página: aunque alguien
  toque el código desde el navegador, no recibe nada ajeno.
- **Vos aprobás quién entra.** Un negocio recién registrado queda **pendiente**: ve "Tu negocio está en
  revisión" y no puede usar el panel. El equipo de Bookea (tabla `admins_bookea`) lo aprueba o lo rechaza
  desde **Solicitudes de negocios** en el panel. La base lo hace cumplir: un negocio pendiente o rechazado no
  puede leer ni guardar turnos, y nadie puede aprobarse solo.
- **Aviso por mail cuando alguien se registra** (opcional, con Resend): `avisos-por-mail.sql`.
- **Un horario no se reserva dos veces.** Si dos dispositivos cargan el mismo turno a la vez, la base acepta
  uno y el otro ve el aviso "Ese horario ya lo ocupó otra reserva" con la agenda actualizada.
- **Equipo.** El dueño suma personas desde **Equipo** en el panel: le da un link (tabla `invitaciones`) y elige qué
  puede hacer cada una (`miembros.permisos`: ver la agenda, cargar turnos, Clientes, Finanzas, Mi negocio). La base hace
  cumplir que sin el permiso "turnos" no se cargan ni cambian turnos, que sin "negocio" no se cambia el negocio, y que solo
  el dueño invita, cambia permisos o saca gente.

Archivos: `esquema.sql` (tablas, reglas y alta automática), `../nube.js` (lo que habla con Supabase desde el
panel), `../config.js` (adónde conectarse) y `pruebas/` (pruebas del esquema y de punta a punta).

## Paso a paso

1. **Crear el proyecto.** Entrá a [supabase.com](https://supabase.com), creá una cuenta y un proyecto nuevo.
   Elegí la región más cercana (São Paulo, `sa-east-1`) y guardá la contraseña de la base en un lugar seguro.
2. **Crear las tablas.** En el proyecto: **SQL Editor → New query**, pegá todo `supabase/esquema.sql` y tocá
   **Run**. Se puede volver a correr sin romper nada.
3. **Contraseñas.** En **Authentication → Sign In / Providers → Email**:
   - dejá **Confirm email** prendido (así se verifica que el email es de quien crea la cuenta, y el link para
     recuperar la contraseña llega a la persona correcta);
   - poné **Minimum password length** en 8, igual que el panel.
4. **Adónde vuelven los links de los mails.** En **Authentication → URL Configuration**:
   - **Site URL**: la dirección del panel publicado, por ejemplo `https://tu-dominio.com/admin.html`;
   - **Redirect URLs**: agregá esa misma dirección.
5. **Mails.** El envío de mails que trae Supabase es para probar y tiene un límite bajo por hora. Antes de
   sumar negocios reales, configurá un servicio de mails propio en **Authentication → Emails → SMTP Settings**.
   Ahí también podés cambiar el texto de los mails ("Confirmá tu cuenta", "Elegí una contraseña nueva").
6. **Conectar el panel.** En **Project Settings → API Keys** copiá la **Publishable key** (`sb_publishable_…`;
   en proyectos viejos, la **anon public**) y en **Data API** la **Project URL**, y pegalas en `config.js`.
   Esa clave es pública a propósito (va en la página); la que **nunca** va en la página es la **Secret key**
   (o `service_role`).
7. **Publicar.** El panel tiene que estar en una dirección `https://` (por ejemplo GitHub Pages o Netlify).
   Abierto como archivo desde la compu no puede recibir los links de los mails.

8. **Hacerte del equipo de Bookea.** Registrate desde el panel con tu email y confirmalo. Después, en el
   **SQL Editor**, corré (con tu email):

       insert into public.admins_bookea (user_id) select id from auth.users where email = 'tu@email.com';

   Entrá al panel: vas a ver **Solicitudes de negocios** (abajo a la izquierda, o en **Cuenta** desde el
   celular). Aprobá tu propio negocio para poder usarlo.
9. **Aviso por mail cuando alguien se registra (opcional).** Creá una cuenta en [resend.com](https://resend.com)
   con tu email, generá una **API key** y guardala en Supabase (SQL Editor):

       select vault.create_secret('re_TU_API_KEY', 'resend_api_key');
       select vault.create_secret('tu@email.com', 'aviso_bookea_email');

   y corré todo `supabase/avisos-por-mail.sql`. Mientras no verifiques un dominio propio en Resend, el aviso
   solo puede llegarte a vos (al email de tu cuenta de Resend). Con dominio propio, sumá
   `select vault.create_secret('Bookea <avisos@tudominio.com>', 'resend_remitente');` y al aprobar un negocio
   también le llega un mail a su dueño.

## Mails de verdad, para abrirlo a negocios reales

Sin esto, Supabase solo manda mails (confirmar la cuenta, contraseña nueva) a los emails de tu equipo en Supabase y
muy pocos por hora: un negocio de afuera no puede registrarse. Hace falta un **dominio propio** y **Resend**.

1. **Dominio.** Comprá uno (por ejemplo `bookea.com.ar` en [nic.ar](https://nic.ar), con tu clave fiscal, o un `.com`).
   Los mails van a salir de ahí (`no-responder@tudominio`).
2. **Resend.** En [resend.com](https://resend.com) → **Domains → Add domain**, poné `tudominio` y elegí la región São Paulo
   (`sa-east-1`). Resend te muestra unos registros DNS (TXT y MX): cargalos en el lugar donde compraste el dominio
   (en nic.ar, en "Delegar" a un DNS como Cloudflare, que es gratis). Esperá a que diga **Verified**.
3. **Clave.** En Resend → **API Keys → Create API key**, con permiso **Sending access**. Copiala (empieza con `re_`).
   Es secreta: no va en la página ni en el repo.
4. **Supabase manda por Resend.** En **Authentication → Emails → SMTP Settings** prendé **Enable custom SMTP**:
   - Sender email: `no-responder@tudominio` · Sender name: `Bookea`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: la clave `re_…`
5. **Límite de mails.** En **Authentication → Rate Limits**, subí "emails por hora" (por ejemplo a 100).
6. **Mails en castellano.** En **Authentication → Emails → Templates**:
   - **Confirm signup**: asunto `Confirmá tu email en Bookea`, cuerpo: todo `mails/confirmar-cuenta.html`.
   - **Reset password**: asunto `Elegí una contraseña nueva en Bookea`, cuerpo: todo `mails/contrasena-nueva.html`.
7. **Avisos (vos y los negocios).** En el **SQL Editor**, una vez:

       select vault.create_secret('re_TU_API_KEY', 'resend_api_key');
       select vault.create_secret('tu@email.com', 'aviso_bookea_email');
       select vault.create_secret('Bookea <no-responder@tudominio>', 'resend_remitente');

   y corré todo `avisos-por-mail.sql`. Desde ahí te llega un mail cuando alguien se registra, y al negocio cuando lo aprobás.
8. **Probar:** registrá una cuenta con un email que no sea del equipo (en una ventana de incógnito). Tiene que llegar
   "Confirmá tu email en Bookea" de `no-responder@tudominio`, y a vos el aviso de negocio nuevo.

Resend gratis alcanza para empezar (3.000 mails por mes, 100 por día).

**Si ya tenías corrido `esquema.sql`:** volvé a correrlo entero (se puede correr más de una vez). Agrega lo nuevo
(aprobación, equipo y permisos) sin borrar nada; los negocios que ya existían quedan pendientes hasta que los apruebes,
y cada dueño sigue siendo dueño de su negocio.

Para probar que quedó bien: creá una cuenta desde el panel, confirmá el mail, aprobala desde Solicitudes,
cargá un turno y abrí el panel desde otro dispositivo con la misma cuenta.

## Qué falta para la siguiente etapa

- **La página de reservas (`reservar.html`) todavía usa negocios de ejemplo.** El paso que sigue es que lea el
  negocio por su link (`slug`) y que el cliente reserve contra la base, con una función que controle que el
  horario esté libre y que no muestre datos de otros clientes.
- **Pasar los mails de Supabase (confirmar cuenta, contraseña nueva) al castellano** en Authentication → Emails → Templates.
- **Fotos**: hoy la foto de perfil se guarda chica dentro del negocio; más adelante conviene Supabase Storage.

## Probar sin Supabase

- `bash supabase/pruebas/correr.sh` (como un usuario que pueda crear bases en un Postgres local): prueba el
  esquema, la aprobación, las reglas de permisos con dos negocios y los avisos por mail (con Vault y pg_net
  simulados).
- `node supabase/pruebas/e2e/nube-e2e.js`: prueba el panel real contra ese Postgres (ver `pruebas/e2e/LEEME.md`).
