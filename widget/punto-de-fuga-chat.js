/*!
 * Asistente virtual de Punto de Fuga: widget de chat embebible.
 * Un solo archivo, sin dependencias. Se aísla con Shadow DOM.
 *
 * Instalación:
 *   etiqueta script con src="punto-de-fuga-chat.js", defer y data-endpoint="https://TU-N8N/webhook/punto-de-fuga-asistente"
 *
 * Atributos data-* opcionales:
 *   data-endpoint     URL del webhook (usa "mock" para probar sin backend)
 *   data-demo-url     enlace de "Agendar demo"
 *   data-privacy-url  enlace a la política de privacidad
 *   data-accent       color principal (botón, burbujas del usuario)   por defecto #C6FF34 (verde lima)
 *   data-ink          color de la cabecera                            por defecto #14213D
 *   data-position     "right" (por defecto) o "left"
 *   data-title        título de la cabecera
 *   data-auto-open    "true" para abrirlo al cargar
 *   data-teaser       "false" para quitar el aviso emergente que sale a los 6 segundos
 *   data-bottom       separación con el borde inferior en px (por defecto 20)
 *   data-side         separación con el borde lateral en px (por defecto 20)
 */
(function () {
  'use strict';

  if (window.__pdfChatLoaded) return;
  window.__pdfChatLoaded = true;

  var script = document.currentScript || document.querySelector('script[src*="punto-de-fuga-chat"]');
  function attr(name, fallback) {
    var v = script && script.getAttribute('data-' + name);
    return v === null || v === undefined || v === '' ? fallback : v;
  }

  var cfg = {
    endpoint: attr('endpoint', ''),
    demoUrl: attr('demo-url', 'https://puntodefugavr.site.je/agendar-demo/'),
    privacyUrl: attr('privacy-url', ''),
    accent: attr('accent', '#C6FF34'),
    ink: attr('ink', '#14213D'),
    position: attr('position', 'right') === 'left' ? 'left' : 'right',
    title: attr('title', 'Asistente de Punto de Fuga'),
    autoOpen: attr('auto-open', 'false') === 'true',
    teaser: attr('teaser', 'true') !== 'false',
    bottom: Math.max(0, parseInt(attr('bottom', '20'), 10) || 0),
    side: Math.max(0, parseInt(attr('side', '20'), 10) || 0)
  };

  // Texto legible sobre el color de marca: oscuro si el fondo es claro (p. ej. verde lima), blanco si es oscuro.
  function readableOn(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return '#ffffff';
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    var ch = [0, 2, 4].map(function (i) {
      var v = parseInt(h.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return lum > 0.35 ? '#111827' : '#ffffff';
  }
  cfg.onAccent = readableOn(cfg.accent);

  var MAX_CHARS = 500;
  var MAX_USER_MESSAGES = 30;
  var REQUEST_TIMEOUT_MS = 45000;
  var HISTORY_KEY = 'pdf-chat-history';
  var SESSION_KEY = 'pdf-chat-session';
  var TEASER_KEY = 'pdf-chat-teaser';

  var WELCOME =
    'Hola, soy el asistente de Punto de Fuga. Te ayudo a encontrar espacios para eventos en Madrid, con ficha técnica verificada y tour 360°. ¿Qué necesitas?';
  var FALLBACK_ERROR =
    'Ahora mismo no puedo responderte. Puedes dejar tus datos en Agendar demo y una persona del equipo te contactará en menos de 24 horas.';
  var QUICK_REPLIES = [
    '¿Cómo funciona?',
    'Busco espacio para un evento',
    'Planes y precios',
    'Tengo un espacio y quiero publicarlo'
  ];

  /* ---------- almacenamiento seguro ---------- */
  function store(kind) {
    try {
      var s = window[kind];
      s.setItem('__t', '1');
      s.removeItem('__t');
      return s;
    } catch (e) {
      return null;
    }
  }
  var local = store('localStorage');
  var session = store('sessionStorage');
  function read(s, key) {
    try { return s ? s.getItem(key) : null; } catch (e) { return null; }
  }
  function write(s, key, value) {
    try { if (s) s.setItem(key, value); } catch (e) { /* sin almacenamiento */ }
  }

  function uid() {
    var a = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(a);
    } else {
      for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    }
    var out = '';
    for (var j = 0; j < a.length; j++) out += ('0' + a[j].toString(16)).slice(-2);
    return 'web-' + out;
  }
  var sessionId = read(local, SESSION_KEY);
  if (!sessionId) {
    sessionId = uid();
    write(local, SESSION_KEY, sessionId);
  }

  /* ---------- helpers DOM ---------- */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function icon(pathD, size) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 24);
    s.setAttribute('height', size || 24);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', pathD);
    s.appendChild(p);
    return s;
  }
  var ICON_CHAT = 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.5-.7L3 21l1.9-5.2A8.4 8.4 0 1 1 21 11.5z';
  var ICON_CLOSE = 'M18 6 6 18M6 6l12 12';
  var ICON_SEND = 'M22 2 11 13M22 2l-7 20-4-9-9-4z';

  /* ---------- texto enriquecido seguro (sin innerHTML) ---------- */
  var INLINE_RE = /(\*\*[^*\n]+\*\*)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?])/g;

  function renderInline(parent, text) {
    var last = 0;
    var m;
    INLINE_RE.lastIndex = 0;
    while ((m = INLINE_RE.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      if (m[1]) {
        parent.appendChild(el('strong', '', m[1].slice(2, -2)));
      } else {
        var a = el('a', '', m[2].replace(/^https?:\/\//, '').replace(/\/$/, ''));
        a.href = m[2];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.addEventListener('click', function () { emit('link', { href: this.href }); });
        parent.appendChild(a);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderRich(container, text) {
    var list = null;
    String(text).split('\n').forEach(function (line) {
      var item = line.match(/^\s*[-•*]\s+(.*)$/);
      if (item) {
        if (!list) {
          list = el('ul');
          container.appendChild(list);
        }
        var li = el('li');
        renderInline(li, item[1]);
        list.appendChild(li);
        return;
      }
      list = null;
      if (!line.trim()) return;
      var p = el('p');
      renderInline(p, line);
      container.appendChild(p);
    });
  }

  /* ---------- eventos para analítica ---------- */
  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent('pdf-chat:' + name, { detail: detail || {} }));
    } catch (e) { /* sin CustomEvent */ }
  }

  /* ---------- estilos ---------- */
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.root{--accent:' + cfg.accent + ';--on-accent:' + cfg.onAccent + ';--ink:' + cfg.ink + ';--bg:#ffffff;--surface:#f4f5f8;--text:#1b1f2a;--muted:#667085;--border:#e3e6ec;',
    'position:fixed;bottom:' + cfg.bottom + 'px;' + cfg.position + ':' + cfg.side + 'px;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.45;color:var(--text)}',
    '@media (prefers-color-scheme:dark){.root{--bg:#161a24;--surface:#222736;--text:#eef0f5;--muted:#9aa3b5;--border:#2d3345}}',
    'button{font:inherit;color:inherit;cursor:pointer}',
    '.launcher{width:60px;height:60px;border-radius:50%;border:0;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(20,33,61,.35);transition:transform .15s ease}',
    '.launcher:hover{transform:scale(1.06)}',
    '.launcher:focus-visible,.icon-btn:focus-visible,.chip:focus-visible,.send:focus-visible,textarea:focus-visible,a:focus-visible{outline:3px solid #7aa7ff;outline-offset:2px}',
    '.teaser{position:absolute;bottom:72px;' + cfg.position + ':0;max-width:240px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:14px;padding:10px 32px 10px 14px;box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:14px}',
    '.teaser button.t-open{all:unset;cursor:pointer}',
    '.teaser .t-close{position:absolute;top:4px;right:4px;width:24px;height:24px;border:0;background:none;color:var(--muted);border-radius:50%;display:flex;align-items:center;justify-content:center}',
    '.panel{position:absolute;bottom:0;' + cfg.position + ':0;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 40px);background:var(--bg);border:1px solid var(--border);border-radius:18px;box-shadow:0 20px 50px rgba(20,33,61,.35);display:flex;flex-direction:column;overflow:hidden;animation:pop .18s ease-out}',
    '@keyframes pop{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}',
    '.head{background:var(--ink);color:#fff;padding:14px 14px 14px 16px;display:flex;align-items:center;gap:12px}',
    '.avatar{width:38px;height:38px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;letter-spacing:.02em;flex:none}',
    '.head .titles{flex:1;min-width:0}',
    '.head .t1{font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.head .t2{font-size:12px;opacity:.8}',
    '.icon-btn{width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:#fff;display:flex;align-items:center;justify-content:center}',
    '.icon-btn:hover{background:rgba(255,255,255,.14)}',
    '.log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:var(--bg);scroll-behavior:smooth}',
    '.msg{max-width:86%;padding:10px 13px;border-radius:16px;word-wrap:break-word;overflow-wrap:anywhere}',
    '.msg p{margin:0}.msg p+p,.msg p+ul,.msg ul+p{margin-top:6px}',
    '.msg ul{margin:0;padding-left:18px}',
    '.msg a{color:inherit;text-decoration:underline;text-underline-offset:2px;font-weight:600}',
    '.msg.bot{align-self:flex-start;background:var(--surface);border-bottom-left-radius:5px}',
    '.msg.user{align-self:flex-end;background:var(--accent);color:var(--on-accent);border-bottom-right-radius:5px}',
    '.msg.error{align-self:flex-start;background:transparent;border:1px solid var(--border);color:var(--muted);font-size:14px}',
    '.typing{align-self:flex-start;background:var(--surface);border-radius:16px;border-bottom-left-radius:5px;padding:12px 14px;display:flex;gap:5px}',
    '.typing i{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:blink 1.2s infinite ease-in-out}',
    '.typing i:nth-child(2){animation-delay:.18s}.typing i:nth-child(3){animation-delay:.36s}',
    '@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px;padding-top:2px}',
    '.chip{border:2px solid var(--accent);background:transparent;color:var(--text);border-radius:999px;padding:7px 13px;font-size:14px}',
    '.chip:hover{background:var(--accent);color:var(--on-accent)}',
    '.demo-row{padding:0 16px 8px}',
    '.demo{display:block;text-align:center;text-decoration:none;border:1px solid var(--border);border-radius:10px;padding:8px;font-size:14px;color:var(--text);font-weight:600}',
    '.demo:hover{background:var(--surface)}',
    '.form{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;border-top:1px solid var(--border);background:var(--bg)}',
    'textarea{flex:1;resize:none;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:14px;padding:10px 12px;font:inherit;font-size:16px;max-height:110px;min-height:42px;line-height:1.35}',
    'textarea::placeholder{color:var(--muted)}',
    '.send{width:42px;height:42px;border-radius:50%;border:0;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center;flex:none}',
    '.send:disabled{opacity:.45;cursor:not-allowed}',
    '.foot{padding:0 16px 10px;font-size:11.5px;color:var(--muted);text-align:center;line-height:1.35}',
    '.foot a{color:inherit}',
    '.hidden{display:none!important}',
    '@media (max-width:480px){.root{bottom:12px;' + cfg.position + ':12px}.panel{position:fixed;inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0;border:0}.teaser{max-width:200px}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}'
  ].join('');

  /* ---------- construcción de la interfaz ---------- */
  var host = el('div');
  host.setAttribute('data-pdf-chat', '');
  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
  var style = el('style');
  style.textContent = CSS;
  shadow.appendChild(style);

  var root = el('div', 'root');
  shadow.appendChild(root);

  var launcher = el('button', 'launcher');
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Abrir el asistente de Punto de Fuga');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.appendChild(icon(ICON_CHAT, 28));

  var teaser = el('div', 'teaser hidden');
  var teaserOpen = el('button', 't-open', '¿Buscas espacio para tu evento? Te ayudo.');
  teaserOpen.type = 'button';
  var teaserClose = el('button', 't-close');
  teaserClose.type = 'button';
  teaserClose.setAttribute('aria-label', 'Cerrar aviso');
  teaserClose.appendChild(icon(ICON_CLOSE, 14));
  teaser.appendChild(teaserOpen);
  teaser.appendChild(teaserClose);

  var panel = el('section', 'panel hidden');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', cfg.title);

  var head = el('header', 'head');
  head.appendChild(el('div', 'avatar', 'PF'));
  var titles = el('div', 'titles');
  titles.appendChild(el('div', 't1', cfg.title));
  titles.appendChild(el('div', 't2', 'Asistente con IA · Responde al momento'));
  head.appendChild(titles);
  var closeBtn = el('button', 'icon-btn');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Cerrar el chat');
  closeBtn.appendChild(icon(ICON_CLOSE, 20));
  head.appendChild(closeBtn);

  var log = el('div', 'log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-label', 'Conversación');

  var demoRow = el('div', 'demo-row');
  var demoLink = el('a', 'demo', 'Agendar demo gratuita (25 min)');
  demoLink.href = cfg.demoUrl;
  demoLink.target = '_blank';
  demoLink.rel = 'noopener noreferrer';
  demoLink.addEventListener('click', function () { emit('demo-click', {}); });
  demoRow.appendChild(demoLink);

  var form = el('form', 'form');
  var input = el('textarea');
  input.rows = 1;
  input.maxLength = MAX_CHARS;
  input.placeholder = 'Escribe tu pregunta…';
  input.setAttribute('aria-label', 'Tu mensaje');
  var sendBtn = el('button', 'send');
  sendBtn.type = 'submit';
  sendBtn.setAttribute('aria-label', 'Enviar mensaje');
  sendBtn.appendChild(icon(ICON_SEND, 20));
  form.appendChild(input);
  form.appendChild(sendBtn);

  var foot = el('div', 'foot');
  foot.appendChild(document.createTextNode('Respuestas generadas por IA; pueden contener errores. Si dejas tus datos, los usaremos solo para contactarte sobre tu consulta.'));
  if (cfg.privacyUrl) {
    foot.appendChild(document.createTextNode(' '));
    var pa = el('a', '', 'Privacidad');
    pa.href = cfg.privacyUrl;
    pa.target = '_blank';
    pa.rel = 'noopener noreferrer';
    foot.appendChild(pa);
  }

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(demoRow);
  panel.appendChild(form);
  panel.appendChild(foot);
  root.appendChild(teaser);
  root.appendChild(panel);
  root.appendChild(launcher);

  /* ---------- estado y mensajes ---------- */
  var history = [];
  var userCount = 0;
  var busy = false;
  var chipsEl = null;
  var typingEl = null;
  var lastSend = 0;

  function saveHistory() {
    write(session, HISTORY_KEY, JSON.stringify(history.slice(-40)));
  }

  function scrollDown() {
    log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, text, persist) {
    var m = el('div', 'msg ' + role);
    if (role === 'user') m.textContent = text;
    else renderRich(m, text);
    log.appendChild(m);
    scrollDown();
    if (persist !== false && role !== 'error') {
      history.push({ role: role, text: text });
      saveHistory();
    }
    return m;
  }

  function showChips() {
    if (chipsEl) return;
    chipsEl = el('div', 'chips');
    chipsEl.setAttribute('role', 'group');
    chipsEl.setAttribute('aria-label', 'Preguntas frecuentes');
    QUICK_REPLIES.forEach(function (q) {
      var c = el('button', 'chip', q);
      c.type = 'button';
      c.addEventListener('click', function () { send(q); });
      chipsEl.appendChild(c);
    });
    log.appendChild(chipsEl);
    scrollDown();
  }
  function hideChips() {
    if (chipsEl && chipsEl.parentNode) chipsEl.parentNode.removeChild(chipsEl);
    chipsEl = null;
  }

  function showTyping() {
    typingEl = el('div', 'typing');
    typingEl.setAttribute('aria-label', 'El asistente está escribiendo');
    typingEl.appendChild(el('i'));
    typingEl.appendChild(el('i'));
    typingEl.appendChild(el('i'));
    log.appendChild(typingEl);
    scrollDown();
  }
  function hideTyping() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    input.disabled = v;
    if (!v && !panel.classList.contains('hidden')) input.focus();
  }

  /* ---------- backend ---------- */
  function mockReply(text) {
    var t = text.toLowerCase();
    var reply;
    if (/gafas|vr|360/.test(t)) {
      reply = 'No necesitas gafas: el tour 360° se abre en el navegador del móvil o del ordenador, sin instalar nada.\nhttps://puntodefugavr.site.je/como-funciona/';
    } else if (/precio|plan|cuesta|tarifa/.test(t)) {
      reply = 'Los precios y planes los confirma una persona del equipo para darte la información correcta. ¿Quieres que te contacten? Si es así, dime tu nombre.';
    } else if (/propietar|tengo un espacio|publicar/.test(t)) {
      reply = 'Puedes darlo de alta desde la página Propietarios. Te pedimos los datos del espacio y su documentación, y nosotros hacemos el tour 360°.\nhttps://puntodefugavr.site.je/propietarios/';
    } else if (/funciona/.test(t)) {
      reply = 'Es sencillo:\n- Nos cuentas tu evento: tipo, invitados, zona y fechas.\n- Te proponemos los 3 espacios que mejor encajan.\n- Los recorres en 360° y revisas su ficha técnica.\n- Pedimos la disponibilidad de tu fecha y decides.\nhttps://puntodefugavr.site.je/como-funciona/';
    } else {
      reply = 'Cuéntame un poco más: ¿qué tipo de evento es, para cuántas personas y en qué zona de Madrid?';
    }
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(reply); }, 700);
    });
  }

  function callBackend(text) {
    if (!cfg.endpoint) {
      return Promise.reject(new Error('no-endpoint'));
    }
    if (cfg.endpoint === 'mock') return mockReply(text);

    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    return fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId,
        page: location.pathname + location.search.slice(0, 80)
      }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error('http-' + res.status);
        return res.json();
      })
      .then(function (data) {
        var reply = data && (data.reply || data.output || data.text);
        if (!reply || typeof reply !== 'string') throw new Error('empty');
        return reply;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  function send(raw) {
    var text = String(raw || '').trim().slice(0, MAX_CHARS);
    if (!text || busy) return;
    var now = Date.now();
    if (now - lastSend < 800) return;
    lastSend = now;

    hideChips();
    if (userCount >= MAX_USER_MESSAGES) {
      addMessage('error', 'Has alcanzado el límite de mensajes de esta conversación. Para seguir, agenda una demo y una persona del equipo te atenderá.', false);
      return;
    }
    userCount += 1;
    addMessage('user', text);
    emit('message', { count: userCount });
    input.value = '';
    autosize();
    setBusy(true);
    showTyping();

    callBackend(text)
      .then(function (reply) {
        hideTyping();
        addMessage('bot', reply);
      })
      .catch(function () {
        hideTyping();
        addMessage('error', FALLBACK_ERROR, false);
        emit('error', {});
      })
      .then(function () { setBusy(false); });
  }

  /* ---------- interacción ---------- */
  function autosize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  }

  function openPanel() {
    hideTeaser(true);
    panel.classList.remove('hidden');
    launcher.classList.add('hidden');
    launcher.setAttribute('aria-expanded', 'true');
    scrollDown();
    input.focus();
    emit('open', {});
  }
  function closePanel() {
    panel.classList.add('hidden');
    launcher.classList.remove('hidden');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
    emit('close', {});
  }
  function hideTeaser(remember) {
    teaser.classList.add('hidden');
    if (remember) write(session, TEASER_KEY, '1');
  }

  launcher.addEventListener('click', openPanel);
  teaserOpen.addEventListener('click', openPanel);
  teaserClose.addEventListener('click', function () { hideTeaser(true); });
  closeBtn.addEventListener('click', closePanel);
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });

  /* ---------- arranque ---------- */
  function restore() {
    var saved = null;
    try { saved = JSON.parse(read(session, HISTORY_KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && saved.length) {
      saved.forEach(function (m) {
        if (m && (m.role === 'user' || m.role === 'bot') && typeof m.text === 'string') {
          addMessage(m.role, m.text, false);
          history.push({ role: m.role, text: m.text });
          if (m.role === 'user') userCount += 1;
        }
      });
    } else {
      addMessage('bot', WELCOME);
    }
    if (userCount === 0) showChips();
  }

  function mount() {
    document.body.appendChild(host);
    restore();
    if (cfg.autoOpen) {
      openPanel();
    } else if (cfg.teaser && !read(session, TEASER_KEY)) {
      setTimeout(function () {
        if (panel.classList.contains('hidden')) teaser.classList.remove('hidden');
      }, 6000);
    }
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  window.PuntoDeFugaChat = {
    open: openPanel,
    close: closePanel,
    send: send
  };
})();
