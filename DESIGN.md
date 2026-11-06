# Dirección de diseño de Bookea

Referencias elegidas por el dueño del producto (3/11/2026): **Stripe** (stripe.com/es), **Figma** (figma.com/es-la) y **Trello** (trello.com/es/home).
Así se tiene que terminar viendo Bookea cuando apliquemos las skills de diseño (`design-taste-frontend`, `ui-ux-pro-max`, `anti-ui-slop`). Toda sesión que toque la interfaz lee este archivo primero.

**Pedido textual:** "una página con ese toque de seriedad, pero además con los colores que la mantienen viva".

**Regla de oro:** tomamos el *nivel de calidad y el lenguaje visual*, nunca la marca. Nada de sus logos, ilustraciones, el degradado de Stripe, sus fuentes propietarias (Söhne, figmaSans, Charlie) ni sus colores exactos.

## Colores fijos (no se cambian): camiseta del Venezia
| Token | Valor | Rol |
|---|---|---|
| Noche | `#11151c` | tinta, texto principal, botón principal, bloques oscuros |
| Naranja | `#e4572e` | acento principal, energía, CTA destacado |
| Verde agua | `#1fa08c` | acento secundario, estados "confirmado / disponible" |
| Crema | `#f5ecd7` | superficies cálidas, bloques de respiro |

El motivo propio de la marca es la **franja diagonal naranja + verde** del pecho de la camiseta. Se usa poco y con intención.

## Qué tomamos de cada referencia

### Stripe: la seriedad
- Fondo claro con **mucho aire** y líneas guía verticales muy tenues, como una grilla de plano.
- **Títulos grandes y livianos** (peso bajo, interletrado negativo), en **dos tonos**: la primera frase en tinta y la continuación en gris.
- **Franja de cifras**: números grandes y livianos con una leyenda corta en gris, separados por líneas finas.
- Tarjetas **bento** de distintos tamaños, con borde finísimo y sin sombras pesadas.
- **Mockups de producto reales** (la UI misma) en lugar de ilustraciones.
- Botones de esquinas chicas. El secundario es blanco con borde fino.
- Preguntas en filas desplegables con un "+" a la derecha.

### Figma: la vida
- Base neutra (blanco y tinta) y el color en **bloques vivos y saturados** que contrastan con esa base. En Bookea esos bloques son el naranja, el verde agua y la crema.
- **Botón principal en tinta** con esquinas de 8px.
- **Rótulos técnicos en mono**: chicos, en gris y como etiqueta de cada sección.
- **Cifra enorme + línea fina + leyenda chica** como dato de confianza.
- Paneles flotantes sobre la UI con sombra suave.

### Trello: lo cercano
- Copy directo, imperativo y cercano. Bookea lo escribe en voseo.
- Los **mockups de agenda y tablero** muestran el producto funcionando: tarjetas blancas sobre carriles de color.
- Tarjetas enteras clicables y un "Ver todos" al pie de cada grupo.
- Testimonios con la **cifra antes de la cita**, cuando existan. **No inventar testimonios ni cifras.**

## Traducción a Bookea
| Parte | Referencia | Cómo se ve |
|---|---|---|
| Base | Stripe | Fondo claro, mucho aire, bordes de 1px en lugar de sombras |
| Títulos | Stripe + Figma | Grandes y livianos, dos tonos (tinta + gris) |
| Rótulos | Figma | Mono, chicos, gris |
| Color | Figma | Bloques vivos de naranja, verde agua y crema sobre base neutra |
| Producto | Stripe + Trello | Agenda real de canchas y barberos, reserva en el celular, notificaciones |
| Botones | Figma + Stripe | Principal en tinta (o naranja en el CTA clave), secundario blanco con borde |
| Copy | Trello | Voseo, frases cortas, sin humo |

## Qué evitar
- Emojis como íconos de sección.
- Sombras fuertes en todo y el mismo radio en todo.
- Títulos en negrita muy pesada en todas partes.
- Cifras, testimonios o logos de clientes inventados.

## Sistema aplicado (3/11/2026), con `design-taste-frontend`
Dirección **"El producto actúa"** (`product-performs`, semilla 1810978483), con la paleta y la tipografía de la marca fijas. Las notas están en `.taste-skill/notas.md`.

