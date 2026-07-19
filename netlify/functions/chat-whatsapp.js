// ============================================================
//  NEXO — Netlify Function: Chat en vivo (envío del visitante)
//  Guarda el mensaje del visitante en Supabase (de='visitante')
//  y avisa al admin por WhatsApp (CallMeBot) para que responda
//  desde el panel admin.html.
//
//  Variables de entorno requeridas en Netlify:
//    SUPABASE_URL              → URL del proyecto Supabase
//    SUPABASE_SERVICE_ROLE_KEY → service_role key (NO la anon key)
//    CALLMEBOT_PHONE           → número sin + ni espacios (ej: 56936687995)
//    CALLMEBOT_APIKEY          → API key recibida de CallMeBot
//    SITE_URL                  → (opcional) dominio del sitio para el link admin
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const WA_PHONE     = process.env.CALLMEBOT_PHONE  || '56936687995';
  const WA_APIKEY    = process.env.CALLMEBOT_APIKEY || '';
  const SITE_URL     = (process.env.SITE_URL || 'https://nfcnexo.net').replace(/\/$/, '');

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const nombre   = (body.nombre   || 'Visitante').toString().trim().slice(0, 80);
  const telefono = (body.telefono || '').toString().trim().slice(0, 20);
  const email    = (body.email    || '').toString().trim().slice(0, 120);
  const mensaje  = (body.mensaje  || '').toString().trim().slice(0, 800);

  // Identificador de conversación: lo genera el widget; si falta, lo creamos.
  let conversacion_id = (body.conversacion_id || '').toString().trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(conversacion_id)) {
    conversacion_id = (globalThis.crypto && globalThis.crypto.randomUUID)
      ? globalThis.crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
  }

  if (!mensaje) return json(400, { error: 'El mensaje no puede estar vacío.' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Falta configurar Supabase en el servidor.' });
  }

  // 1. Guardar el mensaje del visitante
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/chat_mensajes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        conversacion_id, de: 'visitante',
        nombre, telefono, email, mensaje, leido: false
      })
    });
    if (!r.ok) {
      return json(502, { error: 'No se pudo guardar el mensaje: ' + await r.text() });
    }
  } catch (e) {
    return json(500, { error: 'Error guardando: ' + e.message });
  }

  // 2. Avisar al admin por WhatsApp (no bloquea si falla)
  if (WA_APIKEY) {
    const texto =
      `💬 *Nuevo mensaje NEXO*\n` +
      `👤 ${nombre}` +
      (telefono ? ` · ${telefono}` : '') +
      (email    ? `\n📧 ${email}` : '') +
      `\n\n${mensaje}` +
      `\n\n↩️ Responde desde el panel:\n${SITE_URL}/admin.html`;
    const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encodeURIComponent(texto)}&apikey=${WA_APIKEY}`;
    try {
      const r = await fetch(url);
      if (!r.ok) console.error('CallMeBot error:', await r.text());
    } catch (e) {
      console.error('CallMeBot fetch error:', e.message);
    }
  }

  return json(200, { ok: true, conversacion_id });
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
