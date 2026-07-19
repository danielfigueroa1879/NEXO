// ============================================================
//  NEXO — Netlify Function: Chat en vivo (lectura del visitante)
//  Devuelve los mensajes de UNA conversación (filtrada por
//  conversacion_id) para que el visitante vea las respuestas del
//  admin en su caja de chat. Usa la service_role key en el servidor
//  para no exponer la base de datos completa al navegador.
//
//  Uso:  POST { conversacion_id, after? }
//        after = ISO timestamp opcional (solo mensajes más nuevos)
//
//  Variables de entorno:
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
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
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'Falta configurar Supabase.' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const conv = (body.conversacion_id || '').toString().trim();
  if (!/^[0-9a-f-]{10,}$/i.test(conv)) return json(400, { error: 'conversacion_id inválido' });

  const authHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  try {
    // El visitante está viendo el chat → marcar como leídos los mensajes del admin
    // (así el admin ve el "visto" ✓✓ en sus propios mensajes).
    await fetch(
      `${SUPABASE_URL}/rest/v1/chat_mensajes`
        + `?conversacion_id=eq.${encodeURIComponent(conv)}&de=eq.admin&leido=eq.false`,
      {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ leido: true })
      }
    );

    // Devolver todos los mensajes de la conversación (con estado de leído)
    const url = `${SUPABASE_URL}/rest/v1/chat_mensajes`
      + `?conversacion_id=eq.${encodeURIComponent(conv)}`
      + `&select=id,de,mensaje,leido,fecha`
      + `&order=fecha.asc`;
    const r = await fetch(url, { headers: authHeaders });
    if (!r.ok) return json(502, { error: await r.text() });
    const mensajes = await r.json();
    return json(200, { mensajes });
  } catch (e) {
    return json(500, { error: e.message });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
