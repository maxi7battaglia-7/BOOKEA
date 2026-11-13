// Bookea — conexión con la base de datos.
//
// Vacío = modo de prueba: el panel guarda las cuentas y los datos solo en este navegador.
// Para guardar de verdad (cada cuenta con su negocio, desde cualquier dispositivo), pegá acá
// los datos de tu proyecto de Supabase: Project Settings → API Keys → la "Publishable key"
// (o la "anon public" de las claves viejas) y la dirección del proyecto (Data API → Project URL).
// Esa clave es pública a propósito: lo que protege los datos son las reglas de la base
// (supabase/esquema.sql). La "Secret key" o "service_role" NUNCA va acá.
// Paso a paso en supabase/LEEME.md.
window.BOOKEA_CONFIG = {
  supabaseUrl: "https://vpxzuutavdjwglglbvdt.supabase.co",
  supabaseAnonKey: "sb_publishable_-dP0JUk8qmMnoymRWu449Q_8e80IF4l",  // clave pública ("publishable")
};