- **Idea:** la agenda de una noche en un club de pádel de Mendoza es la pieza de producto que funciona en el hero, sobre un escenario naranja con la esquina cortada en diagonal, como la franja de la camiseta.
- **Lo vivo:**
  - En la agenda se cambia de rubro (pádel, fútbol 5, tenis, barbería con la siesta) y al tocar un horario libre aparece la reserva con seña y el WhatsApp de confirmación.
  - Un buscador entiende frases como "pádel el jueves a las 21".
- **Tipografía:** Bricolage Grotesque 500 para títulos y DM Sans para el texto, con cinco medidas (88, 36, 22, 17 y 15 px). En el celular se usa una sola escala (11vw, 24, 19, 16 y 15).
- **Color por bloques:**
  - Base blanca.
  - Escenario y sección para sumarse en naranja.
  - Buscador en verde agua.
  - Mendoza con fondo noche y carta crema.
  - Preguntas abiertas en naranja.
  - El texto sobre naranja y verde agua va en tinta noche, por contraste.
- **Forma:** un solo radio de 6px. Botón principal en tinta y el de precios en naranja. Sin sombras ni degradés, salvo dentro de las piezas de interfaz (`data-ui`).
- **Decidido contra la referencia:** no se usan rótulos en mono, títulos en dos tonos, líneas finas ni emojis. Son "tells" de página generada según la skill, así que la seriedad sale de la escala, el aire y las piezas de producto reales.
- **Fotos reales** de Wikimedia Commons, con créditos en el pie:
  - una cancha de pádel
  - una cancha de tenis de polvo de ladrillo
  - un sillón de barbero de un catálogo de 1903
  - el Valle de Uco
  - una acequia de Godoy Cruz
- **Excepción documentada:** el inspector marca crema + naranja como "paleta de asistente". Se mantiene porque son colores fijos de la marca.

## Revisión con `ui-ux-pro-max` y `anti-ui-slop` (3/11/2026)
- **Accesibilidad:**
  - Las pestañas de rubro y de planes siguen el patrón ARIA: flechas, Inicio y Fin, y una sola en el orden de tabulación.
  - Cuando cambia la agenda, se avisa con `role="status"` y un mensaje con contexto.
  - La confirmación de WhatsApp y el buscador también usan `role="status"`. El buscador espera 350 ms.
- **Formulario:**
  - Cada campo tiene su error debajo, conectado con `aria-describedby`.
  - Al fallar, el foco va al primer campo con problema y los errores se corrigen mientras escribís.
  - El WhatsApp pide al menos 8 dígitos y al enviar aparece "Enviando…".
- **Táctil:** en el celular, todo control mide 44px o más. En escritorio, los links del menú tienen 24px de área. No queda texto de menos de 13px.
- **Imágenes:**
  - Valle de Uco y acequia en WebP.
  - Miniaturas de la frase de apertura de 240px en lugar de 1600px.
- **Hero entre 1081 y 1400px:** la tarjeta de WhatsApp pasa a la columna del texto. Antes, flotando sobre la agenda, tapaba un horario libre.
- **Pendiente:** el formulario todavía no envía datos a ningún lado.

## Logo (4/11/2026), con `canvas-design`
Filosofía **"Franja Exacta"** en `marca/filosofia.md`. Lámina de construcción en `marca/lamina.png` y `marca/lamina.pdf`, generada con `python3 marca/generar_lamina.py`.

- **Isotipo:** una B geométrica dibujada con regla y compás, sin tipografía.
  - Asta de 136 unidades y trazo horizontal de 104, en un lienzo de 1000.
  - Panza superior de radio 175 y panza inferior de 197, con los huecos concéntricos (radios 71 y 93), así el trazo es parejo en las curvas.
  - Los huecos tienen el extremo izquierdo recto contra el asta, como dos lugares reservados.
