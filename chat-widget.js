// ============================================================
//  NEXO — Chat en vivo (widget flotante)
//  El visitante escribe y ve las respuestas del admin en la misma
//  caja, en vivo (sondeo cada pocos segundos). El admin responde
//  desde admin.html → sección "Mensajes".
//  Incluir en cualquier página con:
//    <script src="/chat-widget.js" defer></script>
// ============================================================

(function () {
  const API_SEND = '/.netlify/functions/chat-whatsapp';
  const API_POLL = '/.netlify/functions/chat-poll';
  const LS_CONV  = 'nexo_chat_conv';
  const LS_INFO  = 'nexo_chat_info';
  const POLL_MS  = 4000;

  const CSS = `
    #nexo-chat-btn {
      position: fixed; bottom: 24px; right: 24px;
      width: 58px; height: 58px; border-radius: 50%;
      background: #0A0A0A; color: #fff; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 18px rgba(0,0,0,0.35); z-index: 9998;
      transition: transform .2s, background .2s;
    }
    #nexo-chat-btn:hover { transform: scale(1.08); background: #222; }
    #nexo-chat-btn svg { width: 26px; height: 26px; }
    #nexo-chat-badge {
      position: absolute; top: -4px; right: -4px;
      background: #e53e3e; color: #fff; border-radius: 50%;
      min-width: 18px; height: 18px; padding: 0 4px; font-size: 11px; font-weight: bold;
      display: none; align-items: center; justify-content: center;
    }

    #nexo-chat-box {
      position: fixed; bottom: 94px; right: 24px;
      width: 340px; max-width: calc(100vw - 48px);
      height: 460px; max-height: calc(100vh - 130px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      z-index: 9999; display: none; flex-direction: column;
      overflow: hidden; font-family: Arial, sans-serif;
      animation: nexoChatIn .22s ease;
    }
    @keyframes nexoChatIn {
      from { opacity:0; transform: translateY(16px) scale(.97); }
      to   { opacity:1; transform: translateY(0) scale(1); }
    }

    #nexo-chat-header {
      background: #0A0A0A; color: #fff; padding: 14px 16px;
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
    }
    #nexo-chat-header svg { width:22px; height:22px; flex-shrink:0; }
    #nexo-chat-header-text { flex:1; }
    #nexo-chat-header-text strong { display:block; font-size:14px; }
    #nexo-chat-header-text span { font-size:11px; opacity:.7; }
    #nexo-chat-close {
      background: none; border: none; color: #fff; cursor: pointer;
      font-size: 20px; line-height:1; padding:0;
    }

    #nexo-chat-msgs {
      flex: 1; overflow-y: auto; padding: 14px;
      display: flex; flex-direction: column; gap: 8px;
      background: #f7f7f8;
    }
    .nexo-msg {
      max-width: 80%; padding: 9px 12px; border-radius: 14px;
      font-size: 13px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word;
    }
    .nexo-msg.visitante {
      align-self: flex-end; background: #0A0A0A; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .nexo-msg.admin {
      align-self: flex-start; background: #fff; color: #111;
      border: 1px solid #e3e3e6; border-bottom-left-radius: 4px;
    }

    #nexo-chat-contact { padding: 12px 14px 0; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
    #nexo-chat-contact input {
      width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 8px;
      padding: 8px 11px; font-size: 13px; font-family: Arial, sans-serif; outline: none;
    }
    #nexo-chat-contact input:focus { border-color: #0A0A0A; }

    #nexo-chat-footer {
      display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid #eee; flex-shrink: 0;
    }
    #nexo-chat-input {
      flex: 1; box-sizing: border-box; border: 1px solid #ddd; border-radius: 20px;
      padding: 9px 14px; font-size: 13px; font-family: Arial, sans-serif; outline: none; resize: none;
    }
    #nexo-chat-input:focus { border-color: #0A0A0A; }
    #nexo-chat-sendbtn {
      background: #0A0A0A; color: #fff; border: none; border-radius: 50%;
      width: 40px; height: 40px; flex-shrink: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    #nexo-chat-sendbtn:hover:not(:disabled) { background: #333; }
    #nexo-chat-sendbtn:disabled { opacity: .5; cursor: default; }
    #nexo-chat-sendbtn svg { width: 18px; height: 18px; }
  `;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;

  const btn = document.createElement('button');
  btn.id = 'nexo-chat-btn';
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.innerHTML = CHAT_ICON + `<span id="nexo-chat-badge"></span>`;
  document.body.appendChild(btn);

  const box = document.createElement('div');
  box.id = 'nexo-chat-box';
  box.innerHTML = `
    <div id="nexo-chat-header">
      ${CHAT_ICON}
      <div id="nexo-chat-header-text">
        <strong>Escríbenos</strong>
        <span>Te respondemos por aquí</span>
      </div>
      <button id="nexo-chat-close" aria-label="Cerrar">✕</button>
    </div>
    <div id="nexo-chat-msgs"></div>
    <div id="nexo-chat-contact">
      <input type="text" id="nexo-chat-nombre"   placeholder="Tu nombre (opcional)" maxlength="80">
      <input type="tel"  id="nexo-chat-telefono" placeholder="Tu WhatsApp (opcional)" maxlength="20">
    </div>
    <div id="nexo-chat-footer">
      <textarea id="nexo-chat-input" rows="1" placeholder="Escribe tu mensaje…" maxlength="800"></textarea>
      <button id="nexo-chat-sendbtn" aria-label="Enviar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;
  document.body.appendChild(box);

  const $msgs    = box.querySelector('#nexo-chat-msgs');
  const $contact = box.querySelector('#nexo-chat-contact');
  const $nombre  = box.querySelector('#nexo-chat-nombre');
  const $tel     = box.querySelector('#nexo-chat-telefono');
  const $input   = box.querySelector('#nexo-chat-input');
  const $send    = box.querySelector('#nexo-chat-sendbtn');

  // --- estado ---
  let convId = localStorage.getItem(LS_CONV) || '';
  let info   = {};
  try { info = JSON.parse(localStorage.getItem(LS_INFO) || '{}'); } catch (e) {}
  const seen = new Set();
  let lastFecha = '';
  let pollTimer = null;
  let abierto = false;
  let saludoMostrado = false;

  function genId() {
    return (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function bubble(de, texto) {
    const el = document.createElement('div');
    el.className = 'nexo-msg ' + (de === 'admin' ? 'admin' : 'visitante');
    el.textContent = texto;
    $msgs.appendChild(el);
    $msgs.scrollTop = $msgs.scrollHeight;
  }

  function saludo() {
    if (saludoMostrado) return;
    saludoMostrado = true;
    bubble('admin', '¡Hola! 👋 Escríbenos tu consulta y te respondemos por aquí mismo.');
  }

  function pintar(arr) {
    (arr || []).forEach(m => {
      if (seen.has(m.id)) return;
      seen.add(m.id);
      bubble(m.de, m.mensaje);
      if (m.fecha) lastFecha = m.fecha;
    });
  }

  async function poll(after) {
    if (!convId) return;
    try {
      const r = await fetch(API_POLL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: convId, after: after || '' })
      });
      if (!r.ok) return;
      const data = await r.json();
      pintar(data.mensajes);
    } catch (e) { /* silencioso: reintenta en el próximo ciclo */ }
  }

  function startPoll() { stopPoll(); pollTimer = setInterval(() => poll(lastFecha), POLL_MS); }
  function stopPoll()  { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function actualizarContacto() {
    // Ocultar formulario de contacto si ya tenemos algún dato guardado
    $contact.style.display = (info && (info.nombre || info.telefono)) ? 'none' : 'flex';
    if (info) {
      if (info.nombre)   $nombre.value = info.nombre;
      if (info.telefono) $tel.value    = info.telefono;
    }
  }

  async function enviar() {
    const mensaje = $input.value.trim();
    if (!mensaje) { $input.focus(); return; }

    // Capturar contacto la primera vez
    if ($contact.style.display !== 'none') {
      info = {
        nombre:   $nombre.value.trim().slice(0, 80),
        telefono: $tel.value.trim().slice(0, 20),
        email:    (info && info.email) || ''
      };
      localStorage.setItem(LS_INFO, JSON.stringify(info));
    }
    if (!convId) { convId = genId(); localStorage.setItem(LS_CONV, convId); }

    $send.disabled = true;
    try {
      const r = await fetch(API_SEND, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversacion_id: convId,
          nombre: info.nombre, telefono: info.telefono, email: info.email,
          mensaje
        })
      });
      if (!r.ok) throw new Error('Error del servidor');
      const data = await r.json();
      if (data.conversacion_id) { convId = data.conversacion_id; localStorage.setItem(LS_CONV, convId); }
      $input.value = '';
      $contact.style.display = 'none';
      await poll(lastFecha); // trae el mensaje recién guardado
    } catch (e) {
      alert('No se pudo enviar el mensaje. Intenta nuevamente.');
    } finally {
      $send.disabled = false;
      $input.focus();
    }
  }

  function abrir() {
    abierto = true;
    box.style.display = 'flex';
    document.getElementById('nexo-chat-badge').style.display = 'none';
    saludo();
    actualizarContacto();
    if (convId) poll('');   // historial completo
    startPoll();
    $input.focus();
  }
  function cerrar() {
    abierto = false;
    box.style.display = 'none';
    stopPoll();
  }

  btn.addEventListener('click', () => abierto ? cerrar() : abrir());
  box.querySelector('#nexo-chat-close').addEventListener('click', cerrar);
  $send.addEventListener('click', enviar);
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  });
})();
