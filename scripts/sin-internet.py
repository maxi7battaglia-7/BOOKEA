#!/usr/bin/env python3
"""Arma Bookea para usar sin internet: dist/bookea-sin-internet.zip.

Adentro van index.html, reservar.html y admin.html, cada una con todo metido adentro
(CSS, JS, fotos, logo y la letra Archivo), así que funcionan abriendo el archivo en el
navegador, sin conexión. El panel va en modo de prueba (config.js vacío): los datos quedan
guardados solo en ese navegador. Cuenta de prueba: demo@example.com / bookea2026.

Necesita fonttools y brotli (pip install fonttools brotli) para achicar la letra.
"""
import base64, io, mimetypes, re, zipfile
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
leer = lambda n: (root / n).read_text(encoding="utf-8")
salida = root / "dist" / "sin-internet"
salida.mkdir(parents=True, exist_ok=True)
mimetypes.add_type("image/webp", ".webp")


def data_uri(ruta):
    p = root / ruta
    tipo = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
    return f"data:{tipo};base64,{base64.b64encode(p.read_bytes()).decode()}"


# La letra: Archivo variable (ancho y peso), solo con los caracteres del castellano, en woff2
def letra():
    f = TTFont(root / "marca/fuentes/Archivo-Variable.ttf")
    op = subset.Options()
    op.flavor = "woff2"
    op.layout_features = ["*"]
    s = subset.Subsetter(op)
    s.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + [0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20AC, 0x2192, 0x2190, 0x00B7])
    s.subset(f)
    b = io.BytesIO()
    f.flavor = "woff2"
    f.save(b)
    return base64.b64encode(b.getvalue()).decode()


LETRA = f"""<style>
@font-face {{
  font-family: "Archivo"; font-style: normal; font-display: swap;
  font-weight: 100 900; font-stretch: 62% 125%;
  src: url(data:font/woff2;base64,{letra()}) format("woff2");
}}
</style>"""


def armar(nombre, archivos, config=None):
    html = re.sub(r"(\.(?:css|js))\?v=\d+", r"\1", leer(nombre))
    # la letra de Google Fonts se cambia por la de adentro
    html = re.sub(r'\s*<link rel="preconnect"[^>]*>', "", html)
    html = re.sub(r'<link href="https://fonts.googleapis.com[^>]+>', LETRA, html)
    for a in archivos:
        cont = ("window.BOOKEA_CONFIG = {};" if a == "config.js" else leer(a))
        if a.endswith(".css"):
            pedido, puesto = f'<link rel="stylesheet" href="{a}" />', f"<style>\n{cont}\n</style>"
        else:
            pedido, puesto = f'<script src="{a}"></script>', f"<script>\n{cont}\n</script>"
        assert pedido in html, f"{nombre}: no encontré {pedido}"
        html = html.replace(pedido, puesto)
    # fotos, logo e íconos: adentro, también los que arma el JS ("assets/r-padel.webp")
    for ruta in sorted(set(re.findall(r"(?:assets|marca)/[\w.-]+\.(?:webp|png|svg|jpg)", html))):
        if (root / ruta).exists():
            html = html.replace(ruta, data_uri(ruta))
    assert "fonts.googleapis" not in html and "?v=" not in html, nombre
    (salida / nombre).write_text(html, encoding="utf-8")
    print("OK ->", salida / nombre, f"({len(html)//1024} KB)")


armar("index.html", ["styles.css", "script.js", "toque.js"])
armar("reservar.html", ["styles.css", "app.css", "reservar.js", "toque.js"])
armar("admin.html", ["styles.css", "admin.css", "config.js", "nube.js", "admin.js", "toque.js"])

LEEME = """Bookea sin internet
===================

1. Descomprimí este archivo (clic derecho > Extraer todo).
2. Abrí index.html con el navegador (doble clic). Desde ahí navegás a reservas y al panel.

El panel funciona en modo de prueba: lo que cargues queda guardado solo en ese navegador.
Para entrar: email demo@example.com y contraseña bookea2026.
Las cuentas reales (las de bookea.ar) necesitan internet: entrá a https://bookea.ar/admin.html
"""
zp = root / "dist" / "bookea-sin-internet.zip"
with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
    for n in ("index.html", "reservar.html", "admin.html"):
        z.write(salida / n, f"bookea/{n}")
    z.writestr("bookea/LEEME.txt", LEEME)
print("OK ->", zp, f"({zp.stat().st_size//1024} KB)")