- **Color:** asta crema. Las panzas van divididas por una diagonal de 10°, verde agua arriba y naranja abajo, como la franja del pecho de la camiseta. Los huecos dejan ver el fondo noche.
- **Baldosa:** noche con radio de 200 sobre 1000.
- **Variantes:**
  - `isotipo.svg`: principal, sobre noche.
  - `isotipo-crema.svg`: sobre crema, con el asta en noche.
  - `isotipo-sin-fondo.svg`: para fondos claros.
  - `isotipo-mono-noche.svg` y `isotipo-mono-crema.svg`: a una sola tinta.
  - PNG de 512, 192, 64 y 32 px.
- **Logotipo:** isotipo + "Bookea" en Bricolage Grotesque Bold, la misma familia de la web.
- **En la landing:** el isotipo va en el menú y como ícono de la pestaña (`marca/isotipo.svg` y `marca/isotipo-32.png`).

## Pantalla de carga (4/11/2026)
- **Animación:**
  - Al abrir la página aparece el isotipo sobre fondo noche y se arma según su construcción. Primero crece el asta crema. Después baja el verde agua y sube el naranja hasta la diagonal de 10°. Al final aparece "Bookea".
  - La pantalla se ve al menos 1,5 s y después sube como una persiana. Recién ahí arrancan el mosaico y el hero.
- **Casos especiales:**
  - Con "reducir movimiento", el logo aparece quieto y se desvanece a los 0,6 s.
  - Sin JavaScript no se muestra.
  - Tiene un tope de 4 s por si la carga se demora.
- **Entrada del primer pantallazo:** empieza mientras sube la persiana.
  1. Los bloques del mosaico se destapan de izquierda a derecha.
  2. Baja el menú.
  3. El título sube palabra por palabra desde una ranura.
  4. Entran el texto, el botón y la pista.
  5. Se abre el escenario de la agenda.

  En unos 2 s queda todo quieto.
- **Al cargar o recargar, la página siempre arranca arriba de todo:** no recuerda el scroll y limpia el ancla de la URL. Los links del menú siguen llevando a cada sección.
- **Excepción documentada:** el inspector de `design-taste-frontend` marca `late-title` (el título no se lee a 1,2 s) y `covered-text` (el "Bookea" de la pantalla mientras sube). Son efecto directo de la pantalla de carga, pedida por el dueño. Sin ella, la página da 0 fallas.

## La landing le habla primero al cliente (4/11/2026)
Pedido del dueño: "lo más importante es que el cliente pueda sacar el turno".

- **Hero:** la demo de la agenda se reemplazó por un **buscador de turnos** sobre el escenario naranja.
  - Campos: qué (pádel, fútbol 5, tenis o barbería), dónde (localidades de Mendoza agrupadas por zona), cuándo (hoy y los 6 días siguientes) y la franja horaria.
  - En computadora va a la altura del título. En celular va justo después del título. El botón "Buscar turnos" entra en el primer pantallazo de 1440×900, 1280×800, 1024×768 y 390×844.
- **"Buscar turnos" lleva a `reservar.html`**, la parte de la app con los turnos libres de cada lugar sumado a Bookea.
  - Primero aparecen los lugares de la localidad elegida, después "También en (zona)" y después otras zonas.
  - Cada lugar muestra su información, el precio y la seña, y los horarios libres con cuántas canchas o barberos quedan.
  - Reserva en un panel de cuatro pasos:
    1. cancha o barbero (y el servicio, en barberías)
    2. nombre y WhatsApp, con errores junto a cada campo
    3. seña
    4. confirmación
  - En celular el panel sube desde abajo.
  - **Todo es de ejemplo:** 16 negocios con nombres inventados, disponibilidad simulada y el pago de la seña simulado. La página lo avisa.
- **Para negocios:** lo de abajo de la landing (cómo funciona, funciones, Mendoza, precios, sumate y preguntas) sigue igual. Se sacó la sección del buscador de texto, que repetía el buscador nuevo. En el menú quedaron "Reservar turno" y "Para negocios".
- **Llegada:** al recargar, la página arranca arriba. Si llegás con un link a una sección (por ejemplo, desde `reservar.html` a `#sumate`), te lleva ahí cuando termina la pantalla de carga.

