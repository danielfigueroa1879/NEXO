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

// Clave PÚBLICA VAPID para Web Push (documentos por vencer al celular).
// Genera un par con:  npx web-push generate-vapid-keys
// La PÚBLICA va aquí; la PRIVADA va en Netlify env vars (VAPID_PRIVATE_KEY).
// Mientras esté vacía, la suscripción push simplemente no se activa.
const VAPID_PUBLIC_KEY = 'BNJ00LvkZGEDK_qjcgpKRwuajDr35dm4u6E4bIV15qrur5F1b6oLS6DhtHwhBRHgzjKi-pxylYsGToHHNXZ0YXY';

// Cliente global (usa el bundle UMD cargado por <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js">)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,   // ← detecta ?code=... del OAuth de Google
    flowType: 'pkce'
  }
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
  // getUser() hace una petición de red a /auth/v1/user. Ante un fallo puntual de
  // red ("Failed to fetch") reintentamos una vez y, si sigue fallando, devolvemos
  // null en vez de dejar que el error se propague sin capturar a la consola.
  for (let intento = 0; intento < 2; intento++) {
    try {
      const { data } = await sb.auth.getUser();
      return data.user || null;
    } catch (e) {
      if (intento === 0) {
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      console.warn('No se pudo verificar la sesión (red):', e && e.message ? e.message : e);
      return null;
    }
  }
  return null;
}

// Espera a que la sesión OAuth se establezca (después del redirect de Google).
// Cuando la URL tiene ?code=... del callback de Supabase, `detectSessionInUrl`
// procesa el intercambio asincrónicamente. Este helper aguarda hasta que exista
// sesión o se agote el tiempo (2s). Ideal llamarla al inicio de cada página.
async function esperarSesionOAuth() {
  const url = new URL(location.href);
  const tieneCode = url.searchParams.has('code');
  if (!tieneCode) return;
  const tope = Date.now() + 2500;
  while (Date.now() < tope) {
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) break;
    } catch (e) {
      // Fallo de red puntual: seguimos intentando hasta agotar el tope.
    }
    await new Promise(r => setTimeout(r, 100));
  }
  // Limpiar el ?code=... de la URL para que quede prolija
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  history.replaceState(null, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '') + url.hash);
}

// Asegura que exista una fila en `cuentas` para el usuario actual.
// Útil para logins por Google donde no pasamos por nuestro signup manual.
async function asegurarCuenta() {
  const user = await nexoUsuarioActual();
  if (!user) return null;
  const { data: existente } = await sb.from('cuentas').select('*').eq('id', user.id).maybeSingle();
  if (existente) return existente;
  // Crear fila mínima con lo que tengamos del proveedor OAuth
  const meta = user.user_metadata || {};
  const nombre = meta.full_name || meta.name || (user.email || 'Usuario').split('@')[0];
  const { data, error } = await sb.from('cuentas').insert({
    id: user.id,
    nombre,
    email: user.email || null,
    rut: 'PENDIENTE-' + user.id.slice(0, 6).toUpperCase(),
    perfiles: []
  }).select().single();
  if (error) { console.warn('asegurarCuenta:', error); return null; }

  // Cuenta creada por primera vez vía Google: enviar correo de bienvenida.
  // Solo llega aquí cuando NO existía fila previa, así que no se repite en cada login.
  if (data && data.email) {
    fetch('/.netlify/functions/bienvenida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, nombre: data.nombre || 'usuario' })
    })
      .then(async (r) => {
        const txt = await r.text();
        if (r.ok) console.log('✅ Bienvenida (Google) enviada:', txt);
        else console.warn('⚠️ Bienvenida (Google) falló (' + r.status + '):', txt);
      })
      .catch(err => console.warn('No se pudo enviar la bienvenida (Google):', err));
  }

  return data;
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
  const columnas = ['rut','nombre','email','telefono','direccion','patente','patentes',
                    'perfiles','tema','pago','tipo','empresa','estado',
                    'banco','titular_cuenta','tipo_cuenta','numero_cuenta','email_transferencia',
                    'perfil_principal'];
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

