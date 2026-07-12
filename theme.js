/* ============================================================
   NEXO — Modo noche compartido
   Inyecta un botón flotante 🌙 / ☀️ en cualquier página que
   incluya este script. La preferencia se guarda en sessionStorage
   y se aplica antes del primer render para evitar flash.
   ============================================================ */

(function() {
  const KEY = 'nexo_theme';

  // 1) Aplicar el tema guardado o calcular automático según la hora (19:00 - 07:00 es noche)
  function aplicarTemaGuardado() {
    let saved = sessionStorage.getItem(KEY);
    if (!saved) {
      const hora = new Date().getHours();
      saved = (hora >= 19 || hora < 7) ? 'dark' : 'light';
    }
    const dark = saved === 'dark';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
  aplicarTemaGuardado();

  // 2) Overrides CSS de modo noche — sobrescriben las variables :root
  //    de cada página cuando data-theme="dark" está en <html>.
  const style = document.createElement('style');
  style.id = 'nexo-theme-style';
  style.textContent = `
    /* ===== Paleta modo noche: GRIS OSCURO legible (no negro puro) ===== */
    :root[data-theme="dark"] {
      --bg: #1b1b20 !important;        /* fondo gris oscuro */
      --ink: #f2f2f4 !important;       /* texto claro y nítido */
      --ink-soft: #d6d6db !important;
      --ink-mute: #a8a8b0 !important;
      --line: #35353d !important;
      --red: #ff6468 !important;
      --green: #3ddc6a !important;
      --blue: #6b93ff !important;
      --surface: #26262d !important;
    }
    /* Fondo general de la página */
    :root[data-theme="dark"] body {
      background: var(--bg) !important;
      color: var(--ink) !important;
    }
    /* Superficies (tarjetas / paneles) — un poco más claras que el fondo */
    :root[data-theme="dark"] .form-card,
    :root[data-theme="dark"] .card,
    :root[data-theme="dark"] .doc-card,
    :root[data-theme="dark"] .section,
    :root[data-theme="dark"] .form-body,
    :root[data-theme="dark"] .upload-panel,
    :root[data-theme="dark"] .id-card,
    :root[data-theme="dark"] .pricing-card,
    :root[data-theme="dark"] .flow-step,
    :root[data-theme="dark"] .file-preview,
    :root[data-theme="dark"] .user-menu,
    :root[data-theme="dark"] .doc-img-card,
    :root[data-theme="dark"] .modal-content,
    :root[data-theme="dark"] .perfil-box,
    :root[data-theme="dark"] .edit-perfil,
    :root[data-theme="dark"] .save-bar,
    :root[data-theme="dark"] .header,
    :root[data-theme="dark"] .back-btn,
    :root[data-theme="dark"] .perfil-tabs,
    :root[data-theme="dark"] .vehiculo-block,
    :root[data-theme="dark"] .btn-add-veh,
    :root[data-theme="dark"] .vence-row input,
    :root[data-theme="dark"] .progress-bar,
    :root[data-theme="dark"] .success-summary,
    :root[data-theme="dark"] .summary-info,
    :root[data-theme="dark"] .info-line,
    :root[data-theme="dark"] .next-card,
    :root[data-theme="dark"] .step-panel .card,
    :root[data-theme="dark"] .resumen-row,
    :root[data-theme="dark"] .pay-opt,
    :root[data-theme="dark"] .perfil-opt,
    :root[data-theme="dark"] .field,
    :root[data-theme="dark"] .theme-dot-wrap,
    :root[data-theme="dark"] .stats {
      background: #26262d !important;
      color: var(--ink) !important;
      border-color: var(--line) !important;
    }
    /* Header con borde inferior en oscuro */
    :root[data-theme="dark"] .header {
      border-bottom-color: var(--line) !important;
    }
    /* Encabezados que YA eran oscuros: mantener oscuro con texto claro */
    :root[data-theme="dark"] .perfil-card,
    :root[data-theme="dark"] .owner-card {
      background: linear-gradient(135deg,#202027,#2b2b33) !important;
      border-color: var(--line) !important;
    }
    /* Inputs / zonas de subida */
    :root[data-theme="dark"] input,
    :root[data-theme="dark"] select,
    :root[data-theme="dark"] textarea,
    :root[data-theme="dark"] .field input,
    :root[data-theme="dark"] .field select {
      background: #2f2f38 !important;
      color: var(--ink) !important;
      border-color: var(--line) !important;
    }
    :root[data-theme="dark"] input::placeholder,
    :root[data-theme="dark"] textarea::placeholder { color: #8a8a92 !important; }
    :root[data-theme="dark"] .upload-zone {
      background: #2f2f38 !important; border-color: var(--line) !important;
    }

    /* ===== BOTONES PRIMARIOS (en claro: fondo negro var(--ink) + texto blanco) =====
       En oscuro var(--ink) es claro → el texto blanco desaparecería.
       Los forzamos a un OSCURO ELEVADO para que texto e íconos blancos se vean. */
    :root[data-theme="dark"] .btn-main,
    :root[data-theme="dark"] .btn-primary,
    :root[data-theme="dark"] .btn.btn-primary,
    :root[data-theme="dark"] .btn-save.primary,
    :root[data-theme="dark"] .btn-upload.primary,
    :root[data-theme="dark"] .btn-action.primary,
    :root[data-theme="dark"] .pm-btn.primary,
    :root[data-theme="dark"] .btn-ep.primary,
    :root[data-theme="dark"] .pwa-btn-primary,
    :root[data-theme="dark"] .nav-cta,
    :root[data-theme="dark"] .brand-logo,
    :root[data-theme="dark"] .user-badge,
    :root[data-theme="dark"] .admin-badge,
    :root[data-theme="dark"] .section-count,
    :root[data-theme="dark"] .doc-icon,
    :root[data-theme="dark"] .btn-replace,
    :root[data-theme="dark"] .next-card .ic,
    :root[data-theme="dark"] .user-chip .av,
    :root[data-theme="dark"] .ptab.active,
    :root[data-theme="dark"] .tab.active,
    :root[data-theme="dark"] .profile-tab.active,
    :root[data-theme="dark"] .sim-btn.active,
    :root[data-theme="dark"] .step-dot.active,
    :root[data-theme="dark"] .step-bar.active,
    :root[data-theme="dark"] .perfil-opt.selected .p-icon,
    :root[data-theme="dark"] .perfil-opt.selected .check,
    :root[data-theme="dark"] .veh-chip.active,
    :root[data-theme="dark"] .toast,
    :root[data-theme="dark"] .home-toast,
    :root[data-theme="dark"] .btt {
      background: #34343f !important;
      color: #ffffff !important;
      border-color: #47474f !important;
    }
    /* Botón "Inicio" (logo verde de marca): mantener el verde, con texto oscuro
       para buen contraste sobre el verde más brillante del modo noche */
    :root[data-theme="dark"] .header-logo {
      background: var(--green) !important;
      color: #0A0A0A !important;
      border-color: transparent !important;
    }
    :root[data-theme="dark"] .header-logo svg { fill: #0A0A0A !important; }
    /* Sección "flujo" (fondo negro en claro) → mantener oscura y legible */
    :root[data-theme="dark"] .flow-section {
      background: #202027 !important;
      color: #ffffff !important;
    }
    :root[data-theme="dark"] .btn-main:hover,
    :root[data-theme="dark"] .btn-primary:hover,
    :root[data-theme="dark"] .btn.btn-primary:hover { background: #3f3f4b !important; }

    /* ===== BOTONES SECUNDARIOS (en claro: fondo blanco + texto oscuro) =====
       Tienen background:#fff fijo → en oscuro el texto claro se perdería. */
    :root[data-theme="dark"] .btn-social,
    :root[data-theme="dark"] .btn-save.secondary,
    :root[data-theme="dark"] .btn-upload.secondary,
    :root[data-theme="dark"] .pm-btn.secondary,
    :root[data-theme="dark"] .btn-ep.secondary,
    :root[data-theme="dark"] .btn.btn-secondary,
    :root[data-theme="dark"] .preview-btn,
    :root[data-theme="dark"] .copy-btn,
    :root[data-theme="dark"] .veh-chip {
      background: #2c2c34 !important;
      color: var(--ink) !important;
      border-color: var(--line) !important;
    }

    /* Textos atenuados: legibles */
    :root[data-theme="dark"] .price-features li,
    :root[data-theme="dark"] .perfil-desc,
    :root[data-theme="dark"] .price-tagline,
    :root[data-theme="dark"] .section-lede { color: var(--ink-soft) !important; }

    /* Nav translúcida */
    :root[data-theme="dark"] nav {
      background: rgba(20,20,24,0.85) !important;
      border-bottom-color: var(--line) !important;
    }
    /* Menú de usuario (home): un poco más claro y con texto legible en oscuro */
    :root[data-theme="dark"] .user-menu {
      background: #313139 !important;
      border-color: #45454f !important;
    }
    :root[data-theme="dark"] .user-menu a,
    :root[data-theme="dark"] .user-menu button {
      color: var(--ink) !important;
    }
    :root[data-theme="dark"] .user-menu a:hover,
    :root[data-theme="dark"] .user-menu button:hover {
      background: #43434e !important;
    }
    :root[data-theme="dark"] .user-menu .logout { color: #ff6468 !important; }
    :root[data-theme="dark"] .user-menu hr { border-top-color: var(--line) !important; }

    /* Badge neutro + miniatura de archivo */
    :root[data-theme="dark"] .doc-badge:not(.ok):not(.miss):not(.warn) {
      background: #35353d !important; color: var(--ink) !important;
    }
    :root[data-theme="dark"] .doc-file-thumb { background: #2f2f38 !important; }

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

  // Re-mover el <style> al final del <body> apenas exista, para que en la cascada
  // CSS gane a las reglas !important declaradas dentro del <style> de cada página.
  function moverAlFinal() {
    if (document.body && style.parentNode !== document.body) {
      document.body.appendChild(style);
    }
  }
  if (document.body) moverAlFinal();
  else document.addEventListener('DOMContentLoaded', moverAlFinal);

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
      sessionStorage.setItem(KEY, nuevo);
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
