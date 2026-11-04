#!/usr/bin/env python3
"""Genera dist/bookea.html: un solo archivo (CSS y JS adentro) para publicar como página de claude.ai."""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "styles.css").read_text(encoding="utf-8")
js = (root / "script.js").read_text(encoding="utf-8")

fonts = re.search(r'<link href="https://fonts.googleapis.com[^>]+>', html).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="script.js"></script>', "").strip()

out = f"""<title>Bookea</title>
<meta name="claude:viewport-fit-sides" content="cover">
<script>document.documentElement.classList.add("js")</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
{fonts}
<style>
{css}
</style>
{body}
<script>
{js}
</script>
"""
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "bookea.html").write_text(out, encoding="utf-8")
print("OK ->", dist / "bookea.html", f"({len(out)//1024} KB)")