// Detecta si el navegador puede CODIFICAR WebP con canvas (mostrarlo no basta:
// hay que saber escribirlo). Se evalúa una vez y se cachea el resultado.
let _soportaWebp = null;
function soportaWebp() {
  if (_soportaWebp !== null) return _soportaWebp;
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    _soportaWebp = c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch (e) {
    _soportaWebp = false;
  }
  return _soportaWebp;
}

// Comprime imágenes en el cliente: reescala a máx `maxDim` px y recodifica en WebP
// (el formato de Instagram/X: ~30% más liviano que JPEG a igual calidad visual).
// Si el navegador no sabe escribir WebP, cae a JPEG. Devuelve el archivo original
// si la versión recomprimida no resulta más liviana.
function comprimirImagenClientSide(file, maxDim = 1200, calidad = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/') || typeof FileReader === 'undefined') {
      resolve(file);
      return;
    }
    const usarWebp = soportaWebp();
    const mime = usarWebp ? 'image/webp' : 'image/jpeg';
    const ext  = usarWebp ? 'webp' : 'jpg';
    // WebP rinde más por byte; si caemos a JPEG bajamos la calidad para no engordar.
    const q = usarWebp ? calidad : Math.min(calidad, 0.72);
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          let nuevoNombre = file.name || 'documento';
          const extIndex = nuevoNombre.lastIndexOf('.');
          if (extIndex !== -1) {
            nuevoNombre = nuevoNombre.substring(0, extIndex) + '.' + ext;
          } else {
            nuevoNombre += '.' + ext;
          }
          let compressedFile;
          try {
            compressedFile = new File([blob], nuevoNombre, {
              type: mime,
              lastModified: Date.now()
            });
          } catch (e) {
            compressedFile = blob;
          }
          resolve(compressedFile);
        }, mime, q);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// Comprime PDFs rasterizando cada página con pdf.js y reconstruyéndolo con jsPDF.
// Requiere `window.pdfjsLib` y `window.jspdf`; si no están cargados o el PDF ya
// era más liviano, devuelve el archivo original.
async function comprimirPdfClientSide(file, dpi = 120, calidad = 0.65) {
  if (!file || file.type !== 'application/pdf') return file;
  if (typeof window === 'undefined' || !window.pdfjsLib || !window.jspdf) return file;
  try {
    // Espera a que el worker de pdf.js esté disponible (blob URL same-origin).
    if (window.__pdfjsWorkerReady && typeof window.__pdfjsWorkerReady.then === 'function') {
      try { await window.__pdfjsWorkerReady; } catch (_) {}
    }
    const arrayBuf = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuf });
    const pdfDoc = await loadingTask.promise;
    const { jsPDF } = window.jspdf;
    const scale = dpi / 72;
    let outPdf = null;
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
      const imgData = canvas.toDataURL('image/jpeg', calidad);
      const wPt = canvas.width * 72 / dpi;
      const hPt = canvas.height * 72 / dpi;
      const orient = wPt > hPt ? 'l' : 'p';
      if (!outPdf) {
        outPdf = new jsPDF({ orientation: orient, unit: 'pt', format: [wPt, hPt], compress: true });
      } else {
        outPdf.addPage([wPt, hPt], orient);
      }
      outPdf.addImage(imgData, 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');
    }
    if (!outPdf) return file;
    const blob = outPdf.output('blob');
    if (!blob || blob.size >= file.size) return file;
    try {
      return new File([blob], file.name || 'documento.pdf', { type: 'application/pdf', lastModified: Date.now() });
    } catch (e) {
      return blob;
    }
  } catch (e) {
    console.warn('No se pudo comprimir el PDF, se sube el original:', e);
    return file;
  }
}

