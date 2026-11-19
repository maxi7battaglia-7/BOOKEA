#!/usr/bin/env python3
"""Genera la vista previa para publicar como página de claude.ai, con el CSS y el JS adentro.

- dist/bookea.html: la landing. claude.ai le agrega el esqueleto (<!doctype>, <head>, <body>).
- dist/reservar.html y dist/admin.html: se publican como archivos aparte, así que llevan su
  documento completo. Sus links a la landing apuntan a "./", la raíz de la página publicada.
  reservar.html solo redirige al inicio, donde ahora están las reservas.
- Las fotos (assets/*.webp) y las letras (assets/fuentes/*.woff2) se publican como archivos aparte.

Las páginas piden sus archivos con ?v=N (para que el navegador no use una versión vieja).
Acá ese número se saca antes de meter cada archivo adentro, así que no hay que tocar nada al subirlo.
"""
import re

from armado import ROOT as root, adentro, leer, pagina

dist = root / "dist"
dist.mkdir(exist_ok=True)


def sin_iconos(html):
    return re.sub(r'\s*<link rel="(?:icon|apple-touch-icon)"[^>]*>', "", html)  # el ícono lo pone claude.ai


# ---------- Inicio (el frente: buscar, resultados, ficha, pagar la seña, Mis turnos y la parte para negocios) ----------
html = pagina("index.html")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
for js in ("config.js", "cuenta.js", "sitio.js", "toque.js"):
    assert f'<script src="{js}"></script>' in body, js
    body = body.replace(f'<script src="{js}"></script>', "")
# Las letras (assets/fuentes/) y las fotos (assets/) se publican como archivos al lado de la página
landing = f"""<title>Bookea · Reservá turnos en segundos</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
{leer("sitio.css")}
</style>
{body.strip()}
<script>
window.BOOKEA_CONFIG = {{}}; // la vista previa va siempre en modo de prueba: las cuentas de clientes quedan en el navegador
</script>
<script>
{leer("cuenta.js")}
</script>
<script>
{leer("sitio.js")}
</script>
<script>
{leer("toque.js")}
</script>
"""
(dist / "bookea.html").write_text(landing, encoding="utf-8")
print("OK ->", dist / "bookea.html", f"({len(landing)//1024} KB)")

# ---------- Privacidad y condiciones: página aparte, con su CSS adentro ----------
priv = sin_iconos(adentro(pagina("privacidad.html"), "sitio.css"))
(dist / "privacidad.html").write_text(priv, encoding="utf-8")
print("OK ->", dist / "privacidad.html", f"({len(priv)//1024} KB)")

# ---------- reservar.html: solo redirige al inicio (links viejos) ----------
(dist / "reservar.html").write_text(leer("reservar.html"), encoding="utf-8")
print("OK ->", dist / "reservar.html")

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
