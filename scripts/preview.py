#!/usr/bin/env python3
"""Genera la vista previa para publicar como página de claude.ai, con el CSS y el JS adentro.

- dist/bookea.html: la landing. claude.ai le agrega el esqueleto (<!doctype>, <head>, <body>).
- dist/reservar.html: la página de reservas. Se publica como archivo aparte, así que lleva su
  documento completo. Sus links a la landing apuntan a "./", la raíz de la página publicada.
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
leer = lambda n: (root / n).read_text(encoding="utf-8")
dist = root / "dist"
dist.mkdir(exist_ok=True)

# ---------- Landing ----------
html = leer("index.html")
fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', html).group(0)
head_js = re.search(r"<head>.*?<script>(.*?)</script>", html, re.S).group(1)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="script.js"></script>', "").strip()

landing = f"""<title>Bookea</title>
<meta name="claude:viewport-fit-sides" content="cover">
<script>{head_js}</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
{fonts}
<style>
{leer("styles.css")}
</style>
{body}
<script>
{leer("script.js")}
</script>
"""
(dist / "bookea.html").write_text(landing, encoding="utf-8")
print("OK ->", dist / "bookea.html", f"({len(landing)//1024} KB)")

# ---------- Reservas ----------
res = leer("reservar.html")
res = res.replace('<link rel="stylesheet" href="styles.css" />', f"<style>\n{leer('styles.css')}\n</style>")
res = res.replace('<link rel="stylesheet" href="app.css" />', f"<style>\n{leer('app.css')}\n</style>")
res = res.replace('<script src="reservar.js"></script>', f"<script>\n{leer('reservar.js')}\n</script>")
res = re.sub(r'\s*<link rel="icon"[^>]*>', "", res)  # el ícono lo pone claude.ai
res = res.replace('href="index.html#', 'href="./#').replace('href="index.html"', 'href="./"')
(dist / "reservar.html").write_text(res, encoding="utf-8")
print("OK ->", dist / "reservar.html", f"({len(res)//1024} KB)")
