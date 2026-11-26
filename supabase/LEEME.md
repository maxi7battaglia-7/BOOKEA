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

En los negocios que todavía no conectaron Mercado Pago la seña no se cobra, y los mails, la página y la agenda del
negocio lo aclaran ("Bookea está en prueba"). En los que lo conectaron se cobra de verdad: ver "Cobrar la seña con
Mercado Pago", abajo.

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
  seña con Mercado Pago con una cuenta de verdad (`en_la_lista()`; ver "Cobrar la seña con Mercado Pago").
- **Al reservar:** la base arma el turno con los datos del negocio (no con lo que manda la página): controla que la
  cancha exista, que el horario sea uno de los suyos y que esté libre, y calcula el precio y la seña. El turno entra
  en su agenda como "por el link", con el nombre y el celular del cliente. Si el negocio no cobra con Mercado Pago,
  en la agenda va sin seña (no se cobró) y con una nota que lo dice; si cobra, dice "Esperando la seña" hasta que se
  acredita el pago.
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

## La página de cada negocio y "Tu página" (21/11)

Cada negocio tiene dos direcciones: `bookea.ar/nombre` es su página (su portada, su historia, sus características y
servicios, sus fotos, dónde queda y sus redes, con un botón para reservar al final) y `bookea.ar/nombre/reservar`, sus
turnos para reservar. La arma solo el equipo de Bookea, como un servicio: en el panel, **Solicitudes → "Editar su página"**.

- **Base:** la columna `negocios.pagina` (frase, historia, redes, si muestra su WhatsApp, sus servicios y las
  direcciones de sus fotos). `lugares_publicos` la manda a la página, pero solo con fotos de su propia carpeta, su
  WhatsApp si lo eligió y sus servicios como claves cortas (`vest`, `est`…). Los servicios se suman el 25/11: hasta
  correr de nuevo `esquema.sql`, se guardan pero no se ven en la página.
- **Fotos:** Supabase Storage, bucket público `negocios`. Cada negocio sube a su carpeta (`negocios/<id del negocio>/`) y
  solo el equipo de Bookea (`puede_subir_foto`). `esquema.sql` crea el bucket y sus permisos.
- **La carga el equipo de Bookea (25/11):** en el panel, **Solicitudes → "Editar su página"** abre la página de cualquier
  negocio para cargarle fotos, frase, historia y servicios. Guarda con `guardar_pagina` (solo la página, nada más del
  negocio). El negocio no la puede cambiar: `pagina` no está entre las columnas que puede tocar. Hace falta correr de nuevo
  `esquema.sql`.
- **Las fotos de sus tres tarjetas (26/11):** en el mismo editor, "Fotos de las tarjetas" (el lugar, servicios, dónde estamos;
  hasta dos cada una) se guardan en `pagina.tarjetas`, y `lugar_publico` las devuelve solo si son de la carpeta del negocio
  (`fotos_publicas`). Hasta correr de nuevo `esquema.sql`, la página las reemplaza por las fotos del lugar.
- **Para que funcione en bookea.ar:** correr de nuevo `esquema.sql` y después `avisos-por-mail.sql` (en ese orden).

### Pasar el sitio a Cloudflare Pages (para que las direcciones queden limpias y Google las encuentre)

Hoy el sitio está en GitHub Pages: `bookea.ar/nombre` anda gracias a `404.html`, pero Google ve esa página como "no
encontrada" y no la muestra. En Cloudflare Pages, cualquier dirección abre `index.html` como una página normal. El dominio
ya está en Cloudflare, así que es gratis y son unos clics:

1. En Cloudflare: **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git** → GitHub → elegí el repo
   **BOOKEA** (si te pide permiso para ver tus repos, dáselo solo a ese).
2. Configuración: rama **main**, *Framework preset* **None**, *Build command* vacío, *Build output directory* `/`.
   **Save and Deploy**. Te da una dirección de prueba (`algo.pages.dev`): abrila y fijate que ande.
3. En ese proyecto: **Custom domains** → **Set up a custom domain** → `bookea.ar`. Cloudflare cambia solo el registro
   DNS que hoy apunta a GitHub. Hacé lo mismo con `www.bookea.ar` si lo usás.
4. Avisame: borro `404.html` del repo (sin ese archivo, Cloudflare abre `index.html` en cualquier dirección) y reviso
   bookea.ar/nombre en vivo.
