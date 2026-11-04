"""Genera marca/lamina.html: la lámina de construcción del isotipo de Bookea (Franja Exacta).
La geometría es la misma de isotipo.svg; se vuelve a escribir acá para poder acotarla."""
import math
from pathlib import Path

AQUI = Path(__file__).resolve().parent
N, O, V, C = "#11151c", "#e4572e", "#1fa08c", "#f5ecd7"
PLACA = "#171c26"

T = math.tan(math.radians(10))
X0, Y0 = 391, 446
yl = lambda x: Y0 + (x - X0) * T
UP = "M391,180 H520 A175,175 0 0 1 520,530 H391 Z"
LO = "M391,426 H545 A197,197 0 0 1 545,820 H391 Z"
CU = "M391,284 H520 A71,71 0 0 1 520,426 H391 Z"
CL = "M391,530 H545 A93,93 0 0 1 545,716 H391 Z"
DX = 8


def b(uid, stem, top, bottom, tile=None, rx=200):
    """Una B en un lienzo de 1000; uid evita choques de ids entre copias."""
    teal = f"0,0 1000,0 1000,{yl(1000):.2f} 0,{yl(0):.2f}"
    orng = f"0,{yl(0):.2f} 1000,{yl(1000):.2f} 1000,1000 0,1000"
    fondo = f'<rect width="1000" height="1000" rx="{rx}" fill="{tile}"/>' if tile else ""
    return f"""<defs><mask id="m{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">
<path d="{UP}" fill="#fff"/><path d="{LO}" fill="#fff"/><path d="{CU}" fill="#000"/><path d="{CL}" fill="#000"/></mask></defs>
{fondo}<g transform="translate({DX},0)"><g mask="url(#m{uid})"><polygon points="{teal}" fill="{top}"/><polygon points="{orng}" fill="{bottom}"/></g>
<rect x="255" y="180" width="136" height="640" fill="{stem}"/></g>"""


def icono(uid, px, **kw):
    return f'<svg viewBox="0 0 1000 1000" width="{px}" height="{px}" aria-hidden="true">{b(uid, **kw)}</svg>'


# ---------- Placa de construcción (unidades del lienzo de 1000, desplazadas DX) ----------
g = []
linea = 'stroke="#f5ecd7" stroke-opacity="0.16" stroke-width="1.6"'
fina = 'stroke="#f5ecd7" stroke-opacity="0.42" stroke-width="1.6" fill="none"'
for y in (180, 284, 426, 530, 716, 820):
    g.append(f'<line x1="40" y1="{y}" x2="960" y2="{y}" {linea}/>')
for x in (255, 391, 520, 545, 695, 742):
    g.append(f'<line x1="{x + DX}" y1="40" x2="{x + DX}" y2="960" {linea}/>')
# círculos que dibujan cada curva, con sus centros
for cx, cy, r in ((520, 355, 175), (545, 623, 197), (520, 355, 71), (545, 623, 93)):
    g.append(f'<circle cx="{cx + DX}" cy="{cy}" r="{r}" {fina} stroke-dasharray="6 9"/>')
for cx, cy in ((520, 355), (545, 623)):
    X = cx + DX
    g.append(f'<path d="M{X - 14},{cy} H{X + 14} M{X},{cy - 14} V{cy + 14}" stroke="{C}" stroke-opacity="0.8" stroke-width="2"/>')
# la diagonal de 10° prolongada y su ángulo
xa, xb = 300, 960
g.append(f'<line x1="{xa + DX}" y1="{yl(xa):.1f}" x2="{xb + DX}" y2="{yl(xb):.1f}" {fina} stroke-dasharray="2 7"/>')
VX = 790  # vértice de la medición, ya afuera de la letra
VY = yl(VX)
g.append(f'<line x1="{VX + DX}" y1="{VY:.1f}" x2="{VX + DX + 150}" y2="{VY:.1f}" {fina}/>')
ra = 120
ex, ey = VX + DX + ra * math.cos(math.radians(10)), VY + ra * math.sin(math.radians(10))
g.append(f'<path d="M{VX + DX + ra},{VY:.1f} A{ra},{ra} 0 0 1 {ex:.1f},{ey:.1f}" {fina}/>')

txt = 'font-family="DM Mono" font-size="19" fill="#f5ecd7" fill-opacity="0.72" letter-spacing="0.5"'
cotas = [
    # ancho del asta, arriba
    f'<path d="M{255 + DX},132 V152 M{391 + DX},132 V152 M{255 + DX},142 H{391 + DX}" stroke="{C}" stroke-opacity="0.55" stroke-width="1.6"/>',
    f'<text x="{323 + DX}" y="118" text-anchor="middle" {txt}>136</text>',
    # alto total, a la izquierda
    f'<path d="M190,180 H210 M190,820 H210 M200,180 V820" stroke="{C}" stroke-opacity="0.55" stroke-width="1.6"/>',
    f'<text x="176" y="506" text-anchor="end" {txt}>640</text>',
    # trazo horizontal, a la derecha de la panza superior
    f'<path d="M{742 + DX + 64},180 V284 M{742 + DX + 54},180 H{742 + DX + 74} M{742 + DX + 54},284 H{742 + DX + 74}" stroke="{C}" stroke-opacity="0.55" stroke-width="1.6"/>',
    f'<text x="{742 + DX + 88}" y="238" {txt}>104</text>',
    # radios
    f'<text x="{391 + DX + 22}" y="{426 - 18}" {txt}>r 71</text>',
    f'<text x="{520 + DX + 24}" y="{355 - 186}" {txt}>r 175</text>',
    f'<text x="{391 + DX + 22}" y="{716 - 20}" {txt}>r 93</text>',
    f'<text x="{545 + DX + 24}" y="{623 + 232}" {txt}>r 197</text>',
    f'<text x="{VX + DX + ra + 18}" y="{VY + 34:.1f}" {txt}>10°</text>',
]
placa = f"""<svg viewBox="0 0 1000 1000" width="760" height="760" aria-hidden="true">
<rect width="1000" height="1000" fill="{PLACA}"/>
{''.join(g)}
{b('placa', stem=C, top=V, bottom=O)}
{''.join(cotas)}
</svg>"""

