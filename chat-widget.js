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
    #nexo-chat-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      width: 100vw; height: 100dvh;
      background: rgba(0, 0, 0, 0.52);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9996; display: none; opacity: 0;
      transition: opacity .25s ease;
    }

    #nexo-chat-box {
      position: fixed; bottom: 94px; right: 24px;
      width: 350px; max-width: calc(100vw - 48px);
      height: 480px; max-height: calc(100vh - 130px);
      background: #fff; border-radius: 20px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.18);
      z-index: 9999; display: none; flex-direction: column;
      overflow: hidden; font-family: 'Outfit', -apple-system, sans-serif;
      animation: nexoChatIn .22s ease;
    }
    @keyframes nexoChatIn {
      from { opacity:0; transform: translateY(16px) scale(.97); }
      to   { opacity:1; transform: translateY(0) scale(1); }
    }

    #nexo-chat-header {
      background: #0A0A0A; color: #fff; padding: 15px 18px;
      display: flex; align-items: center; gap: 10px; flex-shrink: 0;
      position: sticky; top: 0; z-index: 10;
    }
    #nexo-chat-header svg { width:24px; height:24px; flex-shrink:0; }
    #nexo-chat-header-text { flex:1; }
    #nexo-chat-header-text strong { display:block; font-size:16px; font-weight: 700; letter-spacing: -0.01em; color: #fff; }
    #nexo-chat-header-text span { font-size:12px; opacity:.7; color: #fff; }
    #nexo-chat-close {
      background: none; border: none; color: #fff; cursor: pointer;
      font-size: 20px; line-height:1; padding:0; opacity: .8;
    }
    #nexo-chat-close:hover { opacity: 1; }

    #nexo-chat-msgs {
      flex: 1; min-height: 0; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      background: #f7f7f8; -webkit-overflow-scrolling: touch;
    }
    .nexo-msg {
      max-width: 82%; padding: 11px 15px; border-radius: 18px;
      font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word;
    }
    .nexo-msg.visitante {
      align-self: flex-end; background: #0A0A0A; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .nexo-msg.admin {
      align-self: flex-start; background: #fff; color: #111;
      border: 1px solid #e3e3e6; border-bottom-left-radius: 4px;
    }
    .nexo-meta { display: block; font-size: 11px; margin-top: 4px; text-align: right; opacity: .7; }
    .nexo-msg.admin .nexo-meta { color: #888; }
    .nexo-check { margin-left: 3px; letter-spacing: -2px; }
    .nexo-check.read { color: #34B7F1; }

    #nexo-chat-typing {
      display: none; padding: 4px 16px 8px; font-size: 12px; color: #888;
      background: #f7f7f8; align-items: center; gap: 6px;
    }
    .nexo-dots { display: inline-flex; gap: 3px; }
    .nexo-dots i { width: 5px; height: 5px; border-radius: 50%; background: #999; display: inline-block; animation: nexoDot 1.2s infinite ease-in-out; }
    .nexo-dots i:nth-child(2) { animation-delay: .2s; }
    .nexo-dots i:nth-child(3) { animation-delay: .4s; }
    @keyframes nexoDot { 0%,60%,100% { opacity:.3; transform: translateY(0);} 30% { opacity:1; transform: translateY(-2px);} }

    #nexo-chat-contact { padding: 14px 16px 0; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; background: #fff; }
    #nexo-chat-contact input {
      width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 10px;
      padding: 10px 13px; font-size: 14px; font-family: inherit; outline: none; transition: border-color .15s ease;
    }
    #nexo-chat-contact input:focus { border-color: #0A0A0A; }

    #nexo-chat-footer {
      display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid #eee; flex-shrink: 0; background: #fff;
    }
    #nexo-chat-input {
      flex: 1; box-sizing: border-box; border: 1px solid #ddd; border-radius: 20px;
      padding: 10px 16px; font-size: 15px; font-family: inherit; outline: none; resize: none; transition: border-color .15s ease;
    }
    #nexo-chat-input:focus { border-color: #0A0A0A; }

    @media (max-width: 480px) {
      #nexo-chat-box {
        position: fixed;
        top: 110px; bottom: 30px; left: 6px; right: 6px;
        width: calc(100vw - 12px); max-width: 480px;
        height: auto; max-height: calc(100dvh - 140px);
        border-radius: 20px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.3);
        margin: 0 auto;
      }
      #nexo-chat-header-text strong { font-size: 20px; }
      #nexo-chat-header-text span { font-size: 15px; }
      .nexo-msg { font-size: 19px; line-height: 1.48; max-width: 88%; padding: 14px 18px; border-radius: 20px; }
      .nexo-meta { font-size: 13px; margin-top: 5px; }
      #nexo-chat-input, #nexo-chat-contact input {
        font-size: 19px; padding: 14px 18px;
      }
    }
    #nexo-chat-sendbtn {
      background: #0A0A0A; color: #fff; border: none; border-radius: 50%;
      width: 42px; height: 42px; flex-shrink: 0; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    #nexo-chat-sendbtn:hover:not(:disabled) { background: #333; }
    #nexo-chat-sendbtn:disabled { opacity: .5; cursor: default; }
    #nexo-chat-sendbtn svg { width: 19px; height: 19px; }
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
    <div id="nexo-chat-typing"><span class="nexo-dots"><i></i><i></i><i></i></span> escribiendo…</div>
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

  const overlay = document.createElement('div');
  overlay.id = 'nexo-chat-overlay';
  document.body.appendChild(overlay);

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
  let mensajes = [];       // lista completa de la conversación
  let sig = '';            // firma para evitar re-render innecesario
  let pollTimer = null;
  let abierto = false;
  let canal = null;        // canal Realtime (typing)
  let typingHideTimer = null;
  let lastTypingSent = 0;

  function genId() {
    if (typeof window !== 'undefined' && window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function hora(fecha) {
    if (!fecha) return '';
    try { return new Date(fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function scrollMsgsToBottom() {
    const doScroll = () => { if ($msgs) $msgs.scrollTop = $msgs.scrollHeight; };
    doScroll();
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 60);
    setTimeout(doScroll, 200);
  }

  function renderThread() {
    let html = `<div class="nexo-msg admin"><span>¡Hola! 👋 Escríbenos tu consulta y te respondemos por aquí mismo.</span></div>`;
    html += mensajes.map(m => {
      const esVisit = m.de !== 'admin';
      // Vistos solo en los mensajes del propio visitante
      const check = esVisit
        ? `<span class="nexo-check ${m.leido ? 'read' : ''}">${m.leido ? '✓✓' : '✓'}</span>`
        : '';
      return `<div class="nexo-msg ${esVisit ? 'visitante' : 'admin'}">`
        + `<span>${esc(m.mensaje)}</span>`
        + `<span class="nexo-meta">${hora(m.fecha)}${check}</span>`
        + `</div>`;
    }).join('');
    $msgs.innerHTML = html;
    scrollMsgsToBottom();
  }

  let conocidosAdminMsgIds = null;

  function reproducirSonidoGota() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      // Gota principal (sweep de frecuencia ascendente 450Hz -> 1300Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(450, now);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.08);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);

      // Resonancia secundaria (eco sutil tipo gota de agua)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(900, now + 0.02);
      osc2.frequency.exponentialRampToValueAtTime(1600, now + 0.09);

      gain2.gain.setValueAtTime(0, now + 0.02);
      gain2.gain.linearRampToValueAtTime(0.15, now + 0.035);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.02);
      osc2.stop(now + 0.15);
    } catch (e) { /* audio fallback */ }
  }

  async function poll() {
    if (!convId) return;
    try {
      const r = await fetch(API_POLL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversacion_id: convId })
      });
      if (!r.ok) return;
      const data = await r.json();
      mensajes = data.mensajes || [];

      const currentIds = new Set();
      let hayNuevoAdmin = false;
      mensajes.forEach(m => {
        currentIds.add(m.id);
        if (conocidosAdminMsgIds !== null && !conocidosAdminMsgIds.has(m.id) && m.de === 'admin') {
          hayNuevoAdmin = true;
        }
      });

      if (conocidosAdminMsgIds === null) {
        conocidosAdminMsgIds = currentIds;
      } else {
        conocidosAdminMsgIds = currentIds;
        if (hayNuevoAdmin) {
          reproducirSonidoGota();
        }
      }

      const nuevaSig = mensajes.map(m => m.id + (m.leido ? '1' : '0')).join('|');
      if (nuevaSig !== sig) { sig = nuevaSig; renderThread(); }
    } catch (e) { /* silencioso: reintenta en el próximo ciclo */ }
  }

  function startPoll() { stopPoll(); pollTimer = setInterval(poll, POLL_MS); }
  function stopPoll()  { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // --- "escribiendo…" en tiempo real (Supabase Realtime broadcast) ---
  function suscribirCanal() {
    const sb = window.sb;
    if (!sb || !convId || canal) return;
    canal = sb.channel('chat-' + convId, { config: { broadcast: { self: false } } });
    canal.on('broadcast', { event: 'typing' }, (msg) => {
      if (msg && msg.payload && msg.payload.from === 'admin') mostrarEscribiendo();
    });
    canal.subscribe();
  }
  function desuscribirCanal() {
    if (canal && window.sb) { try { window.sb.removeChannel(canal); } catch (e) {} }
    canal = null;
    ocultarEscribiendo();
  }
  function enviarTyping() {
    const now = Date.now();
    if (!canal || now - lastTypingSent < 1500) return;   // throttle
    lastTypingSent = now;
    try { canal.send({ type: 'broadcast', event: 'typing', payload: { from: 'visitante' } }); } catch (e) {}
  }
  function mostrarEscribiendo() {
    const el = document.getElementById('nexo-chat-typing');
    if (!el) return;
    el.style.display = 'flex';
    scrollMsgsToBottom();
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(ocultarEscribiendo, 3000);
  }
  function ocultarEscribiendo() {
    const el = document.getElementById('nexo-chat-typing');
    if (el) el.style.display = 'none';
  }

  function actualizarContacto() {
    $contact.style.display = (info && (info.nombre || info.telefono)) ? 'none' : 'flex';
    if (info) {
      if (info.nombre)   $nombre.value = info.nombre;
      if (info.telefono) $tel.value    = info.telefono;
    }
  }

  async function enviar() {
    const mensaje = $input.value.trim();
    if (!mensaje) { $input.focus(); return; }

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
      suscribirCanal(); // por si convId se acaba de crear
      await poll(); // trae el mensaje recién guardado
      scrollMsgsToBottom();
    } catch (e) {
      alert('No se pudo enviar el mensaje. Intenta nuevamente.');
    } finally {
      $send.disabled = false;
      $input.focus();
      scrollMsgsToBottom();
    }
  }

  function abrir() {
    abierto = true;
    box.style.display = 'flex';
    document.getElementById('nexo-chat-badge').style.display = 'none';
    if (window.innerWidth <= 480) {
      overlay.style.display = 'block';
      requestAnimationFrame(() => { overlay.style.opacity = '1'; });
      document.body.style.overflow = 'hidden';
    }
    renderThread();          // muestra el saludo + historial en memoria
    actualizarContacto();
    if (convId) poll();      // historial completo desde el servidor
    startPoll();
    suscribirCanal();
    scrollMsgsToBottom();
    setTimeout(() => { $input.focus(); scrollMsgsToBottom(); }, 100);
  }
  function cerrar() {
    abierto = false;
    box.style.display = 'none';
    box.style.top = '';
    box.style.bottom = '';
    box.style.height = '';
    box.style.maxHeight = '';
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.style.display = 'none'; }, 250);
    document.body.style.overflow = '';
    stopPoll();
    desuscribirCanal();
  }

  btn.addEventListener('click', () => abierto ? cerrar() : abrir());
  overlay.addEventListener('click', cerrar);
  box.querySelector('#nexo-chat-close').addEventListener('click', cerrar);
  $send.addEventListener('click', enviar);
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
  });
  $input.addEventListener('input', () => { enviarTyping(); scrollMsgsToBottom(); });
  $input.addEventListener('focus', scrollMsgsToBottom);
  $nombre.addEventListener('focus', scrollMsgsToBottom);
  $tel.addEventListener('focus', scrollMsgsToBottom);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (abierto && window.innerWidth <= 480) {
        const vv = window.visualViewport;
        const isKeyboardOpen = vv.height < window.innerHeight - 80;
        if (isKeyboardOpen) {
          box.style.top = `${vv.offsetTop + 8}px`;
          box.style.bottom = 'auto';
          box.style.height = `${vv.height - 16}px`;
          box.style.maxHeight = `${vv.height - 16}px`;
        } else {
          box.style.top = '';
          box.style.bottom = '';
          box.style.height = '';
          box.style.maxHeight = '';
        }
        scrollMsgsToBottom();
      }
    });
    window.visualViewport.addEventListener('scroll', () => {
      if (abierto && window.innerWidth <= 480 && window.visualViewport.height < window.innerHeight - 80) {
        box.style.top = `${window.visualViewport.offsetTop + 8}px`;
        scrollMsgsToBottom();
      }
    });
  }
})();
