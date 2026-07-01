/* ============================================================
   NEXO — Modo noche compartido
   Inyecta un botón flotante 🌙 / ☀️ en cualquier página que
   incluya este script. La preferencia se guarda en localStorage
   y se aplica antes del primer render para evitar flash.
   ============================================================ */

(function() {
  const KEY = 'nexo_theme';

  // 1) Aplicar el tema guardado ANTES del primer render
  function aplicarTemaGuardado() {
    const saved = localStorage.getItem(KEY);
    const dark = saved === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  aplicarTemaGuardado();

  // 2) Overrides CSS de modo noche — sobrescriben las variables :root
  //    de cada página cuando data-theme="dark" está en <html>.
  const style = document.createElement('style');
  style.id = 'nexo-theme-style';
  style.textContent = `
    :root[data-theme="dark"] {
      --bg: #0d0d10 !important;
      --ink: #ececed !important;
      --ink-soft: #d1d1d5 !important;
      --ink-mute: #9a9aa2 !important;
      --line: #2a2a30 !important;
      --red: #ff5a5f !important;
      --green: #34C759 !important;
    }
    :root[data-theme="dark"] body,
    :root[data-theme="dark"] .form-card,
    :root[data-theme="dark"] .card,
    :root[data-theme="dark"] .doc-card,
    :root[data-theme="dark"] .section,
    :root[data-theme="dark"] .form-body,
    :root[data-theme="dark"] .upload-panel,
    :root[data-theme="dark"] .id-card,
    :root[data-theme="dark"] .perfil-card,
    :root[data-theme="dark"] .pricing-card,
    :root[data-theme="dark"] .flow-step,
    :root[data-theme="dark"] .owner-card,
    :root[data-theme="dark"] .file-preview,
    :root[data-theme="dark"] .user-menu {
      background: #17171b !important;
      color: var(--ink) !important;
      border-color: var(--line) !important;
    }
    :root[data-theme="dark"] input,
    :root[data-theme="dark"] select,
    :root[data-theme="dark"] textarea,
    :root[data-theme="dark"] .field input,
    :root[data-theme="dark"] .field select {
      background: #1c1c22 !important;
      color: var(--ink) !important;
      border-color: var(--line) !important;
    }
    :root[data-theme="dark"] input::placeholder,
    :root[data-theme="dark"] textarea::placeholder {
      color: #666 !important;
    }
    :root[data-theme="dark"] .upload-zone {
      background: #1c1c22 !important;
      border-color: var(--line) !important;
    }
    :root[data-theme="dark"] .doc-badge:not(.ok):not(.miss):not(.warn) {
      background: #2a2a30 !important;
    }
    :root[data-theme="dark"] .price-features li,
    :root[data-theme="dark"] .perfil-desc,
    :root[data-theme="dark"] .price-tagline,
    :root[data-theme="dark"] .section-lede { color: var(--ink-soft) !important; }
    :root[data-theme="dark"] nav {
      background: rgba(13,13,16,0.85) !important;
      border-bottom-color: var(--line) !important;
    }
    :root[data-theme="dark"] .modal-content,
    :root[data-theme="dark"] .save-bar {
      background: #17171b !important;
      border-color: var(--line) !important;
    }
    :root[data-theme="dark"] .doc-img-card {
      background: #17171b !important;
      border-color: var(--line) !important;
    }

    /* Botón flotante */
    .nexo-theme-toggle {
      position: fixed;
      bottom: 24px;
      left: 24px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #0A0A0A;
      color: #fff;
      border: none;
      font-size: 20px;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s, background 0.2s;
      -webkit-tap-highlight-color: transparent;
    }
    .nexo-theme-toggle:hover { transform: scale(1.1); }
    .nexo-theme-toggle:active { transform: scale(0.95); }
    :root[data-theme="dark"] .nexo-theme-toggle {
      background: #ececed;
      color: #0A0A0A;
    }
    @media (max-width: 640px) {
      .nexo-theme-toggle { bottom: 16px; left: 16px; width: 40px; height: 40px; font-size: 18px; }
    }
  `;
  document.head.appendChild(style);

  // 3) Inyectar botón flotante al cargar el DOM
  function crearBoton() {
    if (document.getElementById('nexoThemeToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'nexoThemeToggle';
    btn.className = 'nexo-theme-toggle';
    btn.title = 'Cambiar modo claro / noche';
    btn.setAttribute('aria-label', 'Cambiar tema');
    actualizarIcono(btn);
    btn.addEventListener('click', () => {
      const actual = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const nuevo = actual === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nuevo);
      localStorage.setItem(KEY, nuevo);
      actualizarIcono(btn);
    });
    document.body.appendChild(btn);
  }
  function actualizarIcono(btn) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.textContent = dark ? '☀️' : '🌙';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', crearBoton);
  } else {
    crearBoton();
  }

  // Exponer para uso desde otros scripts
  window.nexoToggleTheme = function() {
    const btn = document.getElementById('nexoThemeToggle');
    if (btn) btn.click();
  };
})();