reducciones = "".join(
    f'<figure class="red">{icono(f"r{px}", px, stem=C, top=V, bottom=O, tile=N if px > 0 else None)}<figcaption>{px}</figcaption></figure>'
    for px in (160, 96, 64, 40, 24, 16)
)

html = f"""<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><title>Bookea · Franja Exacta</title>
<style>
@font-face {{ font-family: "Bricolage Grotesque"; src: url("fuentes/BricolageGrotesque-Bold.ttf"); font-weight: 700; }}
@font-face {{ font-family: "Bricolage Grotesque"; src: url("fuentes/BricolageGrotesque-Regular.ttf"); font-weight: 400; }}
@font-face {{ font-family: "DM Mono"; src: url("fuentes/DMMono-Regular.ttf"); }}
@font-face {{ font-family: "Instrument Sans"; src: url("fuentes/InstrumentSans-Regular.ttf"); }}
* {{ box-sizing: border-box; margin: 0; }}
html, body {{ width: 1600px; height: 1000px; background: #0b0d12; color: {C}; }}
body {{ position: relative; font-family: "Instrument Sans", sans-serif; overflow: hidden; }}
.mono {{ font-family: "DM Mono", monospace; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(245,236,215,0.6); }}
.placa {{ position: absolute; left: 64px; top: 120px; width: 760px; height: 760px; }}
.placa-rot {{ position: absolute; left: 64px; top: 72px; }}
.der {{ position: absolute; left: 896px; top: 64px; width: 640px; }}
.firma {{ display: flex; align-items: center; gap: 28px; height: 120px; }}
.firma svg {{ flex: none; }}
.palabra {{ font-family: "Bricolage Grotesque"; font-weight: 700; font-size: 104px; letter-spacing: -0.045em; line-height: 1; }}
.sub {{ margin-top: 28px; }}
.bloque {{ position: absolute; left: 896px; width: 640px; }}
.reds {{ top: 300px; display: flex; align-items: flex-end; gap: 30px; height: 190px; }}
.red {{ display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 0; }}
.red svg {{ display: block; }}
.red figcaption {{ font-family: "DM Mono"; font-size: 12px; color: rgba(245,236,215,0.6); letter-spacing: 0.08em; }}
.paleta {{ top: 556px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }}
.sw {{ height: 96px; border-radius: 10px; }}
.sw-n {{ box-shadow: inset 0 0 0 1.5px rgba(245,236,215,0.22); }}
.sw-t {{ margin-top: 12px; font-size: 15px; }}
.sw-h {{ margin-top: 2px; font-family: "DM Mono"; font-size: 12px; letter-spacing: 0.08em; color: rgba(245,236,215,0.6); }}
.usos {{ top: 742px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }}
.uso {{ height: 138px; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 14px; }}
.uso .palabra {{ font-size: 50px; }}
.pie {{ position: absolute; left: 64px; right: 64px; bottom: 56px; display: flex; justify-content: space-between; }}
.rot {{ margin-bottom: 18px; }}
</style></head>
<body>
<p class="mono placa-rot">Lámina 01 · Construcción del isotipo</p>
<div class="placa">{placa}</div>

<div class="der">
  <div class="firma">{icono('firma', 120, stem=C, top=V, bottom=O, tile=N, rx=200)}<span class="palabra">Bookea</span></div>
  <p class="mono sub">Franja Exacta · B de turno · asta crema, panzas cortadas a 10°</p>
</div>

<div class="bloque reds">{reducciones}</div>

<div class="bloque paleta">
  <div><div class="sw sw-n" style="background:{N}"></div><p class="sw-t">Noche</p><p class="sw-h">#11151C</p></div>
  <div><div class="sw" style="background:{O}"></div><p class="sw-t">Naranja</p><p class="sw-h">#E4572E</p></div>
  <div><div class="sw" style="background:{V}"></div><p class="sw-t">Verde agua</p><p class="sw-h">#1FA08C</p></div>
  <div><div class="sw" style="background:{C}"></div><p class="sw-t">Crema</p><p class="sw-h">#F5ECD7</p></div>
</div>

<div class="bloque usos">
  <div class="uso" style="background:{C};color:{N}">{icono('u1', 64, stem=N, top=V, bottom=O)}<span class="palabra">Bookea</span></div>
  <div class="uso" style="background:{O};color:{N}">{icono('u2', 64, stem=N, top=N, bottom=N)}<span class="palabra">Bookea</span></div>
</div>

<div class="pie mono"><span>Bookea · Mendoza · 2026</span><span>Asta 136 · trazo 104 · radios 175 / 197 · diagonal 10°</span></div>
</body></html>
"""
(AQUI / "lamina.html").write_text(html, encoding="utf-8")
print("lamina.html generada")