5. Cuando todo ande, en GitHub: el repo → **Settings** → **Pages** → apagar GitHub Pages.

Nada cambia en Supabase: los links de los mails (`bookea.ar/admin.html`, `bookea.ar/?cuenta=…`) siguen andando.
Cloudflare abre `admin.html` también como `bookea.ar/admin`.

## Cobrar la seña con Mercado Pago (26/11)

Cada negocio conecta **su** cuenta de Mercado Pago desde el panel (Mi negocio → "Cobrar la seña con Mercado Pago") y la
seña de cada turno que le reservan en bookea.ar entra directo en esa cuenta. Mercado Pago le descuenta su costo y la
comisión de Bookea, que llega a la cuenta de Bookea (la de la aplicación BOOKEA). La comisión no se ve en la página.

Cómo anda:

1. **Conectar:** el dueño toca "Conectar Mercado Pago"; se abre Mercado Pago en otra pestaña, da el permiso y vuelve.
   La función `mp` (`functions/mp/index.ts`) guarda las llaves de su cuenta en **Vault**, cifradas (tabla
   `mp_cuentas`, que solo guarda dónde están). Con PKCE y un "estado" que sirve una vez: nadie puede colarle otra cuenta.
2. **Cobrar:** el cliente reserva y toca "Pagar seña": el turno queda **esperando el pago 20 minutos** (en su agenda
   dice "Esperando la seña") y la función arma el cobro en Mercado Pago (Checkout Pro, API de Orders) con la cuenta del
   negocio y la comisión de Bookea. El cliente paga en Mercado Pago y vuelve a bookea.ar.
3. **Confirmar:** Mercado Pago avisa (aviso firmado); la función le pregunta a Mercado Pago cómo salió (nunca le cree
   al navegador) y el turno queda **confirmado**: llegan los dos mails y la seña aparece en la agenda. Si nadie paga a
   tiempo, el horario se libera solo.
4. **Devolver:** si un turno pagado se cancela con tiempo (o lo cancela el negocio sin quedarse con la seña), la seña
   se devuelve sola por Mercado Pago, desde la cuenta del negocio. Si Mercado Pago no deja (por ejemplo, sin saldo), se
   vuelve a intentar; después de 48 intentos el panel le avisa al negocio que la devuelva él.
5. **Renovar:** las llaves duran 180 días; la función las renueva sola un mes antes. Si el dueño le quita el permiso a
   Bookea desde Mercado Pago, el panel le pide que la conecte de nuevo (mientras tanto, la seña no se cobra).

### Ponerlo en marcha (una vez, en este orden)

1. **Mercado Pago → Tus integraciones → BOOKEA:**
   - **Configuración avanzada → URL de redireccionamiento:** cambiala por
     `https://vpxzuutavdjwglglbvdt.supabase.co/functions/v1/mp/oauth` (PKCE: Sí). Tiene que ser exactamente esa.
   - **Webhooks → Configurar notificaciones:** en la URL (la de prueba y la de producción) poné
     `https://vpxzuutavdjwglglbvdt.supabase.co/functions/v1/mp/avisos` y marcá el evento **Order (Mercado Pago)**.
     Al guardar aparece la **clave secreta** de los avisos: la vas a pegar en Supabase en el paso 4.
   - **Credenciales de producción:** ahí están el **Client ID** (el número de la aplicación) y el **Client Secret**.
2. **Supabase → Database → Extensions:** activá **pg_cron** (pg_net ya está, por los mails). Con pg_cron, cada minuto
   se liberan los turnos que nadie pagó, cada 15 minutos se reintentan las devoluciones y una vez por día se renuevan
   las llaves.
3. **Supabase → SQL Editor:** pegá todo `esquema.sql` → **Run**; después todo `avisos-por-mail.sql` → **Run**.
4. **Supabase → Edge Functions → Secrets:** agregá tres secretos (los valores se pegan ahí, nunca en un chat ni en el
   repo): `MP_CLIENT_ID` (el Client ID), `MP_CLIENT_SECRET` (el Client Secret) y `MP_WEBHOOK_SECRET` (la clave secreta
   de los avisos). Si en Supabase apagaste las claves viejas (legacy), sumá `BOOKEA_SECRET_KEY` con tu Secret key.