// Dispatcher: aplica la compresión según el tipo. Siempre intenta reducir el peso
// y, si no se logra o falla algo, devuelve el archivo original intacto.
async function comprimirArchivoClientSide(file) {
  if (!file || !file.type) return file;
  if (file.type === 'application/pdf') return comprimirPdfClientSide(file);
  if (file.type.startsWith('image/')) return comprimirImagenClientSide(file);
  return file;
}

/* ------------------------------------------------------------
   DOCUMENTOS  (Storage + tabla `public.documentos`)
   ------------------------------------------------------------ */
async function subirDocumento({ tipo, file, titulo, nombre, noCompress, vence }) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Debes iniciar sesión para subir documentos');

  // Comprimir (imagen o PDF) para reducir peso manteniendo la calidad, excepto si se pide saltar.
  const fileToUpload = noCompress ? file : await comprimirArchivoClientSide(file);

  // La extensión del path y del nombre guardado deben reflejar el archivo REAL que
  // se sube: comprimirArchivoClientSide pudo convertirlo a .webp. Si usáramos la
  // extensión del original, la descarga saldría con un nombre engañoso (ej. .jpg
  // cuando el contenido ya es WebP) porque el navegador nombra el archivo según la
  // extensión de la URL del Storage.
  const nombreReal = (fileToUpload && fileToUpload.name) || nombre || file.name || `${tipo}.jpg`;
  const ext  = (nombreReal.split('.').pop() || 'jpg').toLowerCase();
  const path = `${user.id}/${tipo}.${ext}`;

  // Nombre visible: conserva el nombre lindo (el que pase el caller o el original)
  // pero con la extensión real del archivo subido.
  const baseNombre = (nombre || file.name || nombreReal).replace(/\.[^.]+$/, '');
  const nombreOriginal = baseNombre + '.' + ext;

  // Si ya existía un archivo de este tipo con OTRA extensión (ej. un .jpg previo que
  // ahora se sube como .webp), elimina el objeto viejo para no dejar basura en Storage.
  try {
    const { data: prev } = await sb.from('documentos')
      .select('path').eq('cuenta_id', user.id).eq('tipo', tipo).maybeSingle();
    if (prev && prev.path && prev.path !== path) {
      await sb.storage.from('documentos').remove([prev.path]);
      try { localStorage.removeItem('nexo_signed_' + prev.path); } catch (e) {}
    }
  } catch (e) { /* limpieza best-effort: si falla, se sube igual */ }

  const { error: eUp } = await sb.storage.from('documentos')
    .upload(path, fileToUpload, {
      upsert: true,
      contentType: fileToUpload.type || undefined,
      cacheControl: '2592000' // 30 días — el navegador reusa la imagen sin volver a bajarla → menos egress
    });
  if (eUp) throw eUp;

  // El archivo cambió: invalida la URL firmada cacheada para que la próxima
  // vista descargue la versión nueva y no la vieja del caché del navegador.
  try { localStorage.removeItem('nexo_signed_' + path); } catch (e) {}

  const payload = { cuenta_id: user.id, tipo, nombre: nombreOriginal, path, tamano: fileToUpload.size };
  if (titulo) payload.titulo = titulo;
  // Fecha de vencimiento (YYYY-MM-DD) — reinicia el hito de aviso al cambiar
  if (vence !== undefined) {
    payload.vence = vence || null;
    payload.notif_hito = null;
  }
  const { data, error } = await sb.from('documentos')
    .upsert(payload, { onConflict: 'cuenta_id,tipo' })
    .select().single();
  if (error) throw error;
  return data;
}

// Guardar solo la fecha de vencimiento (sin re-subir archivo)
async function guardarVenceDocumento(tipo, vence) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Sin sesión');
  const vencePayload = vence || null;
  const { data: existente } = await sb.from('documentos')
    .select('id').eq('cuenta_id', user.id).eq('tipo', tipo).maybeSingle();
  if (existente) {
    const { error } = await sb.from('documentos')
      .update({ vence: vencePayload, notif_hito: null })
      .eq('id', existente.id);
    if (error) throw error;
  } else {
    // Aún no hay archivo — creamos placeholder con path vacío para no perder la fecha
    const { error } = await sb.from('documentos').insert({
      cuenta_id: user.id, tipo, nombre: '', path: '', vence: vencePayload
    });
    if (error) throw error;
  }
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

