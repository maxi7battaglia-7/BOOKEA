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
   `select vault.create_secret('Bookea <no-responder@bookea.ar>', 'resend_remitente');` y al aprobar o rechazar un negocio
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
       select vault.create_secret('Bookea <no-responder@bookea.ar>', 'resend_remitente');

   y corré todo `avisos-por-mail.sql`. Desde ahí te llega un mail cuando alguien se registra, y al negocio cuando lo aprobás o lo rechazás
   (o le quitás el acceso). Todos con la misma cara que los mails de `mails/`.
8. **Que `hola@bookea.ar` reciba.** Los mails de rechazo y el pie de la página dicen "escribinos a hola@bookea.ar".
   En Cloudflare: bookea.ar → **Email** → **Email Routing** → activalo (agrega solo los registros MX) →
   **Routing rules** → **Create address**: `hola` → reenviar a tu mail personal (te llega un mail para confirmarlo).
9. **Probar:** registrá una cuenta con un email que no sea del equipo (en una ventana de incógnito). Tiene que llegar
   "Confirmá tu email en Bookea" de `no-responder@tudominio`, y a vos el aviso de negocio nuevo.

Resend gratis alcanza para empezar (3.000 mails por mes, 100 por día).

**Si ya tenías corrido `esquema.sql`:** volvé a correrlo entero (se puede correr más de una vez). Agrega lo nuevo
(aprobación, equipo y permisos) sin borrar nada; los negocios que ya existían quedan pendientes hasta que los apruebes,
y cada dueño sigue siendo dueño de su negocio.

Para probar que quedó bien: creá una cuenta desde el panel, confirmá el mail, aprobala desde Solicitudes,
cargá un turno y abrí el panel desde otro dispositivo con la misma cuenta.

## Clientes que reservan en bookea.ar (cuentas para pagar la seña)

Desde el 19/11, para pagar la seña el cliente crea su cuenta (nombre, email, celular y contraseña) o entra con la suya.
Las cuentas son de Supabase Auth, igual que las de los negocios, y la base guarda sus datos (tabla `clientes`) y sus
turnos (tabla `turnos`). Cada cliente ve solo lo suyo. La página es `../cuenta.js`.

Para que funcione en bookea.ar, una vez:

1. **SQL Editor:** pegá todo `esquema.sql` y tocá **Run** (agrega `clientes` y `turnos` sin tocar lo que ya hay).
2. **SQL Editor:** pegá todo `avisos-por-mail.sql` y tocá **Run** (agrega los mails "Tu turno está confirmado" y
   "Cancelaste tu turno"). Necesita las claves en Vault (`resend_api_key`, `aviso_bookea_email` y `resend_remitente`,
   ver arriba): sin `resend_remitente` no se le manda nada a los clientes.
3. **Authentication → URL Configuration → Redirect URLs:** agregá `https://bookea.ar/**`. Así el link del mail de
   confirmación (y el de contraseña nueva) vuelve a la página de reservas, donde el cliente paga su turno. Si falta,
   el link cae en el panel, que lo reenvía a la página igual, pero es un paso de más.
4. **Authentication → Emails → Templates → Confirm signup:** pegá de nuevo todo `mails/confirmar-cuenta.html`
   (ahora tiene un texto para los clientes y otro para los negocios).
5. **Probar:** en una ventana de incógnito, en bookea.ar reservá un turno, creá una cuenta con un email tuyo,
   confirmala desde el mail y pagá (es simulado). Te tiene que llegar "Tu turno está confirmado" y verse en Mis turnos.

Mientras la seña no se cobre, los mails, la página y la agenda del negocio aclaran que no se cobró. Cuando se cobre
con Mercado Pago, cambiá `bookea_en_prueba()` (en `esquema.sql`) a `false` y volvé a correr los dos archivos.

**Datos personales (Ley 25.326):** antes de abrir el registro a clientes reales, inscribí la base en el Registro
Nacional de Bases de Datos (AAIP, por Trámites a Distancia, con tu clave fiscal) y completá en `../privacidad.html`
quién es el responsable, su domicilio y el número de inscripción.

## Negocios de verdad en bookea.ar (20/11)

La página muestra cada negocio aprobado con lo que cargó en **Mi negocio**: canchas, duración del turno, horarios
de cada día, precios por franja, seña, cancelación, dirección y foto de perfil. Los horarios libres son los de su
agenda: la base le pasa a la página solo qué horarios están ocupados (`lugares_publicos`, `horarios_ocupados`), sin
nombres, emails ni teléfonos.

- **Dónde aparece:** con su link, `bookea.ar/su-link` (el que ve en Mi negocio; `../404.html` lo lleva a
  `bookea.ar/?lugar=su-link`). En la lista de la página (inicio y resultados) aparece recién cuando pueda cobrar la
  seña con Mercado Pago: hasta entonces `tiene_mercado_pago()` dice que no para todos.
- **Al reservar:** la base arma el turno con los datos del negocio (no con lo que manda la página): controla que la
  cancha exista, que el horario sea uno de los suyos y que esté libre, y calcula el precio y la seña. El turno entra
  en su agenda como "por el link", con el nombre y el celular del cliente. Mientras Bookea esté en prueba, en la
  agenda va sin seña (no se cobró) y con una nota que lo dice.
- **Si el cliente cancela,** el horario se libera en la agenda. **Si el negocio lo cancela desde el panel** (o borra
  la fila), se cancela también el del cliente y le llega el mail.
- **Mails nuevos** (`avisos-por-mail.sql`): al negocio, "Tenés un turno nuevo" (con el cliente y su WhatsApp) y "Se
  canceló un turno"; al cliente, "El lugar canceló tu turno" cuando cancela el negocio.

Para que funcione en bookea.ar, una vez: **SQL Editor**, pegá todo `esquema.sql` → **Run**; después todo
`avisos-por-mail.sql` → **Run** (en ese orden).

Para probarlo: aprobá un negocio de prueba en **Solicitudes**, entrá con esa cuenta, completá Mi negocio (canchas,
horarios y precios) y abrí **Ver la página de reservas**. Reservá desde otra cuenta de cliente en una ventana de
incógnito: el turno tiene que aparecer en la agenda del negocio (se actualiza sola cada minuto) y llegar los dos mails.

Los links `admin`, `index`, `privacidad`, `reservar`, `assets` y `marca` son de páginas de Bookea: el panel no los
deja elegir.

## Qué falta para la siguiente etapa

- **Mercado Pago:** que cada negocio conecte su cuenta desde el panel, que la seña se cobre de verdad (y vaya a la
  cuenta del negocio), que el turno quede guardado 10 minutos en la base mientras se paga y que las devoluciones salgan
  solas. Con eso, `tiene_mercado_pago()` dice que sí y el negocio aparece en la lista.
- **Pasar los mails de Supabase (confirmar cuenta, contraseña nueva) al castellano** en Authentication → Emails → Templates.
- **Fotos**: hoy la foto de perfil se guarda chica dentro del negocio; más adelante conviene Supabase Storage.

## Probar sin Supabase

- `bash supabase/pruebas/correr.sh` (como un usuario que pueda crear bases en un Postgres local): prueba el
  esquema, la aprobación, las reglas de permisos con dos negocios y los avisos por mail (con Vault y pg_net
  simulados).
- `node supabase/pruebas/e2e/nube-e2e.js`: prueba el panel real y la cuenta de los clientes en el frente contra ese Postgres (ver `pruebas/e2e/LEEME.md`).
