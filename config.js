// Bookea — conexión con la base de datos.
//
// Vacío = modo de prueba: el panel guarda las cuentas y los datos solo en este navegador.
// Para guardar de verdad (cada cuenta con su negocio, desde cualquier dispositivo), pegá acá
// los datos de tu proyecto de Supabase: Project Settings → API → "Project URL" y la clave
// "anon public". Esa clave es pública a propósito: lo que protege los datos son las reglas
// de la base (supabase/esquema.sql). La clave "service_role" NUNCA va acá.
// Paso a paso en supabase/LEEME.md.
window.BOOKEA_CONFIG = {
  supabaseUrl: "",      // por ejemplo "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",  // empieza con "eyJ..."
};
