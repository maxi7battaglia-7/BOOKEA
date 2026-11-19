#!/usr/bin/env bash
# Copias temporales del panel que entran solas con la cuenta demo, para que el inspector
# de la skill (que no sabe escribir una contraseña) pueda medir cada vista. No se publican.
cd "$(dirname "$0")/.."
for v in entrada agenda finanzas clientes negocio cuenta; do
  if [ "$v" = entrada ]; then extra=""; else extra="<script>
addEventListener('load', () => setTimeout(() => {
  const u = document.querySelector('#i-email'), c = document.querySelector('#i-clave');
  if (!u) return; u.value = 'demo@example.com'; c.value = 'bookea2026';
  document.querySelector('#f-ingresar button[type=submit]').click();
  // la bienvenida (el saludo) se va con una tecla: así el inspector mide la vista y no el saludo
  setTimeout(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); const b = document.querySelector('[data-vista=\"$v\"]'); if (b) b.click(); }, 500);
}, 50));
</script>"; fi
  python3 - "$v" "$extra" <<'PY'
import sys
v, extra = sys.argv[1], sys.argv[2]
s = open('admin.html').read()
import re
s = re.sub(r'<script src="config\.js[^"]*"></script>', '<script>window.BOOKEA_CONFIG = {};</script>', s)  # siempre en modo de prueba
s = s.replace('</body>', extra + '\n</body>')
open(f'_insp-{v}.html', 'w').write(s)
PY
done
