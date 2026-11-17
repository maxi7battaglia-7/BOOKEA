"""Piezas compartidas por scripts/preview.py y scripts/sin-internet.py.

- leer(n): un archivo del proyecto como texto.
- pagina(n): una página sin los ?v=N con que pide sus archivos (el número es solo para el navegador).
- adentro(html, archivo, contenido): cambia el <link> o el <script> que pide `archivo` por su contenido.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def leer(nombre):
    return (ROOT / nombre).read_text(encoding="utf-8")


def pagina(nombre):
    return re.sub(r"(\.(?:css|js))\?v=\d+", r"\1", leer(nombre))


def adentro(html, archivo, contenido=None):
    contenido = leer(archivo) if contenido is None else contenido
    if archivo.endswith(".css"):
        pedido, puesto = f'<link rel="stylesheet" href="{archivo}" />', f"<style>\n{contenido}\n</style>"
    else:
        pedido, puesto = f'<script src="{archivo}"></script>', f"<script>\n{contenido}\n</script>"
    assert pedido in html, f"no encontré {pedido}"
    return html.replace(pedido, puesto)
