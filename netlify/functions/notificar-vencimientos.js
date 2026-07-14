// ============================================================
//  NEXO — Netlify Function: avisos de documentos por vencer
//  Envía EMAIL (Resend) + PUSH al celular (Web Push / VAPID) para
//  que aparezca el badge rojo con "1" sobre el ícono, igual que
//  Google/Fotos en iOS.
//
//  Se ejecuta automáticamente 1x/día vía schedule en netlify.toml
//  (0 12 * * *  → 12:00 UTC = 09:00 Chile CLT).
//
//  También se puede llamar manualmente abriendo la URL:
//    /.netlify/functions/notificar-vencimientos
//
//  Hitos de aviso (días respecto a la fecha de vencimiento):
//    30, 15, 7, 1, 0, -1
//  Cada hito manda UN correo + UN push por documento. Se guarda en
//  documentos.notif_hito para no repetirlo. Si el usuario extiende la
//  fecha, el frontend pone notif_hito = null para reactivar los avisos.
//
//  Requiere env vars en Netlify:
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (obligatorias)
//    RESEND_API_KEY, RESEND_FROM               (para correo)
//    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (para push)
// ============================================================

const webpush = require('web-push');

const HITOS_ASC = [-1, 0, 1, 7, 15, 30]; // orden de urgencia (menor = más urgente)

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_KEY   = process.env.RESEND_API_KEY;
  const RESEND_FROM  = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const VAPID_PUB    = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIV   = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJ   = process.env.VAPID_SUBJECT || 'mailto:soporte@nfcnexo.cl';

  const errores = [];
  const resumen = { revisados: 0, enviados: 0, push_enviados: 0, push_borrados: 0, saltados: 0, errores };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(500, { error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Netlify.' });
  }
  if (!RESEND_KEY) {
    return json(500, { error: 'Falta RESEND_API_KEY en Netlify.' });
  }

  // Push es opcional: si faltan las VAPID keys, seguimos solo con email.
  const pushActivo = Boolean(VAPID_PUB && VAPID_PRIV);
  if (pushActivo) {
    try {
      webpush.setVapidDetails(VAPID_SUBJ, VAPID_PUB, VAPID_PRIV);
    } catch (e) {
      errores.push({ error: 'VAPID inválido: ' + e.message });
    }
  }

  // Hoy en zona horaria de Chile (evita off-by-one si el cron corre cerca de medianoche)
  const hoyStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date()); // 'YYYY-MM-DD'
  const hoy = new Date(hoyStr + 'T00:00:00Z');

  // Traer documentos con vence + email/nombre de la cuenta
  let docs;
  try {
    const url = `${SUPABASE_URL}/rest/v1/documentos`
      + `?select=id,tipo,titulo,vence,notif_hito,cuenta_id,cuentas(email,nombre)`
      + `&vence=not.is.null`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!r.ok) {
      return json(500, { error: 'Error consultando Supabase', detalle: await r.text() });
    }
    docs = await r.json();
  } catch (e) {
    return json(500, { error: 'No pudo conectar a Supabase', detalle: e.message });
  }

  resumen.revisados = docs.length;

  for (const d of docs) {
    try {
      const venceDate = new Date(d.vence + 'T00:00:00Z');
      const diff = Math.round((venceDate - hoy) / 86400000);
      const hitoActual = calcularHito(diff);

      if (hitoActual === null) { resumen.saltados++; continue; }

      // Ya se envió este hito o uno más urgente antes
      if (d.notif_hito !== null && d.notif_hito !== undefined && hitoActual >= d.notif_hito) {
        resumen.saltados++;
        continue;
      }

      const email = d.cuentas && d.cuentas.email;
      const nombre = (d.cuentas && d.cuentas.nombre) || 'usuario';
      if (!email) { resumen.saltados++; continue; }

      const nombreDoc = d.titulo || nombreLegible(d.tipo);
      const asunto = tituloEmail(hitoActual, nombreDoc);
      const html   = cuerpoEmail(nombre, nombreDoc, d.vence, hitoActual);

      const rMail = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({ from: RESEND_FROM, to: email, subject: asunto, html })
      });
      if (!rMail.ok) {
        errores.push({ doc_id: d.id, email, error: 'Resend: ' + await rMail.text() });
        continue;
      }

      // Marcar el hito enviado para no repetir
      const rUpd = await fetch(
        `${SUPABASE_URL}/rest/v1/documentos?id=eq.${d.id}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal'
          },
          body: JSON.stringify({ notif_hito: hitoActual })
        }
      );
      if (!rUpd.ok) {
        errores.push({ doc_id: d.id, error: 'Update notif_hito: ' + await rUpd.text() });
      }

      resumen.enviados++;

      // Push al celular (badge rojo sobre el ícono) — no bloquea el flujo si falla
      if (pushActivo) {
        const r = await enviarPushCuenta({
          SUPABASE_URL, SUPABASE_KEY,
          cuentaId: d.cuenta_id,
          titulo: asunto.replace(/^⚠️\s*/, ''),
          cuerpo: hitoActual < 0 ? `Venció el ${d.vence}` : `Vence el ${d.vence}`,
          docId: d.id
        });
        resumen.push_enviados += r.enviados;
        resumen.push_borrados += r.borrados;
        if (r.errores.length) errores.push(...r.errores);
      }
    } catch (e) {
      errores.push({ doc_id: d.id, error: e.message });
    }
  }

  return json(200, resumen);
};

// --- push helpers -------------------------------------------------------

async function enviarPushCuenta({ SUPABASE_URL, SUPABASE_KEY, cuentaId, titulo, cuerpo, docId }) {
  const res = { enviados: 0, borrados: 0, errores: [] };
  const rSub = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&cuenta_id=eq.${cuentaId}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!rSub.ok) {
    res.errores.push({ doc_id: docId, error: 'Leer push_subscriptions: ' + await rSub.text() });
    return res;
  }
  const subs = await rSub.json();
  if (!subs.length) return res;

  const payload = JSON.stringify({
    title: titulo,
    body: cuerpo,
    url: '/subir-documentos.html',
    tag: 'doc-' + docId,
    doc_id: docId
  });

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 24 * 3600 }
      );
      res.enviados++;
    } catch (e) {
      // 404/410 = suscripción caducada → borrar de la BD
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        try {
          await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
            {
              method: 'DELETE',
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                Prefer: 'return=minimal'
              }
            }
          );
          res.borrados++;
        } catch (delErr) {
          res.errores.push({ doc_id: docId, error: 'Borrar sub caducada: ' + delErr.message });
        }
      } else {
        res.errores.push({ doc_id: docId, error: 'web-push: ' + (e && e.message ? e.message : e) });
      }
    }
  }
  return res;
}

// --- helpers ------------------------------------------------------------

function calcularHito(diff) {
  // Devuelve el menor hito m (más urgente) tal que diff <= m.
  // diff = días entre hoy y vence (positivo = vence en el futuro).
  for (const m of HITOS_ASC) {
    if (diff <= m) return m;
  }
  return null; // aún faltan más de 30 días
}

function tituloEmail(hito, nombreDoc) {
  if (hito === -1) return `⚠️ ${nombreDoc} VENCIÓ`;
  if (hito === 0)  return `⚠️ ${nombreDoc} vence HOY`;
  if (hito === 1)  return `${nombreDoc} vence MAÑANA`;
  return `${nombreDoc} vence en ${hito} días`;
}

function cuerpoEmail(nombre, nombreDoc, venceStr, hito) {
  const urgente = hito <= 1;
  const color = urgente ? '#c62828' : '#f57c00';
  const titulo = tituloEmail(hito, nombreDoc)
    .replace(/^⚠️\s*/, '');
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
      <h2 style="color:${color};margin:0 0 16px">${titulo}</h2>
      <p>Hola <strong>${escapeHtml(nombre)}</strong>,</p>
      <p>Te avisamos que tu documento <strong>${escapeHtml(nombreDoc)}</strong>
         ${hito < 0 ? 'venció el' : 'vence el'}
         <strong>${escapeHtml(venceStr)}</strong>.</p>
      <p>Recuerda actualizarlo en tu perfil NEXO para mantener tu credencial vigente.</p>
      <p style="margin-top:24px">
        <a href="https://nfcnexo.netlify.app/subir-documentos.html"
           style="background:${color};color:#fff;padding:12px 20px;border-radius:6px;
                  text-decoration:none;display:inline-block">
          Actualizar documento
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0">
      <p style="font-size:12px;color:#888">
        Este es un aviso automático de NEXO. Si ya renovaste tu documento,
        actualiza la fecha de vencimiento en la app y no volveremos a molestarte.
      </p>
    </div>`;
}

function nombreLegible(tipo) {
  const map = {
    cedula: 'Cédula de identidad',
    licencia: 'Licencia de conducir',
    curso: 'Curso OS10',
    credencial: 'Credencial',
    contrato: 'Contrato',
    examen: 'Examen',
    permiso: 'Permiso de circulación',
    soap: 'SOAP',
    antecedentes: 'Certificado de antecedentes',
    revision: 'Revisión técnica',
    padron: 'Padrón',
    patente_alcoholes: 'Patente de alcoholes',
    patente_comercial: 'Patente comercial',
    directiva: 'Directiva',
    contratos_empresa: 'Contratos de empresa',
    seguro_empresa: 'Seguro de empresa'
  };
  return map[tipo] || tipo;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj)
  };
}
