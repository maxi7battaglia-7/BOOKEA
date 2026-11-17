#!/usr/bin/env python3
"""Genera la vista previa para publicar como página de claude.ai, con el CSS y el JS adentro.

- dist/bookea.html: la landing. claude.ai le agrega el esqueleto (<!doctype>, <head>, <body>).
- dist/reservar.html y dist/admin.html: se publican como archivos aparte, así que llevan su
  documento completo. Sus links a la landing apuntan a "./", la raíz de la página publicada.

Las páginas piden sus archivos con ?v=N (para que el navegador no use una versión vieja).
Acá ese número se saca antes de meter cada archivo adentro, así que no hay que tocar nada al subirlo.
"""
import re

from armado import ROOT as root, adentro, leer, pagina

dist = root / "dist"
dist.mkdir(exist_ok=True)


def sin_iconos(html):
    return re.sub(r'\s*<link rel="(?:icon|apple-touch-icon)"[^>]*>', "", html)  # el ícono lo pone claude.ai


# ---------- Landing ----------
html = pagina("index.html")
fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', html).group(0)
head_js = re.search(r"<head>.*?<script>(.*?)</script>", html, re.S).group(1)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
for js in ("script.js", "toque.js"):
    assert f'<script src="{js}"></script>' in body, js
    body = body.replace(f'<script src="{js}"></script>', "")

landing = f"""<title>Bookea</title>
<meta name="claude:viewport-fit-sides" content="cover">
<script>{head_js}</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
{fonts}
<style>
{leer("styles.css")}
</style>
{body.strip()}
<script>
{leer("script.js")}
</script>
<script>
{leer("toque.js")}
</script>
"""
(dist / "bookea.html").write_text(landing, encoding="utf-8")
print("OK ->", dist / "bookea.html", f"({len(landing)//1024} KB)")

# ---------- Reservas ----------
res = pagina("reservar.html")
for archivo in ("styles.css", "app.css", "reservar.js", "toque.js"):
    res = adentro(res, archivo)
res = sin_iconos(res)
res = res.replace('href="index.html#', 'href="./#').replace('href="index.html"', 'href="./"')
(dist / "reservar.html").write_text(res, encoding="utf-8")
print("OK ->", dist / "reservar.html", f"({len(res)//1024} KB)")

# ---------- Panel del negocio ----------
adm = pagina("admin.html")
for archivo in ("styles.css", "admin.css", "nube.js", "admin.js", "toque.js"):
    adm = adentro(adm, archivo)
# La vista previa siempre va en modo de prueba (sin base): config.js vacío, aunque el local tenga datos
adm = adentro(adm, "config.js", "window.BOOKEA_CONFIG = {};")
# ...y lo dice claro: con tu cuenta real se entra al panel publicado, no acá
PANEL = "https://bookea.ar/admin.html"
demo_viejo = '<p class="caja__demo solo-local"><b>Para probar:</b> email <code>demo@example.com</code> y contraseña <code>bookea2026</code>.</p>'
assert demo_viejo in adm, "cambió el aviso de la cuenta de prueba en admin.html"
adm = adm.replace(demo_viejo, '<p class="caja__demo solo-local"><b>Esto es una vista de prueba:</b> tu cuenta real no entra acá. '
                  f'Para entrar con tu email abrí <a href="{PANEL}" target="_blank" rel="noopener">el panel publicado</a>. '
                  'Para mirar, usá email <code>demo@example.com</code> y contraseña <code>bookea2026</code>.</p>')
adm = sin_iconos(adm)
adm = adm.replace('href="index.html"', 'href="./"')
(dist / "admin.html").write_text(adm, encoding="utf-8")
print("OK ->", dist / "admin.html", f"({len(adm)//1024} KB)")
