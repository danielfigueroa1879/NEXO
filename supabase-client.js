/* ============================================================
   NEXO — Cliente Supabase compartido
   ------------------------------------------------------------
   Este archivo se incluye en TODAS las páginas que necesitan la
   base de datos. Configura tus credenciales una sola vez aquí.

   Pasos:
   1) Crea proyecto en https://supabase.com  → copia URL y anon key
   2) Ejecuta supabase-schema.sql en el SQL Editor
   3) Rellena SUPABASE_URL y SUPABASE_ANON_KEY abajo
   ============================================================ */

const SUPABASE_URL      = 'https://wzzvfycrbkgholazxmnq.supabase.co';       // solo el dominio base, sin /rest/v1/…
const SUPABASE_ANON_KEY = 'sb_publishable_Ksaisk6CWNecrUnI9fD3wg_dxnO_TsB';  // clave pública "publishable" o "anon"

// Cliente global (usa el bundle UMD cargado por <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2">)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
window.sb = sb;

/* ------------------------------------------------------------
   Helpers — RUT chileno como identidad de login
   Supabase Auth exige email, así que mapeamos:
       RUT "12.345.678-9"  →  "12345678-9@rut.nexo"
   El RUT real igual se guarda en la tabla `cuentas`.
   ------------------------------------------------------------ */
function normalizaRut(rut) {
  return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}
function rutAEmail(rut) {
  const limpio = normalizaRut(rut);
  if (!limpio) return '';
  // "12345678-9@rut.nexo"  (agregamos guión antes del dígito verificador)
  return limpio.slice(0, -1) + '-' + limpio.slice(-1) + '@rut.nexo';
}
window.rutAEmail = rutAEmail;
window.normalizaRut = normalizaRut;

/* ------------------------------------------------------------
   AUTH
   ------------------------------------------------------------ */
async function nexoSignUp({ rut, password, nombre, email, telefono, tipo, empresa }) {
  const authEmail = rutAEmail(rut);
  if (!authEmail) throw new Error('RUT inválido');

  const { data, error } = await sb.auth.signUp({
    email: authEmail,
    password,
    options: { data: { rut, nombre, tipo } }
  });
  if (error) throw error;

  // Guarda la fila en `cuentas` (upsert por si ya existía)
  const user = data.user;
  if (user) {
    const { error: e2 } = await sb.from('cuentas').upsert({
      id: user.id,
      rut,
      nombre,
      email: email || null,
      telefono: telefono || null,
      tipo: tipo || null,
      empresa: empresa || null,
      perfiles: []
    }, { onConflict: 'id' });
    if (e2) throw e2;
  }
  return data;
}

async function nexoSignIn({ rut, password }) {
  const authEmail = rutAEmail(rut);
  const { data, error } = await sb.auth.signInWithPassword({ email: authEmail, password });
  if (error) throw error;
  return data;
}

async function nexoSignOut() {
  await sb.auth.signOut();
}

async function nexoUsuarioActual() {
  const { data } = await sb.auth.getUser();
  return data.user || null;
}

/* ------------------------------------------------------------
   CUENTAS  (tabla `public.cuentas`)
   ------------------------------------------------------------ */