## Hero "Bienvenidos a Bookea" (4/11/2026)
- **Título:** "Bienvenidos a Bookea", en lugar de "Turnos con seña, sin vueltas". Debajo va una frase corta para el cliente.
- **Cuatro preguntas como links**, cada una con su respuesta en una línea y una flecha:
  - ¿Quiénes somos? → la carta de Mendoza (`#nosotros`)
  - ¿Qué hacemos? → cómo funciona
  - ¿Para qué sirve? → funciones
  - Laburá con nosotros → el formulario para sumar el negocio (`#sumate`)
- **Composición:** título y preguntas ocupan la mitad izquierda; el buscador, la derecha, a 24px. Antes había un vacío grande en el medio.
- **Tablet y celular** (hasta 900px): una columna con título, buscador y preguntas. Hasta 960px el menú muestra solo el logo y "Sumá tu negocio".
- **Entrada:** las preguntas entran una tras otra, después del título.

## Tipografía: Archivo (4/11/2026). **Reemplaza a Bricolage Grotesque y DM Sans en todo el proyecto.**
El dueño pidió cambiarla por completo.
- **Archivo** es una grotesca de raíz deportiva (la de los números de camiseta y la cartelería), firme y seria. Se usa una sola familia con eje de ancho:
  - **Títulos:** ancho 112 % y peso 600, interletrado −0,03em. En celular, con el ancho normal y un punto más chicos, para que ningún título pase de dos líneas.
  - **Texto:** ancho normal, peso 400 o 500.
- **Dónde se aplica:** la landing, la página de reservas, el nombre en el menú y en la pantalla de carga, y la lámina de marca. La lámina usa `marca/fuentes/Archivo-Variable.ttf`, con licencia OFL al lado.
- **Ajuste por el ancho de la letra:** en "Sumá tu negocio al piloto." el título pasó a todo el ancho, con la lista y el formulario debajo.

## Refrescar siempre arriba (4/11/2026)
- **Al cargar o refrescar, la página arranca arriba de todo, aunque la dirección tenga un ancla** (`#precios`). En la vista previa de claude.ai, el refresco abre la página de cero con el ancla del último link tocado, y antes eso la bajaba a esa sección.
- **Única excepción:** "Sumá tu negocio" en `reservar.html` deja anotada la sección en `sessionStorage` y la landing va ahí.