// Persiste el orden manual de varios documentos a la vez. Recibe un objeto
// { tipo: posicionEntera, ... }. Crea filas placeholder si un tipo aún no tiene archivo.
async function guardarOrdenDocumentos(mapa) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Sin sesión');
  const entradas = Object.entries(mapa || {}).filter(([t]) => t);
  if (!entradas.length) return;
  const { data: existentes } = await sb.from('documentos')
    .select('id, tipo').eq('cuenta_id', user.id);
  const porTipo = new Map((existentes || []).map(d => [d.tipo, d.id]));
  const updates = [];
  const inserts = [];
  for (const [tipo, orden] of entradas) {
    const val = Number.isFinite(+orden) ? +orden : null;
    if (porTipo.has(tipo)) {
      updates.push({ id: porTipo.get(tipo), orden: val });
    } else {
      inserts.push({ cuenta_id: user.id, tipo, nombre: '', path: '', orden: val });
    }
  }
  await Promise.all([
    ...updates.map(u => sb.from('documentos').update({ orden: u.orden }).eq('id', u.id)),
    inserts.length ? sb.from('documentos').insert(inserts) : Promise.resolve()
  ]);
}

async function eliminarDocumento(tipo) {
  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Sin sesión');
  const { data: existentes } = await sb.from('documentos')
    .select('path').eq('cuenta_id', user.id).eq('tipo', tipo);
  if (existentes && existentes.length) {
    await sb.storage.from('documentos').remove(existentes.map(d => d.path));
    try { existentes.forEach(d => localStorage.removeItem('nexo_signed_' + d.path)); } catch (e) {}
  }
  await sb.from('documentos').delete().eq('cuenta_id', user.id).eq('tipo', tipo);
}

async function urlDocumento(path) {
  // Cachea la URL firmada en localStorage para NO regenerarla en cada carga.
  // Una URL firmada nueva lleva otro token → el navegador la ve como un archivo
  // distinto y la vuelve a descargar. Reutilizando la MISMA URL mientras siga
  // vigente, el navegador la sirve desde su caché y no gasta egress al refrescar.
  const KEY = 'nexo_signed_' + path;
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (c && c.url && c.exp - 10 * 60 * 1000 > Date.now()) return c.url;
  } catch (e) {}
  const DUR = 6 * 60 * 60; // 6 horas de validez → una descarga cubre toda la sesión
  const { data, error } = await sb.storage.from('documentos')
    .createSignedUrl(path, DUR);
  if (error) throw error;
  try {
    localStorage.setItem(KEY, JSON.stringify({ url: data.signedUrl, exp: Date.now() + DUR * 1000 }));
  } catch (e) {}
  return data.signedUrl;
}

// Guardar sólo los datos bancarios del comerciante
async function guardarDatosBancarios({ banco, titular_cuenta, tipo_cuenta, numero_cuenta, email_transferencia }) {
  return guardarCuenta({
    banco: banco || null,
    titular_cuenta: titular_cuenta || null,
    tipo_cuenta: tipo_cuenta || null,
    numero_cuenta: numero_cuenta || null,
    email_transferencia: email_transferencia || null
  });
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

/* ------------------------------------------------------------
   WEB PUSH — suscripción del navegador para avisos de vencimiento
   ------------------------------------------------------------
   Flujo:
   1) nexoActivarPush()  → pide permiso, se suscribe al PushManager
                          usando VAPID_PUBLIC_KEY, y guarda endpoint
                          + claves en la tabla push_subscriptions.
   2) nexoEstadoPush()   → devuelve 'no-soportado' | 'denegado' |
                          'no-activado' | 'activado' | 'sin-vapid'.
   3) nexoDocumentosPorVencer(diasMax) → devuelve la lista de
                          documentos con días restantes ≤ diasMax
                          (para el banner in-app).
   ------------------------------------------------------------ */

function _b64UrlToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function _arrayBufferToBase64(buffer) {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function nexoPushSoportado() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined';
}

async function nexoEstadoPush() {
  if (!nexoPushSoportado()) return 'no-soportado';
  if (!VAPID_PUBLIC_KEY)    return 'sin-vapid';
  if (Notification.permission === 'denied') return 'denegado';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'no-activado';
    const sub = await reg.pushManager.getSubscription();
    if (sub) return 'activado';
    return Notification.permission === 'granted' ? 'no-activado' : 'no-activado';
  } catch (e) {
    return 'no-activado';
  }
}

