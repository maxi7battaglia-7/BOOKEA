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
- **Un horario no se reserva dos veces.** Si dos dispositivos cargan el mismo turno a la vez, la base acepta
  uno y el otro ve el aviso "Ese horario ya lo ocupó otra reserva" con la agenda actualizada.
- **Encargados (más adelante).** La tabla `miembros` ya admite varias cuentas por negocio (rol `dueno` o
  `encargado`); falta la pantalla para invitarlas.

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

Para probar que quedó bien: creá una cuenta desde el panel, confirmá el mail, cargá un turno y abrí el panel
desde otro dispositivo con la misma cuenta.

## Qué falta para la siguiente etapa

- **La página de reservas (`reservar.html`) todavía usa negocios de ejemplo.** El paso que sigue es que lea el
  negocio por su link (`slug`) y que el cliente reserve contra la base, con una función que controle que el
  horario esté libre y que no muestre datos de otros clientes.
- **Invitar encargados** a un negocio (la base ya lo soporta).
- **Fotos**: hoy la foto de perfil se guarda chica dentro del negocio; más adelante conviene Supabase Storage.

## Probar sin Supabase

- `bash supabase/pruebas/correr.sh` (como un usuario que pueda crear bases en un Postgres local): prueba el
  esquema y las reglas de permisos con dos negocios.
- `node supabase/pruebas/e2e/nube-e2e.js`: prueba el panel real contra ese Postgres (ver `pruebas/e2e/LEEME.md`).
