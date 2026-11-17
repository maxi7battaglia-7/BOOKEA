#!/usr/bin/env python3
"""Arma Bookea para usar sin internet: dist/bookea-sin-internet.zip.

Adentro van index.html, reservar.html y admin.html, cada una con todo metido adentro
(CSS, JS, fotos, logo y la letra Archivo), así que funcionan abriendo el archivo en el
navegador, sin conexión. El panel va en modo de prueba (config.js vacío): los datos quedan
guardados solo en ese navegador. Cuenta de prueba: demo@example.com / bookea2026.

Necesita fonttools y brotli (pip install fonttools brotli) para achicar la letra.
"""
import base64, io, mimetypes, re, zipfile
from fontTools import subset
from fontTools.ttLib import TTFont

from armado import ROOT as root, adentro, pagina

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


RUTA = r"(?:assets|marca)/[\w.-]+\.(?:webp|png|svg|jpg)"
VACIA = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
# Una foto que aparece en varios <img> va adentro una sola vez: las demás copian su src al cargar
COPIAS = """<script>
document.querySelectorAll("img[data-copia]").forEach(function (i) {
  var o = document.querySelector('img[data-orig="' + i.getAttribute("data-copia") + '"]');
  if (o) i.src = o.src;
});
</script>"""


def armar(nombre, archivos):
    html = pagina(nombre)
    # la letra de Google Fonts se cambia por la de adentro
    html = re.sub(r'\s*<link rel="preconnect"[^>]*>', "", html)
    html = re.sub(r'<link href="https://fonts.googleapis.com[^>]+>', LETRA, html)
    for a in archivos:
        html = adentro(html, a, "window.BOOKEA_CONFIG = {};" if a == "config.js" else None)
    # fotos repetidas en <img>: la primera lleva la foto, las otras la copian
    vistas, repetidas = set(), False
    def img(m):
        nonlocal repetidas
        ruta = m.group(2)
        clave = ruta.rsplit("/", 1)[1]
        if ruta in vistas:
            repetidas = True
            return f'{m.group(1)}src="{VACIA}" data-copia="{clave}"'
        vistas.add(ruta)
        return f'{m.group(1)}data-orig="{clave}" src="{ruta}"'
    html = re.sub(rf'(<img\b[^>]*?\s)src="({RUTA})"', lambda m: img(m), html)
    if repetidas:
        html = html.replace("</body>", COPIAS + "\n</body>")
    # el resto (las primeras, íconos y las que arma el JS, como "assets/r-padel.webp"): adentro
    #    solo entre comillas o en url(...): una ruta nombrada en un comentario queda como texto
    uris = {}
    def poner(m):
        ruta = m.group(2)
        if not (root / ruta).exists():
            return m.group(0)
        if ruta not in uris:
            uris[ruta] = data_uri(ruta)
        return m.group(1) + uris[ruta]
    html = re.sub(rf"""(["'(])({RUTA})""", poner, html)
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
