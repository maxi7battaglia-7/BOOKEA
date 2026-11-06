#!/usr/bin/env bash
# Copias temporales del panel que entran solas con la cuenta demo, para que el inspector
# de la skill (que no sabe escribir una contraseña) pueda medir cada vista. No se publican.
cd "$(dirname "$0")/.."
for v in entrada agenda finanzas clientes negocio cuenta; do
  if [ "$v" = entrada ]; then extra=""; else extra="<script>
addEventListener('load', () => setTimeout(() => {
  const u = document.querySelector('#i-usuario'), c = document.querySelector('#i-clave');
  if (!u) return; u.value = 'losalamos'; c.value = 'bookea2026';
  document.querySelector('#f-ingresar button[type=submit]').click();
  setTimeout(() => { const b = document.querySelector('[data-vista=\"$v\"]'); if (b) b.click(); }, 500);
}, 50));
</script>"; fi
  python3 - "$v" "$extra" <<'PY'
import sys
v, extra = sys.argv[1], sys.argv[2]
s = open('admin.html').read()
s = s.replace('</body>', extra + '\n</body>')
open(f'_insp-{v}.html', 'w').write(s)
PY
done
