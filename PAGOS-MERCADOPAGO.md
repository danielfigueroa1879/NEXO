# 💳 Pagos con Mercado Pago (Checkout Pro) — NEXO

El pago usa **Checkout Pro**: el usuario va a la pantalla segura de Mercado Pago,
paga con **débito, crédito o saldo de su cuenta**, y vuelve automáticamente al sitio.
Mercado Pago maneja los datos de la tarjeta (tú no los tocas).

## Cómo funciona (arquitectura)

1. En `solicitar.html`, al pagar, el navegador llama a la función
   `/.netlify/functions/create-preference`.
2. Esa función (en `netlify/functions/create-preference.js`) usa tu **Access Token**
   secreto para crear el cobro en Mercado Pago y devuelve el link de pago.
3. El navegador redirige a Mercado Pago. Al terminar, vuelve a
   `solicitar.html?pago=exito` (o `error` / `pendiente`) y se muestra el resultado.

> El Access Token **NUNCA** va en el HTML. Vive solo como variable de entorno en Netlify.

---

## Paso 1 — Obtener tus credenciales de Mercado Pago

1. Entra a **https://www.mercadopago.cl/developers/panel** (con tu cuenta de Mercado Pago).
2. **Tus integraciones** → **Crear aplicación** (o abre la que ya tienes).
   - Tipo de solución: **Pagos online** → **Checkout Pro**.
3. En la app, abre **Credenciales**. Verás dos juegos:
   - **Credenciales de prueba** (para probar sin cobrar dinero real).
   - **Credenciales de producción** (para cobrar de verdad).
4. Copia el **Access Token**. Empieza con:
   - Prueba:      `TEST-....`
   - Producción:  `APP_USR-....`

**Empieza con el de PRUEBA** para dejar todo funcionando sin cobrar.

---

## Paso 2 — Guardar el Access Token en Netlify

1. Entra a tu sitio en **https://app.netlify.com** → tu sitio NEXO.
2. **Site configuration** → **Environment variables** → **Add a variable**.
3. Crea:
   - **Key:** `MP_ACCESS_TOKEN`
   - **Value:** (pega tu Access Token, `TEST-...` o `APP_USR-...`)
4. **Save**.
5. Ve a **Deploys** → **Trigger deploy** → **Deploy site** (para que tome la variable).

---

## Paso 3 — Subir el código

Como usas **GitHub conectado a Netlify**, solo:

```bash
git add .
git commit -m "Pago con Mercado Pago (Checkout Pro)"
git push
```

Netlify desplegará solo, incluyendo la función.

---

## Paso 4 — Probar

### Con credenciales de PRUEBA (`TEST-...`)
- Usa las **tarjetas de prueba** de Mercado Pago:
  https://www.mercadopago.cl/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards
- Ej. Mastercard débito de prueba: `5416 7526 0258 2580`, venc. `11/30`, CVV `123`,
  titular `APRO` (para aprobar) y cualquier RUT.

### Con credenciales de PRODUCCIÓN (`APP_USR-...`)
- Cambia `MP_ACCESS_TOKEN` por el de producción y vuelve a desplegar.
- Ya cobra dinero real con tarjetas reales.

---

## Notas importantes

- **Débito**: Checkout Pro lo ofrece automáticamente junto con crédito y saldo MP.
  No hay que configurar nada extra.
- **Moneda**: CLP (peso chileno), sin decimales. Los precios están en
  `solicitar.html` (`const PRECIOS = {...}`).
- **Solo funciona desplegado** en Netlify (con HTTPS). En local no corre la función.
- **Confirmación del pago**: hoy se confía en el retorno `?pago=exito`. Para máxima
  seguridad conviene después agregar un **webhook** de Mercado Pago que verifique el
  pago del lado del servidor antes de marcar la solicitud como pagada. (Se puede
  añadir como una segunda función `netlify/functions/webhook.js`.)