async function nexoActivarPush() {
  if (!nexoPushSoportado()) throw new Error('Tu navegador no soporta notificaciones push.');
  if (!VAPID_PUBLIC_KEY)    throw new Error('Falta configurar VAPID_PUBLIC_KEY en supabase-client.js.');

  const user = await nexoUsuarioActual();
  if (!user) throw new Error('Debes iniciar sesión antes de activar las notificaciones.');

  // Permiso — en iOS/Chrome debe llamarse desde un gesto del usuario
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado.');

  // Espera al SW listo (register se hace en el HTML)
  const reg = await navigator.serviceWorker.ready;

  // Reusar suscripción existente o crear una nueva
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _b64UrlToUint8Array(VAPID_PUBLIC_KEY)
    });
  }

  const json = sub.toJSON();
  const payload = {
    cuenta_id: user.id,
    endpoint:  sub.endpoint,
    p256dh:    (json.keys && json.keys.p256dh) || _arrayBufferToBase64(sub.getKey && sub.getKey('p256dh')),
    auth:      (json.keys && json.keys.auth)   || _arrayBufferToBase64(sub.getKey && sub.getKey('auth')),
    user_agent: (navigator.userAgent || '').slice(0, 300)
  };

  // Upsert por endpoint — misma suscripción reemplaza la fila anterior
  const { error } = await sb.from('push_subscriptions')
    .upsert(payload, { onConflict: 'endpoint' });
  if (error) throw error;
  return true;
}

async function nexoDesactivarPush() {
  if (!nexoPushSoportado()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    return true;
  } catch (e) {
    console.warn('nexoDesactivarPush:', e);
    return false;
  }
}

// Devuelve los documentos del usuario con vencimiento ≤ diasMax días
// (o ya vencidos), ordenados por urgencia (los ya vencidos primero).
async function nexoDocumentosPorVencer(diasMax = 30) {
  const docs = await listarDocumentos();
  const hoyStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  const hoy = new Date(hoyStr + 'T00:00:00Z');
  const out = [];
  for (const d of docs) {
    if (!d.vence) continue;
    const v = new Date(d.vence + 'T00:00:00Z');
    if (isNaN(v.getTime())) continue;
    const dias = Math.round((v - hoy) / 86400000);
    if (dias <= diasMax) out.push({ ...d, dias });
  }
  out.sort((a, b) => a.dias - b.dias);
  return out;
}

// Exponer al window para poder llamarlas desde inline scripts
Object.assign(window, {
  soportaWebp,
  nexoSignUp, nexoSignIn, nexoSignOut, nexoUsuarioActual, asegurarCuenta, esperarSesionOAuth,
  guardarCuenta, obtenerCuenta, listarCuentas, guardarDatosBancarios,
  subirDocumento, guardarTituloDocumento, guardarVenceDocumento, guardarOrdenDocumentos, listarDocumentos, eliminarDocumento, urlDocumento,
  urlFotoPerfil, aplicarFotoPerfil,
  verificarPublico, urlPublicaDocumento, urlDeMiTarjeta,
  nexoPushSoportado, nexoEstadoPush, nexoActivarPush, nexoDesactivarPush, nexoDocumentosPorVencer
});
