// ============================================================
//  NEXO — Netlify Function: crear preferencia de Mercado Pago
//  (Checkout Pro — acepta DÉBITO, crédito y saldo Mercado Pago)
//
//  Requiere una variable de entorno en Netlify:
//     MP_ACCESS_TOKEN = APP_USR-....  (Access Token de tu app MP)
//  Se configura en: Netlify → Site settings → Environment variables
// ============================================================

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: 'Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Netlify.' })
    };
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}

  const titulo   = (body.titulo || 'Tarjeta NFC NEXO').toString().slice(0, 250);
  const monto    = Math.round(Number(body.monto) || 0);      // CLP = entero, sin decimales
  const cantidad = Math.max(1, parseInt(body.cantidad, 10) || 1);
  const email    = (body.email || '').toString().trim();
  const base     = (body.origin || process.env.URL || '').replace(/\/$/, '');

  if (!monto || monto < 1) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Monto inválido' }) };
  }

  const preferencia = {
    items: [{
      title: titulo,
      quantity: cantidad,
      unit_price: monto,
      currency_id: 'CLP'
    }],
    back_urls: {
      success: base + '/solicitar.html?pago=exito',
      failure: base + '/solicitar.html?pago=error',
      pending: base + '/solicitar.html?pago=pendiente'
    },
    auto_return: 'approved',
    statement_descriptor: 'NFC NEXO'
  };
  if (email) preferencia.payer = { email };

  try {
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(preferencia)
    });
    const data = await resp.json();

    if (!resp.ok) {
      return {
        statusCode: resp.status, headers: CORS,
        body: JSON.stringify({ error: data.message || 'Error creando la preferencia de pago', detalle: data })
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: data.id,
        init_point: data.init_point,                 // URL de pago (producción)
        sandbox_init_point: data.sandbox_init_point  // URL de pago (pruebas)
      })
    };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
