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
  - Campos: qué (pádel, fútbol, tenis o barbería; con fútbol aparece el campo "Cancha": de 5 o 7, desde el 26/11), dónde (localidades de Mendoza agrupadas por zona), cuándo (hoy y los 6 días siguientes) y la franja horaria.
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

- **En pantallas táctiles no hay barrido** (pedido del dueño, 6/11: en el celular el barrido no llegaba a completarse antes de cambiar de página). Al tocar, el botón se aprieta (escala 0,94-0,95) y se pone verde agua de una; al soltar se agranda un poco (1,06-1,07, con rebote; los turnos de la agenda 1,03) y se levanta 2px, y el color queda prendido 450ms antes de apagarse despacio (360ms). Lo manejan las clases `.is-apreta` / `.is-suelta` que ponen `script.js` y `admin.js` (solo con dedo, no con mouse; si el dedo arrastra para hacer scroll no queda marcado). Un link que lleva a otra página ("Ingresar") espera 260ms para que se vea el toque. Vale para la barra del sitio y para los botones y el menú del panel. El barrido queda solo para el mouse.

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
- Pie: "Reservá turnos en segundos." y "© Bookea", sin "Mendoza, Argentina".

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
- **Menú del costado (pedido del dueño, 19/11: "que se despliegue cuando el cursor pase cerca… esto nos ahorra espacio"):**
  - **Compu (con mouse):** una barra de 72px con los íconos (logo, iniciales del negocio, las secciones, "Ver tu página", el avatar y Salir).
    Al pasar el cursor se despliega a 248px con los nombres, **por encima** de la pantalla (no la empuja), con una sombra suave; al sacar
    el cursor se vuelve a cerrar (abre en 40 ms, cierra a los 180 ms, así no parpadea al pasar de largo). Los nombres aparecen cuando la
    barra ya se abrió. Con el teclado se abre igual. Las solicitudes pendientes (equipo de Bookea) se ven como globito sobre su ícono.
  - **Celular y tablet (o cualquier pantalla táctil), pedido del dueño 19/11 ("que sea exactamente igual al de la página principal"):**
    arriba el logo, el negocio y Salir; abajo **la misma barra de la página principal**: fondo blanco translúcido con desenfoque, línea
    arriba, cada sección con su ícono de 20px y el nombre chiquito (11px) debajo, gris, y la elegida en naranja. Están todas las
    secciones que la persona puede ver, Equipo incluido (5 o 6 botones). Se probó antes un menú que bajaba desde un botón arriba
    y se descartó: era poco intuitivo.
    La barra de arriba mide lo mismo en todas las secciones (antes se estiraba en Equipo, que es corta), y el lugar de la barra
    de desplazamiento queda reservado, así ninguna sección se ve más ancha que otra (pedido del dueño, 19/11).
- **Costado (antes del 19/11):** sobre el fondo, sin color. Logo con el barrido del sitio, la tarjeta del negocio (iniciales en verde agua,
  rubro · ciudad), el menú con íconos de línea propios (16-22px) y el barrido verde pálido al pasar el cursor, abajo "Ver tu
  página de reservas" y la cuenta con "Salir". En celular y tablet (≤900px): barra arriba (logo + negocio + Salir) y el mismo
  menú como barra de 5 botones abajo (Agenda, Finanzas, Clientes, Negocio, Cuenta).