5. **Supabase → Edge Functions → Deploy a new function → Via Editor:** nombre **`mp`**, borrá el ejemplo, pegá todo
   `functions/mp/index.ts` y tocá **Deploy**. Después, en la función → **Details** (o Settings): apagá **Verify JWT**
   ("Enforce JWT verification"): cada ruta controla quién la llama (la página, el panel, Mercado Pago o la base).
6. **La comisión de Bookea:** en `esquema.sql`, `bookea_comision_pct()` (hoy `0`). Cambiá el número (por ejemplo `8`
   para el 8 % de cada seña) y corré de nuevo `esquema.sql`. Vale para los cobros que se armen desde ese momento.

### Probarlo sin plata de verdad

En Mercado Pago → Tus integraciones → BOOKEA → **Cuentas de prueba**, creá dos: un **vendedor** y un **comprador**.

1. En una ventana de incógnito, entrá a mercadopago.com.ar con el **vendedor de prueba**. En otra pestaña de esa
   misma ventana, entrá al panel (bookea.ar/admin.html) con un negocio aprobado y tocá **Conectar Mercado Pago**: el
   permiso lo da el vendedor de prueba. Con una cuenta de prueba, el negocio no aparece en la lista (sí con su link).
2. En otra ventana de incógnito, en bookea.ar/su-link/reservar reservá con una cuenta de cliente y tocá **Pagar seña**.
   En Mercado Pago pagá con el **comprador de prueba** y una tarjeta de prueba (las de la documentación de Mercado
   Pago; el nombre del titular decide el resultado: `APRO` aprobada, `OTHE` rechazada).
3. Tiene que volver a bookea.ar con el turno **confirmado**, llegar los dos mails y verse la seña en la agenda del
   negocio. Cancelalo desde Mis turnos con tiempo: la seña tiene que volver a la cuenta del comprador de prueba.

Si algo falla: **Edge Functions → mp → Logs** dice qué contestó Mercado Pago (nunca muestra llaves). En la base,
`select * from mp_cobros order by creado desc` muestra cada cobro, su estado y si se devolvió.

## Que Supabase no pause el proyecto (25/11)

En el plan gratis, Supabase pausa un proyecto que pasa 7 días casi sin uso (avisa por mail antes). Pausado, bookea.ar
se sigue viendo pero no andan el panel, las cuentas, las reservas ni los mails; se reactiva desde supabase.com
(**Restore**) dentro de los 90 días, sin perder datos.

Para evitarlo mientras no haya complejos usándolo todos los días, `.github/workflows/mantener-supabase.yml` hace cada
3 días (8:23 de Argentina) la misma lectura que bookea.ar al abrirse (`lugares_publicos`, sin datos de nadie, con la
clave publishable de `config.js`).

- **Ver que anda:** en GitHub, el repo → **Actions** → "Mantener Supabase activo": cada corrida en verde es una lectura
  que funcionó. Si queda en rojo, fijate en supabase.com si el proyecto quedó pausado.
- **Correrlo a mano:** en esa misma pantalla, **Run workflow**.
- **Ojo:** GitHub apaga las tareas programadas de un repo que pasa 60 días sin cambios. Si pasa, en esa pantalla
  aparece un botón para volver a prenderla.

## Qué falta para la siguiente etapa

- **Mercado Pago en producción:** probarlo de punta a punta con las cuentas de prueba (arriba) y completar el
  formulario de homologación de la aplicación en Mercado Pago antes de cobrar a clientes reales.
- **Pasar los mails de Supabase (confirmar cuenta, contraseña nueva) al castellano** en Authentication → Emails → Templates.
- **Fotos**: hoy la foto de perfil se guarda chica dentro del negocio; más adelante conviene Supabase Storage.

## Probar sin Supabase

- `bash supabase/pruebas/correr.sh` (como un usuario que pueda crear bases en un Postgres local): prueba el
  esquema, la aprobación, las reglas de permisos con dos negocios y los avisos por mail (con Vault y pg_net
  simulados).
- `node supabase/pruebas/e2e/nube-e2e.js`: prueba el panel real y la cuenta de los clientes en el frente contra ese Postgres (ver `pruebas/e2e/LEEME.md`).
- `node supabase/pruebas/e2e/mp-e2e.js`: el cobro de la seña con Mercado Pago de punta a punta: la función `mp` tal
  cual se publica, contra ese Postgres y un Mercado Pago de juguete (conectar con PKCE, cobrar con la comisión, el
  aviso firmado, pagos rechazados y tardíos, devoluciones, renovar las llaves), y en el navegador el panel y la página.
