#!/usr/bin/env python3
"""Una sola fuente para la cara de los mails de Bookea.

Arma, con el mismo marco (franja noche con el logo, línea verde agua y naranja, fondo crema
y el lema al pie):
  - supabase/mails/confirmar-cuenta.html y contrasena-nueva.html (plantillas de Supabase Auth);
  - la función mail_bookea() de supabase/avisos-por-mail.sql (avisos desde la base), entre las
    marcas "generado por scripts/mails.py".
Y revisa que el lema sea el mismo en el pie del inicio (index.html).

Para cambiar colores, logo o lema: tocá este archivo y corré `python3 scripts/mails.py`.
"""
from armado import ROOT, leer

LEMA = "Reservá turnos en segundos."
LOGO = "https://bookea.ar/marca/isotipo-192.png"

ARRIBA = (
    '<div style="background:#f5ecd7;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#11151c">\n'
    '  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border-collapse:separate">\n'
    '    <tr><td bgcolor="#11151c" style="background:#11151c;padding:22px 28px">\n'
    f'      <img src="{LOGO}" width="36" height="36" alt="" style="vertical-align:middle;border:0">\n'
    '      <span style="font-size:22px;font-weight:bold;letter-spacing:-0.3px;vertical-align:middle;margin-left:10px;color:#f5ecd7">Bookea</span>\n'
    '    </td></tr>\n'
    '    <tr><td style="padding:0;line-height:0;font-size:0">\n'
    '      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>\n'
    '        <td width="62%" height="6" bgcolor="#1fa08c" style="background:#1fa08c;height:6px;line-height:6px;font-size:0">&nbsp;</td>\n'
    '        <td width="38%" height="6" bgcolor="#e4572e" style="background:#e4572e;height:6px;line-height:6px;font-size:0">&nbsp;</td>\n'
    '      </tr></table>\n'
    '    </td></tr>\n'
)
ABAJO = (
    '  </table>\n'
    f'  <p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6f6656;text-align:center"><b style="color:#11151c">Bookea</b> · {LEMA}<br><a href="https://bookea.ar" style="color:#6f6656">bookea.ar</a></p>\n'
    '</div>\n'
)
TITULO = '<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;color:#11151c">'
TEXTO = '<p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#3d4350">'
BOTON = 'style="display:inline-block;background:#1fa08c;color:#11151c;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 24px;border-radius:6px"'
NOTA = '<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#5b6170">'
URL = "{{ .ConfirmationURL }}"


def plantilla(titulo, texto, boton, nota):
    """Un mail de Supabase Auth: el botón y el link de respaldo llevan {{ .ConfirmationURL }}."""
    return (
        "<!-- Generado por scripts/mails.py: no editar a mano. Plantilla de Supabase (Authentication → Emails → Templates). -->\n"
        + ARRIBA
        + '    <tr><td style="padding:30px 28px 8px">\n'
        + f"      {TITULO}{titulo}</h1>\n"
        + f"      {TEXTO}{texto}</p>\n"
        + f'      <a href="{URL}" {BOTON}>{boton}</a>\n'
        + f"      {NOTA}{nota}</p>\n"
        + "    </td></tr>\n"
        + '    <tr><td style="padding:20px 28px 28px;font-size:12px;line-height:1.5;color:#7b818d">\n'
        + '      <div style="border-top:1px solid #eee5d1;padding-top:16px">Si el botón no funciona, copiá este link en el navegador:<br>\n'
        + f'      <a href="{URL}" style="color:#0f5e52;word-break:break-all">{URL}</a></div>\n'
        + "    </td></tr>\n"
        + ABAJO
    )


# El mismo mail de confirmación le llega al dueño que se registra y a quien entra con una
# invitación de Equipo (su negocio ya está aprobado). {{ .Data }} son los datos de la cuenta:
# nube.js guarda "invitacion" ahí al registrarse con el link.
CONFIRMAR = plantilla(
    "Confirmá tu email",
    "{{ if .Data.invitacion }}"
    "Te sumaron al equipo de un negocio en Bookea. Tocá el botón para confirmar tu email y después entrás al panel con tu email y tu contraseña."
    "{{ else }}"
    "Creaste una cuenta en Bookea con este email. Tocá el botón para confirmarlo. Después revisamos tu negocio y, cuando esté aprobado, entrás al panel con tu email y tu contraseña."
    "{{ end }}",
    "Confirmar mi email",
    "Si no creaste una cuenta en Bookea, ignorá este mail: sin confirmar, la cuenta no se activa.",
)
CONTRASENA = plantilla(
    "Elegí una contraseña nueva",
    "Pediste cambiar la contraseña de tu cuenta de Bookea. Tocá el botón y elegí una nueva. El link sirve una sola vez y vence en una hora.",
    "Elegir contraseña nueva",
    "Si no lo pediste vos, ignorá este mail: tu contraseña sigue igual.",
)


def sql_texto(t):
    """Un texto como literal de SQL, en una línea (los mails no necesitan los saltos)."""
    return "'" + "".join(l.strip() for l in t.splitlines()).replace("'", "''") + "'"


MAIL_BOOKEA = f"""-- (generado por scripts/mails.py: inicio; no editar a mano)
-- La cara de todos los avisos: la misma de supabase/mails/. "cuerpo" ya viene escapado.
create or replace function public.mail_bookea(titulo text, cuerpo text, boton text default null,
  url text default null, nota text default null) returns text language sql immutable as $$
  select {sql_texto(ARRIBA)}
    || '<tr><td style="padding:30px 28px 30px">'
    || {sql_texto(TITULO)} || titulo || '</h1>'
    || '<div style="font-size:15px;line-height:1.55;color:#3d4350">' || cuerpo || '</div>'
    || coalesce('<a href="' || url || '" {BOTON.replace('display:inline-block;', 'display:inline-block;margin-top:12px;')}>' || boton || '</a>', '')
    || coalesce({sql_texto(NOTA)} || nota || '</p>', '')
    || '</td></tr>'
    || {sql_texto(ABAJO)}
$$;
-- (generado por scripts/mails.py: fin)"""

if __name__ == "__main__":
    import sys
    revisar = "--revisar" in sys.argv  # solo compara: falla si alguien editó a mano lo generado
    sql = leer("supabase/avisos-por-mail.sql")
    ini, fin = "-- (generado por scripts/mails.py: inicio", "-- (generado por scripts/mails.py: fin)"
    a, b = sql.index(ini), sql.index(fin) + len(fin)
    archivos = {
        "supabase/mails/confirmar-cuenta.html": CONFIRMAR,
        "supabase/mails/contrasena-nueva.html": CONTRASENA,
        "supabase/avisos-por-mail.sql": sql[:a] + MAIL_BOOKEA + sql[b:],
    }
    distintos = [n for n, t in archivos.items() if leer(n) != t]
    assert f'<p class="foot__tag">{LEMA}</p>' in leer("index.html"), f"el pie de index.html no tiene el lema «{LEMA}»"
    if revisar:
        assert not distintos, f"desactualizados (corré python3 scripts/mails.py): {distintos}"
        print("OK  los mails coinciden con scripts/mails.py y el lema es el mismo que en el pie del inicio")
    else:
        for n in distintos:
            (ROOT / n).write_text(archivos[n], encoding="utf-8")
        print("OK -> mails de Supabase y mail_bookea() al día; lema revisado en el pie del inicio")