- **Cada pantalla:** un h1 (30px) y una frase debajo armada con los datos (Agenda: "El próximo turno es a las 13:30: Lu P. en
  Cancha 2. Te quedan 15 horarios libres hoy."). Cada cifra lleva rótulo, valor y una frase que dice contra qué o por qué
  ("Ocupaste el 49 % de los horarios", "127 turnos de hoy en adelante, se cobran en el lugar"). En Clientes van en un solo
  contenedor dividido; en Finanzas, en tarjetas (abajo). "Cobrado" es la cifra más grande y su cambio dice contra qué días
  (naranja si baja, verde si sube).
- **Finanzas en tarjetas (pedido del dueño, 19/11: "que ocupen menos espacio y se vean en una sola pantalla la mayoría",
  hecho con `anti-ui-slop` y `dataviz`).** A 1440×900 entra todo sin bajar:
  - Fila 1: **Cobrado** (8 de 12 columnas) con su gráfico adentro, "Un día promedio" y "Mejor día"; a la derecha **Últimos
    cobros** (los 5 más nuevos, "Planilla de Excel" (un .xlsx armado en el panel, sin librerías: título, encabezado fijo con filtros, fechas, horas y montos de verdad, total con SUMA e impresión apaisada a una hoja de ancho; pedido del dueño, 26/11, porque el CSV se veía en una sola columna) y "Ver los N cobros", que abre la tabla entera a todo el ancho).
  - Fila 2: cuatro tarjetas chicas: Señas cobradas, Turnos pagados (con la barra de ocupación), No vinieron (en naranja si hubo)
    y Falta cobrar. Fila 3: **Por cancha** y **Por horario** (nombre, barra contra la mejor, monto y su parte del total).
  - **El gráfico, para que se entienda de un vistazo:** columnas verde agua; una línea punteada con el promedio de los días con
    cobros y su monto en negrita en el eje; el monto del mejor día arriba de su columna; **hoy en verde pálido** con la palabra
    "hoy" (el día no terminó, no es un mal día); la inicial del día debajo de cada número (L M M J V S D); montos en "mil".
    Al pasar el cursor o tocar una columna: día, monto, turnos y cuánto más o menos que el promedio. Abajo, la leyenda y
    "Ver cada día en números" (la tabla). En pantallas medianas lo cobrado y los cobros van a todo el ancho; en el celular,
    una columna con las cuatro tarjetas de a dos.
- **Agenda: solo la agenda** (pedido del dueño, 6/11): sin cifras, sin estadísticas y sin plata; eso vive en Finanzas.
  Grilla por cancha y horario + riel a la derecha (336px) con **Para cerrar** (turnos que ya terminaron sin marcar,
  con "Pagó" y "No vino" a un toque) y **Próximos turnos**. En pantallas angostas "Para cerrar" sube arriba de la grilla.
  Estados: con seña = verde agua pálido; sin seña = blanco con borde gris; pagado = gris; no vino = naranja pálido;
  bloqueado = noche; libre = verde agua más pálido con "+ Libre"; ya pasó sin turno = "Finalizado", solo texto. Cada uno con su punto y su palabra.
- **Mi negocio en tarjetas, por filas (pedidos del dueño, 19/11: "hay mucho espacio libre, quiero que sea más compacto y lindo… hacelo
  de otra forma" y después "la línea divisora de la parte de abajo debería estar a la misma altura en todas… vos abrís y ves las
  primeras tarjetas completas, luego bajás y ves las de abajo").** Tres columnas de tarjetas (de 1200px para arriba; dos en
  pantallas medianas; una en el celular), ordenadas **por filas**: las tarjetas de una fila miden lo mismo, así el borde de abajo
  queda a la misma altura en todas. En una pantalla de 1280×650 (la del dueño) la primera fila entra entera; las otras, al bajar.
  - Fila 1: **Tu negocio** (foto de 56px con "Subir foto"/"Quitar", nombre, rubro, WhatsApp, dirección, ciudad y link de reservas
    con "Copiar"), **Horario** (los siete días: un botón con el día, verde pálido si abre; si se destilda, dice "Cerrado") y
    **Así te ven**, en noche: la ficha blanca del negocio armada con lo que se va cargando (foto, nombre, rubro y ciudad,
    descripción, **los horarios de hoy** salidos del horario y la duración que hay en pantalla, turnos de, precio desde y seña)
    y abajo el link a la página de reservas.
  - Fila 2: **Qué se reserva** (cuánto dura cada turno y las canchas con nombre y detalle), **Precios por horario** (desde, hasta
    y precio con "$"; una franja nueva arranca donde termina la anterior, por 3 horas, y pide el precio) y **Seña y
    cancelaciones** (seña en "% del turno", "horas antes", devolver la seña y el ejemplo en verde pálido).
  - Fila 3: **Cómo es el lugar** (la descripción, de hasta 300 letras, a lo ancho de dos columnas) y **Cómo llegar** (link de
    Maps opcional; abajo una franja que es toda un link a Google Maps, armado con el link pegado o con nombre, dirección y ciudad).
  - Cada tarjeta: ícono de línea en verde agua, título de 16px y una línea gris. El rótulo va al costado del campo (arriba en el
    link de reservas y el de Maps); las tarjetas angostas acomodan solas sus filas (container queries). Con mouse, los campos de
    Mi negocio miden 38px (en pantallas táctiles, 44) para que la primera fila entre entera.
  - **Duración del turno y horarios cada 10 minutos (pedido del dueño, 19/11):** la duración va de 10 minutos a 4 horas, de a 10
    ("90 minutos (1 h 30)"); abre, cierra y las franjas se eligen en desplegables de 00:00 a 23:50, de a 10. Si un negocio
    tenía una duración u hora que no cae en 10 (por ejemplo 45), se agrega a la lista y se respeta.
- **Mi negocio se guarda solo (pedido del dueño, 19/11):** sin botón "Guardar cambios". Cada cambio se guarda un segundo después
  de dejar de escribir (agregar o quitar una cancha o franja, y la foto, enseguida). Una pastilla dice "Se guarda solo", "Guardando…"
  y "✓ Guardado" (arriba, al lado de "Ver la página de reservas"; en el celular queda fija arriba de la barra de abajo).
  Si un dato está mal, avisa al lado del campo sin mover la pantalla. Al salir de Mi negocio con algo pendiente, se guarda antes de cambiar.
- **Cuenta en tarjetas (19/11):** tres del mismo alto: **tu cuenta** en noche (inicial en crema, tu nombre, de qué negocio sos
  dueño o parte del equipo, el link de tu página y, abajo, "Tu equipo" con "Ver y sumar personas" en crema; a un empleado le
  muestra "Tu lugar en el equipo" con lo que puede hacer), **Tus datos** y **Cambiar contraseña**. Debajo, Solicitudes (equipo de
  Bookea) y Datos de prueba (solo en la vista de prueba).
- **Más llamativo con los colores de la marca (pedido del dueño, 19/11: "que se vea más llamativo y no tan apagado", con
  `anti-ui-slop`, `ui-ux-pro-max`, `web-design-guidelines` y `design-taste-frontend`).**
  - **Noche** (como la camiseta y la pantalla de carga): la barra del costado en la compu (íconos grises claros, la sección elegida
    con su ícono en naranja, como la barra de abajo del sitio; el negocio con sus iniciales en verde agua) y **un bloque por vista**
    con lo más importante: Agenda, el **próximo turno** grande (hora, quién, cancha, con o sin seña y "En 45 min" en naranja);
    Finanzas, **lo cobrado** con su gráfico (columnas verde agua, hoy en verde agua apagado, el promedio en crema, la ayuda al
    pasar el cursor en blanco); Clientes, la **franja de cifras**; Mi negocio, **Así te ven**; Equipo, **qué puede hacer cada uno**
    (los permisos, de a tres por fila, debajo de la lista); Cuenta, **tu cuenta**. En el celular la barra de arriba y la de abajo
    siguen claras, iguales a las del sitio.
  - Adentro de un bloque noche se cambian los tonos del panel por los de noche con los mismos nombres (`--tx`, `--tx-2`, `--regla`,
    `--v50`…), así el gráfico, las tablas y los rótulos de adentro toman solos sus colores.
  - **Naranja** en la acción clave de la vista: "Cargar turno" y "Sumar a alguien" (`.btn--naranja`: el paso fuerte del naranja,
    #cc4520, para que el blanco se lea a 4,7:1, con el barrido a noche al pasar el cursor). Los avisos siguen en naranja pálido.
  - Tarjetas con esquinas de 16px, como las del sitio. Equipo con una sola persona muestra "Así sumás a alguien" en tres pasos.
  - Guías web: toque inmediato (`touch-action: manipulation`), sin el recuadro gris del navegador al tocar, `autocomplete` en los
    campos de Mi negocio y "…" en los textos de ejemplo.
  - Inspector (`--app`): 0 FAIL en Agenda, Finanzas, Clientes, Mi negocio y Cuenta. Quedan a propósito: el naranja de la barra de
    abajo (igual al sitio), los nombres de esa barra cerca del borde y los huecos chicos que deja alinear las filas de Mi negocio.
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

## Bienvenida al iniciar sesión (pedido del dueño, 10/11)

- Al ingresar (o al crear una cuenta) aparece una pantalla noche como la carga del sitio: la B se arma con las mismas
  animaciones (`sp-asta`, `sp-verde`, `sp-naranja`), aparece "Hola, {nombre}." y abajo el nombre del negocio
  ("Tu cuenta está lista." si es cuenta nueva). A los 1,9 s la persiana sube (760ms) y el panel llega desde abajo en
  escalera (menú y bloques de la vista, 16px).
- Se saltea con un toque, un clic o cualquier tecla. Con "reducir movimiento" dura 0,9 s y se va con un fundido.
- Para lectores de pantalla el saludo se anuncia en `#aviso` sin mostrar el cartel. Ya no sale el cartel "Hola, …"
  (repetía el saludo); en cuenta nueva, al subir la persiana avisa "Completá los datos de tu negocio."
- La persiana necesita `clip-path: inset(0 0 0 0)` de partida: desde `none` no se anima (pasaba también en la carga
  del sitio y quedó corregido).

## Cuentas: entrar con email (11/11)

- Se entra con **email y contraseña** (antes era usuario). Con la base conectada, el email sirve para recuperar la
  contraseña: "¿Te olvidaste la contraseña?" manda un link y la pantalla "Tu contraseña nueva" la cambia.
- Formularios de la entrada: Ingresar, Crear cuenta, Elegí una contraseña nueva (pedir el link) y Tu contraseña nueva.
  Mismo estilo de caja. Los botones dicen qué está pasando mientras esperan ("Entrando…", "Creando tu cuenta…").
- `.solo-local` (la cuenta de prueba y la nota "Vista de prueba") y `.solo-nube` (el link de olvido) se muestran según el modo.
- Si la base pide confirmar el email, al crear la cuenta vuelve a Ingresar con el mensaje "Te mandamos un mail a…".
- Errores de guardado con la base: el aviso de abajo explica qué pasó ("Ese horario ya lo ocupó otra reserva…",
  "No se pudo guardar: parece que no hay conexión…") y el panel reintenta solo.

## Aprobación de negocios (13/11)

- Pedido del dueño: nadie usa el panel sin que Bookea lo apruebe. Al registrarse (o al entrar si sigue pendiente) se ve la caja
  **"Tu negocio está en revisión"** con "Volver a fijarme" y "Salir"; si se rechazó, **"Tu solicitud no fue aprobada"** sin botón para reintentar.
- Equipo de Bookea: vista **Solicitudes** (link "Solicitudes de negocios" con contador al pie del costado, y en Cuenta desde el celular).
  Dos tarjetas: "Esperan tu respuesta" y "Ya revisados". Cada fila: nombre, rubro, quién lo pidió con su email y fecha,
  chip de estado (los mismos `.estado` de la agenda) y botones Aprobar / Rechazar / Quitar acceso. Rechazar y quitar acceso piden un segundo toque.

## Revisión general: un solo sistema para el sitio, las reservas y el panel (16/11, pedido del dueño)
Pedido: "que no quede nada raro ni nada que no funcione" y "que todo tenga una correlación: colores, animaciones, tipo de letra".
**Regla nueva: lo que comparten las tres páginas vive en `styles.css` y `toque.js`. No se redefine en `app.css` ni en `admin.css`.**

- **Colores:** una sola familia de neutros, la del panel (gris con un paso hacia el verde agua). Tokens en `:root`:
  `--raised #eef3f1`, `--raised-2 #e2eae7`, `--fondo-app #f4f7f6`, `--ui-line #e1e8e6`, `--control #c5d0cd`,
  la escalera del verde agua (`--teal-pale`, `--teal-tint`, `--teal-200`, `--teal`, `--teal-deep`) y `--orange-ink` para errores.
  El panel usa esos mismos tokens con su nombre corto (`--v50`, `--borde`, etc.). Ya no hay grises cálidos ni bordes beige
  (`#f2f1ee`, `#cfccc4`). El beige queda solo donde imita a WhatsApp.
- **Botón principal:** noche con el barrido verde agua al pasar el cursor, igual en el inicio ("Buscar turnos", "Crear mi cuenta"),
  las reservas ("Continuar") y el panel. Secundario: blanco con borde (`.btn--line`); chico: `.mini` ("Cambiar", "Copiar").
- **Campos:** un solo estilo (borde `--control`, radio 6, foco con borde verde agua y aro pálido, rótulo de 14px en negrita).
  Los desplegables llevan la misma flecha en todos lados (la del sistema cambia en cada navegador).
- **Toque en pantallas táctiles:** `toque.js` lo pone en las tres páginas (antes había una copia en `script.js` y otra en `admin.js`,
  y la página de reservas no tenía). Los botones anchos y las fotos se mueven menos (0,98 / 1,02) para no salirse de su caja.
  En el celular ningún control mide menos de 44px, tampoco en el panel.
- **Tiempos:** el panel usa `--t-press` y `--t-ui` del sitio. Las tarjetas de reservas llegan desde abajo en escalera, como el panel.
- **Reservas (`reservar.html`):** misma barra de arriba que el inicio (logo, links con barrido, "Ingresar", "Sumá tu negocio"),
  fondo y cajas del panel, y los horarios libres en el verde pálido de los huecos libres de la agenda.

## Buscador en dos pasos, con una foto por rubro (16/11, pedido del dueño)
- **Paso 1, "¿Qué querés reservar?":** cuatro fotos (pádel, fútbol 5, tenis, barbería), **distintas de las del mosaico** y
  tratadas igual que ellas (pedido del dueño, 16/11): en blanco y negro, y al pasar el cursor la tarjeta se agranda un poco (1,04)
  y la foto se tiñe de verde agua con el mismo efecto del mosaico (`mix-blend-mode: color`); el nombre hace el barrido verde.
  Al tocarla en el celular pasa lo mismo. El rubro elegido queda con su foto chica teñida de verde.
  Fotos en `assets/r-*.webp` (640 px, de Wikimedia Commons; créditos en `assets/credits.json` y en el pie del inicio y de reservas).
  Son de gente común jugando o trabajando: no se usan fotos de deportistas conocidos (parecería que avalan Bookea).
  En computadora van las cuatro en fila; en el celular, de a dos.
- **Paso 2:** al tocar un rubro aparece arriba la foto chica con su nombre y "Cambiar", y recién ahí Dónde, Cuándo, Hora y
  "Buscar turnos". La caja acompaña el cambio de alto y lo nuevo entra desde el costado. El foco pasa al nombre del rubro;
  "Cambiar" lo devuelve a la foto que tenías.
- **En `reservar.html` es igual:** sin rubro en la dirección se ven las fotos; con rubro, el filtro compacto y los turnos.
  El botón "atrás" del navegador vuelve a las fotos. "Reservar turno" del menú llega siempre a las fotos.
- Sin JavaScript, cada foto lleva directo a los turnos de ese rubro.

## "Sumá tu negocio" es el primer paso del registro (16/11)
- Antes el formulario mostraba "¡Listo! Te escribimos por WhatsApp hoy mismo" y no mandaba nada a ningún lado.
- Ahora pide nombre, negocio y rubro y lleva al panel (`admin.html?alta=1…`), que abre "Creá la cuenta de tu negocio" con
  esos datos cargados; ahí se eligen el email y la contraseña y la cuenta se crea de verdad (queda pendiente hasta que Bookea la apruebe).
- Los tres pasos de al lado cuentan eso: creás tu cuenta, revisamos tu negocio, armás tu agenda.

## Arreglos de la revisión (16/11)
- Panel en computadora: "Salir" quedaba cortado ("Sa") cuando el email era largo. Ahora el email se corta con "…".
- Panel en celular: botones de 34px ("Día / Semana", períodos, "Copiar", "Agregar") pasan a 44px.
- Finanzas en celular: la ayuda del gráfico dice "Tocá una barra" en lugar de "Pasá el cursor".
- El color de la barra del navegador (`theme-color`) es noche en las tres páginas.
- "Cualquier hora" pasó a "Todo el día" (en el celular se cortaba).

## Equipo: el dueño suma personas con permisos (16/11, pedido del dueño)
- **Equipo** (solo el dueño): en la computadora está en el menú; en el celular se abre desde **Cuenta → Tu equipo** (el menú de abajo
  se queda con 5 botones como máximo). Muestra quién entra al panel, con chips de lo que puede hacer, y las invitaciones sin usar.
- **Sumar a alguien:** nombre, email y casillas de permisos, cada una con su título y para qué sirve. Viene tildado "Ver la agenda" y
  "Cargar y cambiar turnos". Cargar turnos necesita ver la agenda: se tildan y destildan juntas. Al crearla, Bookea da un **link** para
  copiar o mandar por **WhatsApp** (sirve una vez, para ese email, y vence a los 7 días).
- **Permisos:** ver la agenda · cargar y cambiar turnos (incluye marcar si pagaron y cancelar) · ver Clientes · ver Finanzas · cambiar Mi negocio.
  Cuenta (su nombre y su contraseña) la tienen todos. El equipo lo maneja solo el dueño.
- **La persona invitada** abre el link, ve "Sumate al equipo de {negocio}" con su nombre y su email ya puestos, elige contraseña y entra.
  Si ya tenía una cuenta sin negocio, toca "Ingresá" y queda sumada.
- **Lo que ve un empleado:** solo los botones del menú que le habilitaron. Sin "cargar turnos", la agenda es de solo lectura: un candado
  con "Podés ver la agenda…", los huecos libres no se tocan, "Para cerrar" sin botones y el detalle del turno sin acciones.
  En Cuenta ve "Tu lugar en el equipo" con lo que puede hacer.
- Si el dueño le cambia los permisos o lo saca, el panel del empleado se actualiza al volver a la pantalla (o al minuto) y se lo avisa.
- **Lo hace cumplir la base** (`supabase/esquema.sql`): cargar, cambiar o borrar turnos pide el permiso "turnos"; cambiar el negocio, "negocio";
  invitar, cambiar permisos y sacar gente, ser el dueño. Ver Finanzas y Clientes lo controla el panel (los datos salen de los mismos turnos).


## Frente nuevo (17/11, pedido del dueño)

El dueño mandó una página de referencia ("mirá lo limpia que se ve, así quiero que se vea") y pidió ese estilo para todo el frente, con nuestros colores y con todos los botones funcionando, porque la misión principal es sacar turnos.

- **Archivos:** `index.html` + `sitio.css` + `sitio.js` (una sola página con pantallas: inicio, resultados, ficha, pagar la seña, Mis turnos y negocios). Reemplazan a `script.js`, `app.css` y `reservar.js`. `reservar.html` solo redirige al inicio.
- **Estilo:** fondo blanco, mucho aire, bordes finos `--ink-200`, radios 12/20/28 px, sombras suaves solo en lo que flota (buscador, tarjeta de reserva, resumen del pago).
- **Letras:** Inter Tight para todo y JetBrains Mono para horarios, precios, códigos y etiquetas chicas en mayúscula. Se sirven desde `assets/fuentes/` (licencia OFL, al lado de cada archivo), sin depender de Google Fonts. El panel sigue con Archivo.
- **Colores de Bookea:** `--ink-900` noche `#11151c`, `--accent` naranja `#e4572e` (botón principal, horario elegido, la segunda línea del título), `--ok` verde agua `#1fa08c` (lugares libres, confirmado), crema `#f5ecd7` de fondo en "Sumá tu negocio" (como los mails).
- **Fotos a color:** las de `assets/` (las mismas de antes). Ya no van en gris.
- **Lo que no se copió de la referencia:** las reseñas y los puntajes con estrellas (serían opiniones inventadas: CLAUDE.md lo prohíbe), "Turnos · Valle de Uco" (Bookea no se limita a una zona) y la zona por defecto "Valle de Uco" (ahora "Todas las zonas", agrupadas por región).
- **Celular:** barra de abajo (Reservar, Mis turnos, Negocios), aviso verde "Ir a pagar" en la ficha al elegir horario y barra fija con "Pagar seña" en el pago, y todo lo que se toca mide 44 px o más en pantallas táctiles.
- **Honestidad del demo:** el pago dice "Es una demo: no se cobró nada" y el pie aclara que Bookea está en prueba: los lugares de la lista son ejemplos y la seña todavía no se cobra.
- **Movimiento (pedido del dueño, 17/11: "no está haciendo las animaciones"):** el frente nuevo recupera el movimiento de Bookea, adaptado al estilo limpio:
  - **Pantalla de carga:** la B se arma (asta crema, baja el verde agua, sube el naranja) sobre noche y sube como persiana; mínimo 1,5 s, tope 4 s. Con "reducir movimiento" aparece quieta y se desvanece a los 0,6 s; sin JavaScript no está.
  - **Entrada:** baja la barra de arriba, el título sube renglón por renglón desde una ranura, después el texto y el buscador; las tres fotos se destapan de izquierda a derecha y se asientan (escala 1,12 → 1).
  - **Al bajar:** encabezados, tarjetas de "Libres ahora", lugares, resultados, pasos, funciones, preguntas y bloques de la ficha suben a su lugar en escalera (70 ms entre una y otra). Al cambiar de rubro o de filtro, las tarjetas nuevas vuelven a subir.
  - **Con mouse:** el verde agua barre de izquierda a derecha en "Ingresar", "Sumá tu negocio", los links de arriba y los botones principales (380 ms), y el texto pasa a noche.
  - **El logo (pedido del dueño, 21/11: "el botón de Bookea ahora no hace nada"):** vuelve lo de antes del frente nuevo. Con el mouse, el verde agua barre desde la B hasta la palabra y la B se inclina con un rebote (-8°, 1,08); con el dedo, se aprieta, se pone verde agua de una y rebota al soltar. La entrada de la barra de arriba usa `animation` con `translate` (no `transition` con `transform`), así no le pisa el movimiento al logo ni a los botones.
  - **Con el dedo:** `toque.js` (el mismo del panel) aprieta botones y tarjetas al tocar y rebotan al soltar; los botones se ponen verde agua un momento.
  - **Detalles:** el rubro elegido y el horario elegido hacen un saltito, el contador de Mis turnos salta cuando suma uno y el aviso "Pagar seña" late cuando quedan menos de 2 minutos.
- **Primer pantallazo (pedido del dueño, 18/11: "se corta todo a la mitad"):** el cuadro "¿Qué querés reservar?" entra entero con "Buscar turnos" sin bajar, en celulares (desde 360×560) y notebooks (desde 1280×620). Los espacios, el título, el texto y las fotos de los rubros se achican según el alto de la pantalla; en el celular se esconden el rótulo "Turnos online" y la nota de abajo del buscador, y la segunda frase del texto aparece solo si hay lugar. La prueba lo mide en 10 tamaños.
  - En el celular, la parte de arriba ocupa justo la pantalla visible (sin la barra de abajo): lo último que se ve es "Buscar turnos" y "En vivo" aparece al bajar. Si sobra lugar (celulares altos), va a las fotos de los rubros y vuelven el rótulo y la nota.
  - **En la compu también (pedido del dueño, 19/11: "se sigue viendo ahí abajo como unas letras"):** el inicio ocupa justo la pantalla y "En vivo" aparece recién al bajar. La prueba lo mide en los 10 tamaños, celulares y compus.
- **Secciones Deportes | Servicios (pedido del dueño, 19/11, eligió la opción 1 entre dos maquetas):**
  - Una pastilla gris con dos pestañas (la elegida en blanco), arriba de las fotos de rubros: en la compu al lado de "¿Qué querés reservar?", en el celular a todo el ancho (ahí el rótulo queda solo para lectores de pantalla).
  - La pestaña cambia toda la página: los rubros del buscador, las tres fotos de al lado (se funden), "Libres ahora", los lugares y los resultados (el mismo control va en "Libres ahora" y arriba de los resultados). La ficha dice "Deportes · Pádel" o "Servicios · Barbería".
  - La fila de fotos de rubros mide siempre lo mismo que con cuatro: con tres, las tres del mismo tamaño (pedido del dueño, 26/11: la fila pasa a 12 columnas, un molde invisible del ancho de una de cuatro fija el alto y cada foto ocupa 4); con uno (Servicios hoy), es una franja a lo ancho del alto de una foto común (`.rubro--molde`, invisible, fija el alto).
  - Los rubros de cada sección están en `SECCIONES` (`sitio.js`). Cada sección recuerda el último rubro elegido.
  - **Cambio suave (pedido del dueño, 19/11: "es un poco brusco"):** el fondo blanco de la pestaña se desliza de una a otra; las tres fotos de al lado se funden una encima de la otra (1 s, una tras otra); la fila de fotos de rubros se desvanece mientras entra la nueva; los lugares y "Libres ahora" suben como siempre.
  - **"Libres ahora":** en la compu el control va a la izquierda, al lado del título. Los botones de rubro de las dos secciones ocupan el mismo lugar y se funden: no saltan, y Barbería queda donde está Pádel. Lo mismo arriba de los resultados (el control fijo adelante, los rubros siempre arrancan en el mismo lugar). Con menos de cuatro lugares, "Libres ahora" muestra dos horarios de cada uno para llenar la fila.
  - **"Libres ahora" en la compu no se desliza (pedido del dueño, 19/11: "se puede mover un poco y no debería"):** es una grilla de una fila que ocupa el ancho; entran justas las tarjetas que caben (3, 4 o 5 según el ancho, con `@container`) y ninguna queda cortada. En el celular sigue siendo una fila que se desliza con el dedo, solo de costado. Vale también para los turnos libres al final de Mis turnos y del pago.
  - **Ninguna fila que se desliza de costado se mueve para arriba o para abajo** (pedido del dueño, 19/11: "se desplaza verticalmente un poquito"): `overflow-x: auto` va siempre con `overflow-y: hidden` ("Libres ahora" en el celular, los rubros de arriba, los filtros de los resultados y los días de la ficha). La prueba lo revisa.
- **Ficha del lugar a lo ancho (pedido del dueño, 19/11: "hay mucho espacio libre"):**
  - Sin la tarjeta de reserva a la derecha. Arriba el nombre, los datos y "desde $ … por turno"; abajo las fotos a todo el ancho (su alto se achica en pantallas bajas para que se vean los días).
  - **Elegí el día:** los siete días a lo ancho, cada uno con su barra de cupo y cuántos turnos libres tiene (en el celular se deslizan de costado). Al tocar uno, abajo se abre un panel a lo ancho con sus horarios por franja (y el servicio, en barberías); con un horario elegido aparecen las canchas o barberos para elegir.
  - **Elegir la cancha (pedido del dueño, 19/11: "cuando hay más de un turno disponible debería dejarme elegir la cancha"):** si a esa hora hay dos o más libres, justo debajo del horario elegido (no al final del panel, donde la tapaba el aviso verde) aparece una caja con borde naranja, "¿En qué cancha? · 18:30" ("¿Con quién?" en barberías), con cada cancha como tarjeta igual a los horarios: el nombre y abajo "Techada" o "Libre". La primera libre ya viene marcada en naranja pálido, así siempre se ve cuál es; al tocar otra, el aviso verde y el pago la nombran. Si al elegir el horario la caja queda abajo del aviso verde, la página baja sola lo justo.
  - Se abre sin día elegido si se llega desde los lugares del inicio; con el día abierto si se llega desde los resultados, un horario de "Libres ahora" o "Cambiar horario" del pago.
  - **Aviso verde "Ir a pagar":** al elegir un horario sube abajo, flotando, en verde agua: día y hora, cancha, seña y precio, y el botón noche "Ir a pagar" (lleva a "Confirmá tu turno"). No tapa la lectura: la página deja lugar abajo y en el celular va sobre la barra de abajo.
  - Debajo, el resto de la ficha en dos columnas (sobre el lugar · lo que ofrece; precios · dónde queda; información adicional a lo ancho), sin huecos.
- **Barra de arriba (pedido del dueño, 18/11):** se sacó "Reservar turno"; en la compu quedan "Sumá tu negocio" e "Ingresar" (el panel de los negocios), más "Pagar seña" cuando hay un turno guardado. El logo vuelve al inicio, donde está el buscador, y "Reservar turno" sigue en el pie.
  - **Sin "Mis turnos" arriba en la compu (pedido del dueño, 21/11: "no me gusta como queda ahí"):** en la compu se llega desde el pie (columna Bookea, debajo de "Reservar turno"), al terminar de pagar y con el botón de los mails (`#mis-turnos`). En el celular sigue en la barra de abajo, con su número.
- **Pago directo, sin carrito (pedido del dueño, 18/11: "que se saque la pestaña carrito, que le dé 10 minutos para pagar y que una vez que reserve el turno lo lleve directamente a pagar"):**
  - "Reservar turno" (ficha) abre **Confirmá tu turno**: un solo turno, con la foto del lugar, día y hora grandes, cancha o barbero, la cuenta del cliente (ver "Cuenta del cliente", abajo), el resumen con "Pagar seña con Mercado Pago", dónde queda y los tres pasos de cómo sigue. En el celular, barra fija abajo con la seña, el tiempo y "Pagar seña".
  - **El turno queda guardado 10 minutos** (`HOLD` en `sitio.js`, localStorage `bookea:reserva` con su vencimiento: sobrevive a recargar). El reloj se ve en verde agua y pasa a naranja con menos de 2 minutos.
  - Fuera de esa pantalla, mientras hay un turno guardado: en la compu, "10:00 Pagar seña" arriba (late al final); en el celular, una barra noche sobre la de abajo ("Tenés un turno guardado · Se libera en 09:41 · Pagar seña"), salvo en la ficha, que tiene su propia barra.
  - **Si se vence:** "Se terminó el tiempo", con el turno que se liberó a la derecha, "Volver a reservarlo" (lo guarda otros 10 minutos si sigue libre; si no, abre la ficha para elegir otro) y turnos libres del mismo rubro abajo.
  - Elegir otro turno teniendo uno guardado lo reemplaza (el anterior queda libre y se avisa). Volver a elegir el mismo sigue con el que ya estaba guardado y con su tiempo.
  - Al pagar: Mis turnos con "¡Listo, tu turno está confirmado!" y "Reservar otro turno". Ya no hay carrito, ni su ícono arriba, ni su pestaña abajo.
  - En la versión real, la base tiene que bloquear ese horario para los demás durante esos 10 minutos (en el demo solo lo ve quien lo guardó).
- **Regla de estética (pedido del dueño, 18/11, de ahora en más):** "que sigas toda la estética como está en la página principal, que no queden espacios en blanco y que se aproveche todo el espacio de la pantalla para que la gente lo que vea sea relacionado a turnos".
  - Toda pantalla nueva o cambiada usa lo del inicio: fondo blanco, Inter Tight + JetBrains Mono (horarios, precios, códigos), bordes `--ink-200`, radios 12/20/28, botón principal naranja, verde agua para lo libre y lo confirmado, el mismo movimiento.
  - Nada de huecos de relleno: si a la derecha o abajo queda lugar, va algo de turnos (el lugar, el mapa, los pasos, horarios libres). Las pantallas que quedarían cortas o vacías (pagar sin turno, Mis turnos) terminan con "Libres ahora" del rubro, dos horarios por lugar para llenar el ancho.
  - Al revisar una pantalla, mirarla entera en la compu (1440×900) y en el celular (390×844): si sobra blanco, se completa con contenido de turnos, no con decoración.

## Cuenta del cliente: hace falta para pagar la seña (19/11, pedido del dueño)

"Vamos a necesitar una base de datos para que los clientes se registren cuando vayan a bookear un turno… antes de pagar se van a tener que registrar." Confirmaciones por mail, no por WhatsApp. Entra con email y contraseña. Los negocios de ejemplo y el pago simulado quedan como están.

- **Dónde:** en **Confirmá tu turno**, en el lugar de "Tus datos", sin salir de la pantalla ni perder el turno guardado. También en **Mis turnos** (para entrar desde cualquier dispositivo). `cuenta.js` hace el trabajo; `sitio.js` dibuja la caja (`cuentaHTML`).
- **Crear cuenta | Entrar:** el mismo interruptor de Deportes | Servicios ("Soy nuevo" / "Ya tengo cuenta"). En el pago arranca en "Soy nuevo"; en Mis turnos, o si en ese navegador ya hubo una cuenta, en "Ya tengo cuenta".
  - Crear: nombre y apellido, email, celular y contraseña (8 o más, con "Ver"), en dos columnas en la compu. Abajo, "Acepto las condiciones de uso y la política de privacidad" (obligatoria, con links a `privacidad.html`) y "Quiero recibir promociones de Bookea por mail (opcional)", sin marcar. Al pie, en letra chica, la leyenda que pide la AAIP (Disposición 10/2008): derecho de acceso gratis cada seis meses y que la AAIP atiende denuncias.
  - Entrar: email y contraseña, y "¿Te olvidaste la contraseña?" (manda el link por mail).
  - El botón de la caja es noche ("Crear cuenta", "Entrar"): el naranja queda solo para "Pagar seña".
  - Errores al lado de cada campo, como en el resto; los mensajes de la cuenta van en una franja naranja pálido debajo del botón.
- **Pagar sin cuenta:** no abre el pago; la página lleva a la caja y dice "Primero creá tu cuenta (o entrá con la tuya) y después pagás la seña".
- **Confirmar el email (modo nube, con "Confirm email" de Supabase):** la caja pasa a verde agua pálido con un sobre, "Confirmá tu email", a qué dirección se mandó y que el turno sigue guardado. "Ya lo confirmé" (si se confirmó en otro dispositivo, pide entrar con el email ya escrito) y "Usar otro email". El link del mail vuelve a `bookea.ar/?cuenta=confirmada`, entra solo y lleva al pago del turno guardado (o a Mis turnos).
- **Con la cuenta abierta:** en el pago, "Tus datos": círculo noche con las iniciales en crema, nombre, email y celular, "No soy yo", y "Te mandamos la confirmación del turno a …".
- **Mis turnos:** en la compu, los turnos a la izquierda y "Tu cuenta" a la derecha (quieta al bajar): sus datos, si recibe promociones, "Corregir mis datos" (diálogo: nombre, celular y promociones; el email se ve pero no se cambia), "Cambiar contraseña" (le llega un link; solo con la base), "Salir", "Cómo cuidamos tus datos" y "Borrar mi cuenta" en naranja oscuro, que pregunta antes. Sin cuenta abierta: "Entrá a tu cuenta" y, al lado en crema, "¿Todavía no tenés cuenta?" (se crea al reservar) con "Buscar turnos" y el link al panel para negocios.
- **Una cuenta que ya existía** (por ejemplo, la de un dueño de negocio) entra y completa nombre y celular ("Completá tus datos"). No se puede borrar desde la página: se pide por mail.
- **Mails:** "Tu turno está confirmado" al pagar y "Cancelaste tu turno" al cancelar, con la cara de siempre (`avisos-por-mail.sql`).
  - **Dirección y WhatsApp del lugar (pedido del dueño, 20/11: "tiene que estar automatizado directamente desde la web cuando los dueños cargan sus cosas"):** si el turno es de un negocio real (`turnos.negocio_id`), la confirmación suma "Dirección" (la calle, y la ciudad si no es la de "Dónde") con "Cómo llegar", y "WhatsApp" con el número como link a wa.me. Salen en el momento de lo que el dueño tiene en **Mi negocio**: dirección, ciudad, WhatsApp y link de Google Maps (si no pegó uno, se arma con el nombre, la dirección y la ciudad, igual que el panel; un link que no es de Google Maps no se usa). Si falta un dato, esa fila no aparece. Los lugares de ejemplo no tienen esas filas. Mientras Bookea está en prueba, el de confirmación dice que los lugares son de ejemplo y la seña no se cobró (`bookea_en_prueba()`).
- **Textos:** todo lo que decía WhatsApp para avisarle al cliente ahora dice mail (pago, ficha, Mis turnos y la parte para negocios). El link del negocio por WhatsApp ("lo mandás por WhatsApp") queda.
- **`privacidad.html`:** política de privacidad, tus derechos (con la leyenda de la AAIP) y condiciones de uso, con la estética del frente, a lo ancho de lectura (760 px) y un índice arriba. Link en el pie del inicio. Es un borrador para que lo revise un abogado; cuando se inscriba la base en la AAIP, se suman el nombre, el domicilio y el número de registro.

## Negocios de verdad en la página (20/11)

"Arrancá con los negocios": que lo que un dueño carga en el panel se vea en bookea.ar y que el turno le llegue a su agenda. Los lugares de ejemplo quedan como están ("la página no la tiene nadie").

- **Cuáles se ven:** cada negocio aprobado, con su link `bookea.ar/su-link` (el de Mi negocio; `404.html` lo lleva a `?lugar=su-link`). En la lista (inicio y resultados) entran recién cuando cobran la seña con Mercado Pago: así nadie encuentra un negocio que todavía no puede cobrar.
- **Ficha:** la misma de los de ejemplo, con sus datos de Mi negocio. Cambia:
  - **Arriba:** su foto de perfil, o sus iniciales en un cuadrado noche con letras crema, al lado del nombre (como "Así te ven" en el panel). Sin la foto grande: la foto del panel es chica (320 px) y estirada se vería borrosa, y una foto genérica del rubro haría pensar que es su lugar. Así los días y los horarios suben y llenan la pantalla. En las tarjetas y en la pantalla de pago, lo mismo: su foto, o sus iniciales en noche y crema (`.portada`), nunca la foto genérica del rubro.
  - **Bloques de abajo:** "Horarios" (por día, con los días iguales juntos: "Lun a vie · 18:00 a 01:00", "Dom · Cerrado") en lugar de "Lo que ofrece", sus precios por franja con la seña de cada una, y "Dónde queda" con la dirección y "Cómo llegar" (su link de Google Maps o uno armado con nombre, dirección y ciudad), sin el mapa dibujado.
  - Sin el cartel "Negocio de ejemplo · demo".
- **Horarios libres:** los de su agenda; los ocupados (turnos de la página, cargados a mano o bloqueos) los manda la base sin nombres. Se vuelven a pedir al abrir la ficha. Un turno de las 00:30 que sigue a la noche se muestra en esa noche, y para el cliente es del día siguiente.
- **Seña y cancelación:** las de su panel (por ejemplo, 30 %, redondeada a $ 100 como en el panel; "Si cancelás, el horario se libera, pero en este lugar la seña no se devuelve" si eligió no devolverla).
- **Mientras Bookea esté en prueba** (desde el 27/11, solo los lugares de ejemplo: un negocio de verdad sin Mercado Pago toma los turnos sin seña, ver "Cobrar la seña con Mercado Pago"): el pago dice "Bookea está en prueba: todavía no se cobra la seña. El turno queda reservado igual en la agenda del lugar"; en la agenda del negocio el turno va con seña 0 y una nota; el pie del sitio dice "En prueba: los lugares de la lista son ejemplos y la seña todavía no se cobra".
- **Mails al negocio:** "Tenés un turno nuevo" (día, cancha, cliente con su WhatsApp, precio, seña, código y "Ver la agenda") y "Se canceló un turno". Al cliente, si cancela el negocio: "{Lugar} canceló tu turno", con lo que pasa con la seña.
- **Página de "no encontramos":** `404.html`, blanca, con el isotipo, "No encontramos esta página" y "Buscar turnos" en naranja.

## La página del negocio y "Tu página" (21/11)

"Aparte de las reservas le quería crear un link para que tengan una página web y así ofrecer un servicio personalizado y diferencial", tomando como referencia la página de cada bodega de Mendoza Icons (misma estructura para todos; cambian el logo, las fotos y los textos). Dos direcciones: **bookea.ar/nombre** es su página y **bookea.ar/nombre/reservar**, sus turnos ("lleva la lógica del local").

- **La página (pantalla `local` de `sitio.js`), rehecha el 25/11.** Pedido del dueño: "esta página no es para reservar, es para que los negocios tengan su propio lugar", "nuestros colores no debemos utilizarlos tanto, es de los negocios, no nuestro", "un logo de Bookea transparente arriba a la izquierda, sobre la foto" y "características del lugar, fotos, ubicación y al final un botón para reservar". Es la excepción a la regla de estética del frente: acá no van turnos libres ni precios.
  - **Sin nada de Bookea alrededor:** sin la barra de arriba, la barra de abajo del celular, el pie ni la pantalla de carga (`sitio.js` pone `.en-local` en `<html>`; `index.html` pone `.sin-splash` si la dirección es `bookea.ar/nombre` o `?pagina=`). Solo la B y "Bookea" en blanco al 72 %, arriba a la izquierda sobre la portada (lleva al inicio), y abajo de todo una línea chica: "Reservas online con Bookea".
  - **Colores neutros:** blanco, negro (`#151515`) y grises; el color lo ponen sus fotos. Nada de naranja, verde agua ni crema, y los botones no hacen el barrido verde (`.loc__btn`: negro, de borde o blanco sobre foto).
  - **Segunda vuelta (25/11), con la página de Penedo Borges en Mendoza Icons de referencia:** "ponemos una foto del lugar y la foto baja un poquito, pero es lo que más llama la atención" y "unas tarjetas muy sutiles con la característica del lugar (si tiene pileta, cuántas canchas de pádel, dónde se ubica, camarines, vestuario), pero que no diga Características". Títulos centrados, de peso medio.
  1. **Portada a toda la pantalla:** su foto con un velo oscuro (sin foto, un fondo oscuro liso), su logo en un cuadrado blanco, rubro y ciudad en mono y el nombre grande. Al bajar, la foto baja más despacio que la página (40 %) y el nombre se va apagando (`moverPortada` en `sitio.js`; con "reducir movimiento", quieta). Arriba a la izquierda, la B y "Bookea" en blanco al 72 %; a la derecha, sus redes como íconos.
  2. **Conocé {nombre}** (o su frase), el cartel de ejemplo si es uno de muestra y **su historia** centrada en una columna angosta.
  3. **Tres tarjetas anchas** (pedido del dueño, 26/11: "quedó muy corta; pondría tres tarjetas horizontales con características, servicios y ubicación, y en cada una una o dos fotos, ocupando todo el ancho, para que se vea más armonioso y completo"). Van de 1160 px, con borde gris claro y radio 20: el texto de un lado y sus fotos del otro, **alternados** (la del medio con las fotos a la izquierda). Las fotos van enteras, a todo el ancho de su lado (hasta 560 px de alto), sobre un fondo gris claro que hace de marco (`armarFotos` en `sitio.js`). En el celular parado también va el texto de un lado y las fotos del otro, alternados (pedido del dueño, 26/11: "en vertical me gustaría que también quede texto de un lado y foto del otro"): las letras un poco más chicas, los horarios con el día arriba y la hora abajo, los servicios en una columna, las dos fotos una arriba de la otra y sin el mapa chico (queda "Cómo llegar").
     - **Las canchas** ("La cancha" si hay una; "El lugar" en los que no son deportes): cuántas hay con su detalle ("Cancha 3: techada"), "Turnos de 90 min · Se reservan online" y "Horarios · Hoy de 17:00 a 00:30", en una lista con íconos de línea.
     - **Servicios** (solo si marcó alguno): cada servicio con su ícono, en dos columnas de cajitas grises (una en pantallas de menos de 400 px).
     - **Dónde estamos:** la dirección, los horarios (los días seguidos que abren igual van en una fila: "Lunes a viernes", "Sábado y domingo", "Todos los días"; si hay más de una fila, la de hoy va en negrita con "Hoy"), "Cómo llegar" y sus redes. Al costado, sus fotos (y el mapa de Google chico abajo del texto) o, si no tiene fotos para esta tarjeta, el mapa ocupando ese lado (`maps.google.com/maps?q=…&hl=es&output=embed`, sin clave; se carga al llegar ahí; `privacidad.html` lo menciona).
     Las fotos de cada tarjeta se cargan en el editor ("Fotos de las tarjetas", `pagina.tarjetas`: `lugar`, `serv`, `ubi`, hasta dos cada una). Si "Las canchas" o "Servicios" no tienen fotos propias, usan una de las fotos del lugar (la galería); las que sobran van **abajo de todo, de a tres por fila** y enteras (como un álbum).
  4. **Al final:** una franja chica (radio 16, del ancho de las tarjetas) "Reservá tu turno en {nombre}" sobre su última foto (o la portada) oscurecida, con el único botón "Reservar turno" al costado (abajo y a todo el ancho en el celular), que lleva a bookea.ar/nombre/reservar (ahí sí vuelve la barra de Bookea).
  Los de ejemplo también la tienen (con sus fotos de muestra y el cartel de ejemplo); su dirección no cambia.
- **El editor de la página (panel):** misma forma que Mi negocio (tarjetas con ícono verde agua y guardado solo): Portada y logo (la vista previa es como la página: fondo oscuro liso, logo en blanco y "Bookea" chico arriba a la izquierda, sin la franja), los links (las dos direcciones con "Copiar"), la historia (frase y texto), Redes y contacto (con el WhatsApp opcional), **Servicios del lugar** (se marcan tocando cada uno, entre ellos pileta y quincho; van a `negocios.pagina.servicios`, los nombres son los de `AM` en `sitio.js` y cada uno es una tarjeta en la página) **Fotos de las tarjetas** (tres grupos, hasta dos fotos cada uno; 26/11) y Fotos del lugar (hasta 6). Las fotos se achican antes de subir (portada 1920 px, fotos 1600, logo 512 con transparencia). **Desde el 25/11 lo usa solo el equipo de Bookea** (Solicitudes → "Editar su página"): el dueño la vende como un servicio, así que el negocio y su equipo ya no tienen "Tu página" en el menú; en Mi negocio les queda "Ver tu página web".
- **Mi negocio:** el campo es "Tu dirección en Bookea" y "Copiar" copia el link para reservar; "Ver la página de reservas" abre bookea.ar/nombre/reservar.
- **Las arma el equipo de Bookea (pedido del dueño, 25/11: "son todas iguales, solo cambia lo que caracteriza a cada lugar, y lo voy a cargar yo a las imágenes y la descripción"):** en **Solicitudes**, cada negocio tiene "Editar su página", que abre el mismo editor de Tu página con sus datos ("Página de {nombre}", "Volver a Solicitudes"). Guarda solo la página (`guardar_pagina` en la base) y las fotos van a la carpeta de ese negocio (`puede_subir_foto` deja al equipo de Bookea). Las canchas, los horarios y la dirección salen de su Mi negocio. El negocio no la toca (la base no lo deja: `pagina` no está entre las columnas que puede cambiar).

### Pulido con anti-ui-slop (25/11)
Pedido del dueño: "aplicá esta skill en esa página web de los negocios". Sin cambiar la dirección elegida (Penedo Borges): se sacaron dos frases de relleno ("Todo lo que tiene el lugar, de un vistazo", "Los días y horarios de…"), el saltito de las tarjetas y el zoom de las fotos al pasar el mouse (no se pueden tocar, y lo parecía), los servicios pasaron a un segundo grupo de tarjetas más chicas debajo de las cuatro del lugar (antes quedaba una tarjeta suelta al final) y las horas usan números del mismo ancho. Revisado en la compu (1440) y el celular (390).

### Más compacta (26/11)
Pedido del dueño: "hay demasiado espacio en todos lados, compactalo para que se vea más profesional; los horarios se ven muy grandes y podrían ser muchísimo más compactos; lo de Reservá tu turno también es enorme". La portada sigue a toda la pantalla (es lo que más llama la atención); lo de abajo se achicó: secciones separadas por 44–72 px (antes 72–128), títulos de 24–32 px (antes 30–50), todo en un ancho de 1000 px, tarjetas más bajas (radio 16, ícono de 24), los servicios como tarjetas chicas con el ícono al lado del nombre, la galería más baja, los horarios agrupados junto al mapa y el cierre como una franja de unos 100 px (antes media pantalla). En la compu la página pasó de 4656 a unos 2600 px de alto.
Segunda vuelta, el mismo día ("sigue existiendo mucho espacio"): secciones separadas por 34–52 px, títulos de 22–28 px, las cuatro tarjetas del lugar en horizontal (ícono al costado del nombre, unos 64 px de alto en vez de 120), el texto a 16 px, el mapa de 220 px (las fotos, después, volvieron a ser grandes: 3 por fila). Un negocio de verdad sin ciudad no muestra "Sin ciudad": la tarjeta usa la dirección o no aparece. En la compu, la página de ejemplo quedó en 2244 px de alto.

Tercera vuelta, el mismo día ("me vas a matar, pero quedó muy corta la página"): en vez de las tarjetitas y la sección de horarios y mapa, las **tres tarjetas anchas** con fotos de arriba (ver el punto 3 de la lista). La página de ejemplo quedó en unos 2700 px de alto en la compu, sin espacios vacíos.

Cuarta vuelta ("en la compu o el celular acostado, que se agrande un poco el texto y las imágenes; en el celular parado, que quede así"): de 701 px para arriba (`@media (min-width: 701px)` en `sitio.css`) los títulos van hasta 34 px, el texto de la historia y la dirección a 18, los datos de las tarjetas a 18/15, los servicios a 16 con íconos más grandes, las tarjetas y las fotos de abajo a 1200 px de ancho, la foto de una tarjeta hasta 620 px de alto y el mapa de 400. Los servicios van en dos columnas solo si entran (container query sobre el texto de la tarjeta); si no, en una. En el celular parado (hasta 700 px) no cambia nada.

## Fútbol de 5 o de 7 (26/11)
Pedido del dueño: "no debería decir fútbol 5, debería decir fútbol y darte a elegir si querés fútbol 5 o 7". El rubro se llama **Fútbol**. El tamaño de cada cancha sale de su detalle ("Cancha 3 · Fútbol 7"; en Mi negocio, el detalle de la cancha: "Fútbol 7" o "F7"); una cancha que no lo dice entra en los dos.
- **Buscador:** con Fútbol aparece un cuarto campo, **Cancha** ("De 5 o 7", "De 5", "De 7"). En la compu los cuatro van en una fila (letra de 14 px, Dónde un poco más ancho para que "Todas las zonas" entre); en el celular, de a dos (mide lo mismo que antes).
- **Resultados:** botones "Fútbol 5 o 7", "Fútbol 5" y "Fútbol 7" (como "Solo techadas" en pádel); solo quedan los lugares y horarios con canchas de ese tamaño. El link `index.html?rubro=futbol&tam=7` abre los de 7.
- **Ficha:** con un tamaño elegido, los días, los horarios y la cancha que se reserva son solo de ese tamaño; si el lugar tiene de los dos, al lado de "Horarios de…" hay un "Cancha" para cambiarlo.
- Los de ejemplo: El Potrero (dos de 5 y una de 7), La Quinta (dos de 7) y Los Cerros (dos de 5).
- En la página de cada negocio, las fotos que sobran de las tarjetas van abajo **hasta tres, en una sola fila** (pedido del dueño, 26/11: "la cuarta ocupa mucho espacio").

## "Cuándo" con calendario (26/11)
Pedido del dueño: "donde dice Cuándo, se debería abrir un calendario". En el buscador del inicio, "Cuándo" es un botón con un ícono de calendario que abre un calendario debajo del campo (300 px, sombra grande, radio de las tarjetas): el mes de hoy, de lunes a domingo, y si los 7 días que se pueden reservar pasan al mes siguiente, también esa semana ("Noviembre y diciembre 2026"), así que siempre se ven todos juntos, sin flechas. Los días que se pueden elegir (hoy y los 6 siguientes, los mismos de los resultados y la ficha) van en negro, hoy con un borde, el elegido en naranja; el resto, apagado. Abajo: "Hay turnos para reservar hasta el miércoles 2/12". Se cierra al elegir, al tocar afuera, con Escape o saliendo con Tab; con el teclado, las flechas se mueven entre los días. `pintarCal`/`abrirCal` en `sitio.js`.

## Fotos de pádel del dueño (26/11)
"Estas 4 fotos son mías, utilizalas en todo lo que sea pádel; mezclalas con otras que tenemos de pádel." Están en `assets/p-saque.webp`, `p-reves.webp`, `p-salto.webp` y `p-espera.webp` (recortadas abajo para sacar la franja de logos de los sponsors del torneo, y sin los datos de la cámara). La foto de Pádel del buscador (`r-padel.webp`) es un recorte de la del saque; la genérica que había quedó como `m-padel-juego.webp`. Los lugares de pádel de ejemplo las mezclan con las que ya había: Los Álamos (saque, revés, salto: su página muestra las tres), Aconcagua (canchas, espera, juego), La Terraza (paletas, salto, canchas) y Valle de Uco (juego, revés, espera).

## Cobrar la seña con Mercado Pago (26/11)
Pedido del dueño: "ahora vamos a hacer lo de Mercado Pago", con comisión por seña. Cada negocio conecta su cuenta y la seña entra en su Mercado Pago; Bookea se queda con su comisión (no se muestra en la página). Cómo anda por dentro y cómo se pone en marcha: "Cobrar la seña con Mercado Pago" en `supabase/LEEME.md`.
- **Panel, Mi negocio:** una franja a lo ancho entre "Seña y cancelaciones" y "Cómo es el lugar" (`.ng-card--mp`): en la compu, el título a la izquierda y a la derecha el estado (pastilla verde "Conectada", gris "Sin conectar", rosada "Hay que conectarla de nuevo"), una línea de qué pasa ("Tu negocio ya aparece en bookea.ar, pero mientras no la conectes los turnos se toman sin seña…") y la acción: **"Conectar Mercado Pago" en naranja** (la acción clave) o "Desconectar" en línea, con confirmación en el lugar ("¿Desconectarla? La seña deja de cobrarse: los turnos se toman sin seña."). Debajo, "Cuenta N° …, conectada el …, N señas cobradas" en gris y, si alguna seña no se pudo devolver, un aviso rosado. Solo el dueño conecta o desconecta; el resto del equipo ve el estado y "Solo el dueño del negocio la conecta o la desconecta". En la versión de prueba dice "Versión de prueba" y no tiene botón. En el celular, todo apilado.
- **Conectar sin perder el panel:** "Conectar Mercado Pago" abre Mercado Pago en otra pestaña (el panel pide la contraseña en cada carga, así que no se va de la pestaña). Al volver, esa pestaña muestra una caja blanca con el tilde verde agua, "Mercado Pago quedó conectado" e "Ya podés cerrar esta pestaña: el panel sigue abierto en la otra", y se cierra sola; el panel se entera (BroadcastChannel) y la tarjeta pasa a "Conectada" sin recargar, con un aviso. Si el navegador no deja abrir otra pestaña, va en la misma y al entrar de nuevo lleva a Mi negocio con el aviso.
- **Agenda:** el turno de bookea.ar que se está pagando dice "Esperando la seña" (si no se paga en 20 minutos, sale solo de la agenda).
- **Página, pagar:** con un negocio que cobra, la nota dice "Pagás la seña en Mercado Pago, con tarjeta o con el dinero de tu cuenta. El turno queda confirmado apenas se acredita." "Pagar seña con Mercado Pago" muestra "Te llevamos a Mercado Pago" y va a Mercado Pago. Al volver, la misma pantalla blanca con la ruedita: "Confirmando tu pago" mientras se le pregunta a Mercado Pago, y después Mis turnos con "¡Listo, tu turno está confirmado!".
- **Mis turnos, esperando el pago:** la tarjeta del turno con borde naranja claro, la pastilla "ESPERANDO EL PAGO" (naranja sobre naranja pálido), "te lo guardamos hasta las 21:40", "Seña a pagar" y los botones **"Pagar seña"** (naranja) y "Cancelar". Si volvió sin pagar, arriba una franja naranja pálida con el reloj: "La seña todavía no se pagó · Probá de nuevo antes de las 21:40" y "Pagar seña"; si el pago está en proceso, "Tu pago se está procesando".
- **Sin seña (pregunta del dueño, 27/11: "un negocio que no quiere cobrar seña"; y "si no conectan con Mercado Pago deben aparecer de igual forma"):** con la seña en 0 %, o sin Mercado Pago conectado (la página recibe la seña en 0), el negocio está en la lista y la ficha dice "Sin seña" (arriba, en los precios y en Pagos), el aviso verde dice "sin seña" y **"Reservar"** (no "Ir a pagar"), y la pantalla es la misma "Confirmá tu turno" con "Seña: Sin seña", "En el lugar" grande, el botón **"Confirmar turno"**, "Este lugar no pide seña…" y los pasos "Confirmás el turno / Te llega por mail / Pagás en el lugar". Al tocarlo, "Confirmando tu turno" y Mis turnos con "¡Listo, tu turno está confirmado! … Lo pagás en el lugar."; la tarjeta dice "Sin seña". En el panel, la ayuda de la seña dice "En 0 %, sin seña…" y la franja de Mercado Pago, la pastilla verde "Sin seña" con "Conectar Mercado Pago" en línea (no en naranja: no hace falta). Los mails dicen "Sin seña", sin "en prueba".
- **Mails:** el de turno confirmado sale recién cuando se acredita la seña, y dice "$ 7.000 · pagada con Mercado Pago" (al negocio: "pagada con Mercado Pago (ya está en tu cuenta)"); al cancelar con tiempo, "se devuelve por Mercado Pago (puede tardar unos días en verse)". La línea "Bookea está en prueba" queda solo en los lugares de ejemplo.
