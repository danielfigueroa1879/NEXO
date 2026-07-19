// ============================================================
//  NEXO — Chat Widget flotante
//  Añade automáticamente el botón y cuadro de chat al body.
//  Incluir en cualquier página con:
//    <script src="/chat-widget.js" defer></script>
// ============================================================

(function () {
  const CSS = `
    #nexo-chat-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: #0A0A0A;
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 18px rgba(0,0,0,0.35);
      z-index: 9998;
      transition: transform .2s, background .2s;
    }
    #nexo-chat-btn:hover { transform: scale(1.08); background: #222; }
    #nexo-chat-btn svg { width: 26px; height: 26px; }

    #nexo-chat-badge {
      position: absolute;
      top: -4px; right: -4px;
      background: #e53e3e;
      color: #fff;
      border-radius: 50%;
      width: 18px; height: 18px;
      font-size: 11px;
      font-weight: bold;
      display: flex; align-items: center; justify-content: center;
      display: none;
    }

    #nexo-chat-box {
      position: fixed;
      bottom: 94px;
      right: 24px;
      width: 320px;
      max-width: calc(100vw - 48px);
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      z-index: 9999;
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: Arial, sans-serif;
      animation: nexoChatIn .22s ease;
    }
    @keyframes nexoChatIn {
      from { opacity:0; transform: translateY(16px) scale(.97); }
      to   { opacity:1; transform: translateY(0) scale(1); }
    }

    #nexo-chat-header {
      background: #0A0A0A;
      color: #fff;
      padding: 14px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #nexo-chat-header svg { width:22px; height:22px; flex-shrink:0; }
    #nexo-chat-header-text { flex:1; }
    #nexo-chat-header-text strong { display:block; font-size:14px; }
    #nexo-chat-header-text span { font-size:11px; opacity:.7; }
    #nexo-chat-close {
      background: none; border: none; color: #fff;
      cursor: pointer; font-size: 20px; line-height:1; padding:0;
    }

    #nexo-chat-body { padding: 16px; display:flex; flex-direction:column; gap:10px; }

    #nexo-chat-body input,
    #nexo-chat-body textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 9px 12px;
      font-size: 13px;
      font-family: Arial, sans-serif;
      outline: none;
      transition: border .2s;
      resize: none;
    }
    #nexo-chat-body input:focus,
    #nexo-chat-body textarea:focus { border-color: #0A0A0A; }
    #nexo-chat-body textarea { height: 80px; }

    #nexo-chat-send {
      background: #0A0A0A;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      transition: background .2s;
      width: 100%;
    }
    #nexo-chat-send:hover:not(:disabled) { background: #333; }
    #nexo-chat-send:disabled { opacity: .6; cursor: default; }

    #nexo-chat-ok {
      display: none;
      flex-direction: column;
      align-items: center;
      padding: 28px 16px;
      gap: 10px;
      text-align: center;
      color: #333;
      font-family: Arial, sans-serif;
    }
    #nexo-chat-ok svg { width:48px; height:48px; color:#22c55e; }
    #nexo-chat-ok strong { font-size:15px; }
    #nexo-chat-ok span { font-size:12px; color:#777; }
  `;

  // Inyectar estilos
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Botón flotante
  const btn = document.createElement('button');
  btn.id = 'nexo-chat-btn';
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <span id="nexo-chat-badge"></span>
  `;
  document.body.appendChild(btn);

  // Caja de chat
  const box = document.createElement('div');
  box.id = 'nexo-chat-box';
  box.innerHTML = `
    <div id="nexo-chat-header">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <div id="nexo-chat-header-text">
        <strong>Escríbenos</strong>
        <span>Te respondemos por este medio</span>
      </div>
      <button id="nexo-chat-close" aria-label="Cerrar">✕</button>
    </div>

    <div id="nexo-chat-body">
      <input type="text"  id="nexo-chat-nombre"  placeholder="Tu nombre (opcional)" maxlength="80">
      <input type="email" id="nexo-chat-email"   placeholder="Tu correo (opcional)"  maxlength="120">
      <textarea           id="nexo-chat-mensaje"  placeholder="¿En qué te podemos ayudar?" maxlength="800"></textarea>
      <button id="nexo-chat-send">Enviar mensaje</button>
    </div>

    <div id="nexo-chat-ok">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <strong>¡Mensaje enviado!</strong>
      <span>Lo recibimos y te responderemos pronto.</span>
    </div>
  `;
  document.body.appendChild(box);

  // Lógica
  let abierto = false;

  function abrir() {
    abierto = true;
    box.style.display = 'flex';
  }
  function cerrar() {
    abierto = false;
    box.style.display = 'none';
  }

  btn.addEventListener('click', () => abierto ? cerrar() : abrir());
  document.getElementById('nexo-chat-close').addEventListener('click', cerrar);

  document.getElementById('nexo-chat-send').addEventListener('click', async () => {
    const nombre  = document.getElementById('nexo-chat-nombre').value.trim();
    const email   = document.getElementById('nexo-chat-email').value.trim();
    const mensaje = document.getElementById('nexo-chat-mensaje').value.trim();

    if (!mensaje) {
      document.getElementById('nexo-chat-mensaje').focus();
      return;
    }

    const sendBtn = document.getElementById('nexo-chat-send');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando…';

    try {
      const res = await fetch('/.netlify/functions/chat-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, mensaje })
      });

      if (res.ok) {
        document.getElementById('nexo-chat-body').style.display = 'none';
        document.getElementById('nexo-chat-ok').style.display = 'flex';
      } else {
        throw new Error('Error del servidor');
      }
    } catch (e) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Enviar mensaje';
      alert('No se pudo enviar el mensaje. Intenta nuevamente.');
    }
  });

  // Enter en textarea → no envía (es multilínea)
  document.getElementById('nexo-chat-mensaje').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      document.getElementById('nexo-chat-send').click();
    }
  });

})();