async function guardarCuenta(datos) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('No hay sesión activa');

  // Mapear alias (mail/tel/dir) al nombre real de columna, sin incluir
  // campos que el caller no pasó (para no sobrescribirlos con null).
  const alias = { mail: 'email', tel: 'telefono', dir: 'direccion' };
  const columnas = ['rut','nombre','email','telefono','direccion','patente',
                    'perfiles','tema','pago','tipo','empresa','estado'];
  const payload = { id: user.id };
  for (const [k, v] of Object.entries(datos || {})) {
    const col = alias[k] || k;
    if (columnas.includes(col) && v !== undefined) payload[col] = v;
  }

  // ¿Ya existe la fila? Si no, es el primer guardado tras signup
  const { data: existente } = await sb.from('cuentas').select('id').eq('id', user.id).maybeSingle();
  const query = existente
    ? sb.from('cuentas').update(payload).eq('id', user.id).select().single()
    : sb.from('cuentas').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function obtenerCuenta() {
  const user = await nexoUsuarioActual();
  if (!user) return null;
  const { data, error } = await sb.from('cuentas').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

async function listarCuentas() {
  // Para admin. Con la anon key SOLO devuelve la fila del usuario logueado
  // (por RLS). Para ver todas las cuentas se usa la service_role key en
  // un backend/función; aquí devolvemos lo que RLS permita.
  const { data, error } = await sb.from('cuentas')
    .select('*, documentos(*)')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ------------------------------------------------------------
   DOCUMENTOS  (Storage + tabla `public.documentos`)
   ------------------------------------------------------------ */
async function subirDocumento({ tipo, file, titulo }) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Debes iniciar sesión para subir documentos');

  const ext  = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${user.id}/${tipo}.${ext}`;

  const { error: eUp } = await sb.storage.from('documentos')
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (eUp) throw eUp;

  const payload = { cuenta_id: user.id, tipo, nombre: file.name, path, tamano: file.size };
  if (titulo) payload.titulo = titulo;
  const { data, error } = await sb.from('documentos')
    .upsert(payload, { onConflict: 'cuenta_id,tipo' })
    .select().single();
  if (error) throw error;
  return data;
}

// Guardar solo el título personalizado (sin subir archivo)
async function guardarTituloDocumento(tipo, titulo) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Sin sesión');
  // Si ya existe la fila, actualiza. Si no, la crea con path vacío (aún no subió archivo)
  const { data: existente } = await sb.from('documentos')
    .select('id').eq('cuenta_id', user.id).eq('tipo', tipo).maybeSingle();
  if (existente) {
    const { error } = await sb.from('documentos').update({ titulo }).eq('id', existente.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('documentos').insert({
      cuenta_id: user.id, tipo, nombre: '', path: '', titulo
    });
    if (error) throw error;
  }
}

async function listarDocumentos() {
  const user = await nexoUsuarioActual();
  if (!user) return [];
  const { data, error } = await sb.from('documentos').select('*').eq('cuenta_id', user.id);
  if (error) throw error;
  return data || [];
}

async function eliminarDocumento(tipo) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Sin sesión');
  const { data: existentes } = await sb.from('documentos')
    .select('path').eq('cuenta_id', user.id).eq('tipo', tipo);
  if (existentes && existentes.length) {
    await sb.storage.from('documentos').remove(existentes.map(d => d.path));
  }
  await sb.from('documentos').delete().eq('cuenta_id', user.id).eq('tipo', tipo);
}

async function urlDocumento(path) {
  const { data, error } = await sb.storage.from('documentos')
    .createSignedUrl(path, 60 * 60); // 1 hora
  if (error) throw error;
  return data.signedUrl;
}

// ============ ACCESO PÚBLICO (para el link del NFC) ============
// Lee datos verificables por codigo_publico SIN necesidad de sesión.
async function verificarPublico(codigo) {
  const { data, error } = await sb.rpc('verificar_publico', { codigo });
  if (error) throw error;
  return data; // { nombre, rut, perfiles, tema, patente, estado, documentos: [...] }
}

// URL pública de un archivo del bucket 'documentos' (bucket debe ser público)
function urlPublicaDocumento(path) {
  const { data } = sb.storage.from('documentos').getPublicUrl(path);
  return data.publicUrl;
}

// URL para grabar en el NFC del usuario logueado
async function urlDeMiTarjeta() {
  const c = await obtenerCuenta();
  if (!c || !c.codigo_publico) return null;
  return location.origin + '/verificar.html?id=' + c.codigo_publico;
}

// URL firmada de la foto de perfil del usuario (o null si no ha subido)
async function urlFotoPerfil() {
  const user = await nexoUsuarioActual();
  if (!user) return null;
  const { data } = await sb.from('documentos')
    .select('path').eq('cuenta_id', user.id).eq('tipo', 'foto').maybeSingle();
  if (!data || !data.path) return null;
  try { return await urlDocumento(data.path); } catch(e) { return null; }
}

// Aplica la foto de perfil como imagen de fondo en TODOS los .avatar / #userAv
async function aplicarFotoPerfil() {
  const url = await urlFotoPerfil();
  if (!url) return;
  const selectores = [
    '#userAv','#avG','#avV','#avC','#avE',
    '#adminAvatar','.user-badge .u-av'
  ];
  document.querySelectorAll(selectores.join(',')).forEach(el => {
    el.style.backgroundImage    = 'url("' + url + '")';
    el.style.backgroundSize     = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.color              = 'transparent'; // oculta iniciales
  });
}

// Exponer al window para poder llamarlas desde inline scripts
Object.assign(window, {
  nexoSignUp, nexoSignIn, nexoSignOut, nexoUsuarioActual,
  guardarCuenta, obtenerCuenta, listarCuentas,
  subirDocumento, guardarTituloDocumento, listarDocumentos, eliminarDocumento, urlDocumento,
  urlFotoPerfil, aplicarFotoPerfil,
  verificarPublico, urlPublicaDocumento, urlDeMiTarjeta
});
