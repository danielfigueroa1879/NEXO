// ============================================================
//  NEXO — Netlify Function: correo de bienvenida al crear cuenta
//  Envía UN email (vía Resend) cuando alguien termina de registrarse.
//
//  Se llama desde el frontend (login.html → crearCuenta) con:
//    POST { email, nombre }
//
//  Requiere env vars en Netlify:
//    RESEND_API_KEY   (obligatoria)
//    RESEND_FROM      (opcional; por defecto onboarding@resend.dev)
// ============================================================

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const RESEND_KEY  = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';
  if (!RESEND_KEY) {
    return json(500, CORS, { error: 'Falta RESEND_API_KEY en Netlify.' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const email  = (body.email || '').toString().trim();
  const nombre = (body.nombre || 'usuario').toString().trim().slice(0, 120);

  // Validación básica del correo (evita usarlo como relay abierto sin destino válido)
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return json(400, CORS, { error: 'Correo inválido' });
  }

  try {
    const rMail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: '¡Bienvenido a NEXO! 🎉',
        html: cuerpoEmail(nombre)
      })
    });
    if (!rMail.ok) {
      return json(502, CORS, { error: 'Resend: ' + await rMail.text() });
    }
    return json(200, CORS, { ok: true });
  } catch (e) {
    return json(500, CORS, { error: e.message });
  }
};

function cuerpoEmail(nombre) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
      <h2 style="color:#0A0A0A;margin:0 0 16px">¡Tu cuenta NEXO está lista! 🎉</h2>
      <p>Hola <strong>${escapeHtml(nombre)}</strong>,</p>
      <p>Tu cuenta se creó correctamente. A partir de ahora te enviaremos a
         <strong>este correo</strong> los avisos cuando alguno de tus documentos
         esté por vencer, para que mantengas tu credencial siempre vigente.</p>
      <p>Ya puedes iniciar sesión y subir tus documentos:</p>
      <p style="margin-top:24px">
        <a href="https://nfcnexo.netlify.app/subir-documentos.html"
           style="background:#0A0A0A;color:#fff;padding:12px 20px;border-radius:6px;
                  text-decoration:none;display:inline-block">
          Subir mis documentos
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
      <p style="font-size:12px;color:#888">
        Este es un correo automático de NEXO. Si no creaste esta cuenta,
        puedes ignorar este mensaje.
      </p>
    </div>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function json(statusCode, cors, obj) {
  return {
    statusCode,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
