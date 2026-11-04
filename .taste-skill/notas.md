# Notas de diseño: Bookea (tasteskill)

## Inventario del sujeto
- Nombre: Bookea (de "bookear": reservar). Producto: agenda online con seña para canchas y barberías.
- Lugar: Mendoza. Valle de Uco (Tunuyán, Tupungato, San Carlos), San Rafael, Gran Mendoza. Acequias y plátanos, la cordillera.
- Ritual: la siesta (13 a 17 cierran las barberías), la noche en las canchas (turnos hasta 00:30), el turno fijo de los martes.
- Números: turno de pádel de 90 min, fútbol 5 de 60 min, seña del 25%, precio por franja (tarde / noche).
- Objetos impresos del rubro: la planilla de turnos en cuaderno, el comprobante de transferencia, el mensaje de WhatsApp.
- Restricción: la plata va directo al Mercado Pago del negocio. Sin app para el cliente.
- Colores fijos: camiseta del Venezia (noche, naranja, verde agua, crema) y la franja diagonal del pecho.

## Argumento
- Hero: Bookea cobra la seña y confirma por WhatsApp sola → la agenda funcionando.
- Planteo: cada hueco en la agenda es plata → cancha vacía, polvo de ladrillo, sillón.
- Cómo funciona: armás, compartís y te reservan con seña → lo que das / lo que vuelve.
- Buscador: tu cliente escribe como habla y encuentra turno → input vivo.
- Funciones: seña, WhatsApp, turnos fijos, precio por horario, cancelaciones, sin app → piezas de interfaz.
- Mendoza: somos de acá y vamos a tu negocio → carta + fotos del Valle y de una acequia.
- Precios: piloto gratis, sin comisión → una cifra viva.
- Sumate: formulario. Preguntas. Pie.

## Idea
En esta página, la agenda de una noche en un club de pádel de Mendoza (canchas por horario, seña, turno fijo de los martes, siesta en la barbería) se convierte en la pieza de producto que funciona sobre un escenario naranja con la esquina cortada como la franja de la camiseta.
Lo vivo: cambiar de rubro, tocar un horario libre y ver la reserva con seña y el WhatsApp de confirmación.

## Dirección
product-performs · semilla 1810978483 · --keep palette,type · sin redraws.
Excepción: palette-claude (crema + naranja) se mantiene porque son colores fijos de la marca (pedido del dueño).

## ROUND 1
Seen in one second: un título negro grande y una agenda real sobre un bloque naranja con corte diagonal.
Idea (one sentence): la agenda de una noche de pádel en Mendoza es la pieza que actúa en el hero.
Live thing: la agenda (rubros + reservar un horario libre) y el buscador.
Layout words by section: hero=escenario con fragmento / planteo=frase con miniaturas / cómo funciona=columna llamada-respuesta / buscador=titular que se escribe / funciones=damero de celdas / Mendoza=foto completa + carta y foto / precios=índice con cifra viva / sumate=campo naranja con formulario / preguntas=título fijo + acordeón de tiles / pie=tiles.
Scores: design 7.5 · usability 8 · creativity 7.5 · content 8 → overall 7.7.
Caps applied: ninguno.
Top three problems:
1. Celular: el texto de ejemplo de "Primero, armás tu agenda" se cortaba en un input de una línea → pasado a párrafo.
2. Pie (desktop-page-03): el logo queda chico dentro del bloque noche → escala 2x sin sumar otra medida.
3. Tablet: titular "Sumá tu negocio al piloto." en 3 líneas y la columna de "Así funciona" desbordaba → columnas apiladas en tablet.