## Banda de vidrio (pedido del dueño)
- El mosaico y el menú ya no llevan bloques de color: los cuatro bloques que eran naranja, noche, crema y verde (`.m-va`…`.m-vd`) son **vidrio esmerilado**, la foto de al lado desenfocada con un velo claro y un canto de luz.
- La barra del menú es vidrio (`backdrop-filter`); los links y "Sumá tu negocio" son vidrio transparente.
- **Al pasar el cursor todo se pone verde agua (#1fa08c):** los links y el botón con texto noche (contraste AA), los vidrios con un teñido verde y las fotos viradas a verde (`mix-blend-mode: color`).
- El color vivo queda para el contenido (hero naranja, buscador, etc.). La banda es neutra.
- Al terminar la entrada, la clase `nav-lista` quita la demora escalonada para que el hover responda al instante.

## Sin sección "Hecho en Mendoza" (pedido del dueño)
- Se borró la sección #nosotros (foto del Valle de Uco, carta y foto de la acequia) y sus dos fotos.
- "¿Quiénes somos?" del hero ahora lleva a Preguntas frecuentes y abre la primera respuesta, "¿Quiénes son?".
- Funciones ya no tiene padding abajo: Precios trae su propio aire y así no queda un hueco doble.

## Así funciona en tres bloques (pedido del dueño)
- Cada paso es un bloque gris propio con un número en círculo (1 verde agua, 2 noche, 3 naranja), un título y una explicación corta, y la pantalla de ejemplo (ver "Así funciona en cuadros").
- Debajo de "Así funciona" va una línea que dice para quién es.
- En tablet y celular, cada bloque apila la explicación arriba y la pantalla abajo.

## Sin precios ni planes (pedido del dueño)
- Se borró la sección Precios (Piloto, Esencial y Completo), su link en el menú y en el pie, y el código de las pestañas.
- Va a haber un solo plan para todos y el precio no se muestra en la página. No volver a poner montos de Bookea, "gratis", "piloto" ni "sin comisión".

## La B del título (pedido del dueño)
- En "Bienvenidos a Bookea", la B de Bookea es la B del isotipo sin el fondo noche: panzas verde agua y naranja, y el palo en noche, porque el crema se pierde sobre blanco.
- Mide 0,69em de alto (el alto de las mayúsculas de Archivo) y se apoya en la línea de base. Lectores de pantalla: el h1 lleva aria-label con el texto completo.

## Funciones ordenadas (pedido del dueño)
- Las seis tarjetas de "Lo que hace por vos" tienen el mismo armado: título y texto arriba, y el ejemplo de pantalla entero abajo, sin pegarse a los bordes. Se sacó la alternancia cell--rev.
- Tienen el mismo alto por fila y llevan una línea de bajada junto al título de la sección.

## Pie nuevo (pedido del dueño: "super desprolijo")
- Se sacaron las fichas grises, el reloj de Mendoza, el "Bookea" gigante y el bloque naranja.
- Ahora es una franja noche con los mismos márgenes que el resto: logo y frase a la izquierda; columnas Bookea, Negocios y Contacto (mail y "Copiar mail"); línea final con © y "Créditos de las fotos" plegados.
- Al pasar el cursor, los links se ponen verde agua y el botón se rellena de verde, igual que el menú.

## Barrido verde al pasar el cursor (pedido del dueño)
- Todo lo de arriba usa la misma animación que el logo: el verde agua barre de izquierda a derecha con clip-path.
- Aplica solo a la barra de arriba: el logo, los links del menú y "Sumá tu negocio" (380 ms). Al sacar el cursor, se retira hacia la izquierda.
- Los bloques del mosaico no barren: conservan su teñido verde con fundido, como pidió el dueño.
- Con "reducir movimiento", el verde aparece sin barrido.

## Frase "Cada turno vacío…" con foto (pedido del dueño)
- Franja a todo el ancho con una cancha de pádel vacía de fondo (Commons, Diegodlh, CC BY 4.0), en blanco y negro con velo noche al 62 %.
- La frase va centrada en crema, en computadora y en celular (en celular a 9vw, en 3 líneas).

## Así funciona en cuadros (pedido del dueño)
- Los tres pasos son cuadros lado a lado en crema (#f5ecd7), suave pero distinto del gris de Funciones. Dentro de cada cuadro: número, título y explicación, y el ejemplo de pantalla debajo.
- El resultado del paso 3 se apila y se compacta. En tablet y celular los cuadros van uno debajo del otro.
- La sección baja 80–128 px después de la foto (72 px en celular), porque arrancaba pegada.

## Sin límite de rubro ni de lugar (pedido del dueño)
- Los textos ya no dicen "canchas y barberías de Mendoza". Hablan de negocios que trabajan con turnos y reservas.
- El buscador conserva sus rubros y zonas de ejemplo, pero la opción general dice "Todas las zonas".
- Pie: "Turnos online con seña para cualquier negocio que trabaje con reservas." y "© Bookea", sin "Mendoza, Argentina".

## Panel del negocio (admin.html) — rediseño completo (6/11/2026, pedido del dueño)
Hecho con tres skills: **design-taste-frontend** (capítulo de pantallas de app, estilo "accent-ladder", semilla 930136599,
con la paleta y la letra de la marca; hoja en `.taste-skill/app/direction.json`), **anti-ui-slop** (paneles: tarea primero,
estados, verificación) y **ui-ux-pro-max** (sus guías de UX: feedback al tocar, movimiento reducido, 1 o 2 animaciones clave
por vista, vacíos con acción). La propuesta de estilo de ui-ux-pro-max (vidrio oscuro con Fira) se descartó: no es la marca.
Pedido: "serio, profesional, pero con su toque divertido", todo relacionado con el sitio, animaciones en algunos botones y
textos que se entiendan en cada cuadro.

- **Color (la escalera del verde agua):** fondo #f4f7f6 (un paso hacia el verde agua), cajas blancas con borde #e1e8e6, sin sombra.
  El verde agua lleno solo en marcas chicas (barras del gráfico, ícono del menú activo, puntos de estado, "Ahora", celda llena de
  la semana). Sus tintes pálidos (#eef7f5, #dcf0eb, #b5e0d6) hacen el área: fila activa del menú, huecos libres, turnos con seña,
  calor de la semana. Naranja solo para alertas (no vino, cancelar, baja). Noche: texto, botón principal y píldoras de cancha.
  Crema: el palo de la B y la etiqueta "Fijo". **Nada de beige en líneas ni rayas de color al costado de los turnos.**
- **Costado:** sobre el fondo, sin color. Logo con el barrido del sitio, la tarjeta del negocio (iniciales en verde agua,
  rubro · ciudad), el menú con íconos de línea propios (16-22px) y el barrido verde pálido al pasar el cursor, abajo "Ver tu
  página de reservas" y la cuenta con "Salir". En celular y tablet (≤900px): barra arriba (logo + negocio + Salir) y el mismo
  menú como barra de 5 botones abajo (Agenda, Finanzas, Clientes, Negocio, Cuenta).
- **Cada pantalla:** un h1 (30px) y una frase debajo armada con los datos (Agenda: "El próximo turno es a las 13:30: Lu P. en
  Cancha 2. Te quedan 15 horarios libres hoy."). Las cifras van en **un solo contenedor dividido**, cada celda con rótulo,
  valor y una frase que dice contra qué o por qué ("Ocupaste el 33 % de los horarios", "El resto de cada turno, que se paga
  en el lugar"). En Finanzas "Cobrado" es la cifra más grande y su cambio dice contra qué días (naranja si baja, verde si sube).
- **Agenda: solo la agenda** (pedido del dueño, 6/11): sin cifras, sin estadísticas y sin plata; eso vive en Finanzas.
  Grilla por cancha y horario + riel a la derecha (336px) con **Para cerrar** (turnos que ya terminaron sin marcar,
  con "Pagó" y "No vino" a un toque) y **Próximos turnos**. En pantallas angostas "Para cerrar" sube arriba de la grilla.
  Estados: con seña = verde agua pálido; sin seña = blanco con borde gris; pagado = gris; no vino = naranja pálido;
  bloqueado = noche; libre = verde agua más pálido con "+ Libre"; ya pasó sin turno = "Finalizado", solo texto. Cada uno con su punto y su palabra.
- **Ajustes (Mi negocio y Cuenta):** dos columnas, a la izquierda el título y para qué sirve, a la derecha el panel blanco.
  "Copiar" al lado del link de reservas. Barra de guardar fija abajo.
- **Movimiento (solo como respuesta, nunca entradas de pantalla):** barrido verde del sitio en el botón principal y el menú;
  el "+" gira; la pastilla oscura de Día/Semana y de los períodos se desliza; las flechas de fecha empujan; el punto de "Ahora"
  late; el turno recién cambiado hace "pop"; el aviso trae una tilde que se dibuja; "Guardado" y "Copiado" con tilde.
  Todo se apaga con "reducir movimiento".
- **Chequeo:** el inspector de la skill (`node <skill>/scripts/inspect.mjs _insp-<vista>.html --app`, con las copias que arma
  `scripts/insp-copias.sh` y que entran solas con la cuenta demo) da 0 FAIL y 0 WARN en Agenda, Finanzas, Clientes, Mi negocio
  y Cuenta. La entrada conserva 3 avisos a propósito: es la puerta entre el sitio y el panel, con la frase grande como la landing.
- No se muestran precios de Bookea en ningún lado.

- Barras de desplazamiento (cuando la grilla no entra a lo ancho): finitas, sin flechas, en verde agua pálido; se oscurecen un poco al pasar el cursor (pedido del dueño: la barra gris oscura del sistema no va).

## Panel: calendario desplegable
- Al tocar la fecha se abre el mes. Cada día lleva una barrita verde con qué tan lleno está; los días pasados van en gris y los
  cerrados sin fondo. Se recorre con flechas y se cierra con Escape o tocando afuera.

- Barra de arriba en tablet y celular (≤960px): se ocultan Reservar turno, Para negocios y Preguntas, pero **"Ingresar" siempre queda visible** al lado de "Sumá tu negocio" (es la única entrada al panel desde el celular). En celulares de menos de 375px el logo queda solo con la B.
