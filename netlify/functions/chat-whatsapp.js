// ============================================================
//  NEXO — Netlify Function: Chat → WhatsApp
//  Recibe mensajes del chat del sitio, los guarda en Supabase
//  y envía notificación al WhatsApp del admin via CallMeBot.
//
//  Variables de entorno requeridas en Netlify:
//    SUPABASE_URL         → URL del proyecto Supabase
//    SUPABASE_SERVICE_KEY → service_role key (NO la anon key)
//    CALLMEBOT_PHONE      → número sin + ni espacios (ej: 56936687995)
//    CALLMEBOT_APIKEY     → API key recibida de CallMeBot
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return json(405, { error: 'Method Not Allowed' });

  const SUPABASE_URL  = process.env.SUPABASE_URL;
  const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
  const WA_PHONE      = process.env.CALLMEBOT_PHONE  || '56936687995';
  const WA_APIKEY     = process.env.CALLMEBOT_APIKEY || '';

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const nombre  = (body.nombre  || 'Visitante').toString().trim().slice(0, 80);
  const email   = (body.email   || '').toString().trim().slice(0, 120);
  const mensaje = (body.mensaje || '').toString().trim().slice(0, 800);

  if (!mensaje) return json(400, { error: 'El mensaje no puede estar vacío.' });

  // 1. Guardar en Supabase
  if (SUPABASE_URL && SERVICE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/chat_mensajes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ nombre, email, mensaje })
      });
    } catch (e) {
      console.error('Supabase error:', e.message);
    }
  }

  // 2. Enviar WhatsApp via CallMeBot
  if (WA_APIKEY) {
    const texto = `💬 *Nuevo mensaje NEXO*\n👤 ${nombre}${email ? '\n📧 ' + email : ''}\n\n${mensaje}`;
    const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_PHONE}&text=${encodeURIComponent(texto)}&apikey=${WA_APIKEY}`;
    try {
      const r = await fetch(url);
      if (!r.ok) console.error('CallMeBot error:', await r.text());
    } catch (e) {
      console.error('CallMeBot fetch error:', e.message);
    }
  }

  return json(200, { ok: true });
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
