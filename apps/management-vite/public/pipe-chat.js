/*
 * Pipe Chat embed. Paste on a site:
 *   <script src="https://<management origin>/pipe-chat.js" data-key="<widgetKey>" async></script>
 *
 * Plain ES2019, no dependencies. The UI lives in a Shadow DOM so host-page CSS cannot reach it and
 * its own classes (pc-*) cannot leak out. Message data is only ever written with textContent.
 */
(function () {
  'use strict';

  if (window.__pipeChatLoaded) return;
  var script = document.currentScript;
  var key = script && script.getAttribute('data-key');
  if (!script || !key) {
    console.warn('[pipe-chat] data-key is missing; the chat widget was not started.');
    return;
  }
  window.__pipeChatLoaded = true;

  var API = new URL(script.src).origin + '/v1/widget/' + encodeURIComponent(key);
  var STORAGE_KEY = 'pipe-chat:' + key;
  var POLL_OPEN_MS = 3000;
  var POLL_CLOSED_MS = 15000;
  var MAX_ERRORS = 3;

  var state = {
    open: false,
    status: 'connecting', // connecting | ready | offline
    visitorId: null,
    token: null,
    greeting: '',
    channelName: 'Chat',
    since: null,
    seen: {},
    messages: [],
    errors: 0,
    timer: null,
    sending: false,
  };

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeStored() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ visitorId: state.visitorId, token: state.token }));
    } catch (e) {
      /* storage blocked: the visitor simply starts a new thread next visit */
    }
  }

  function request(method, path, body) {
    var init = { method: method, credentials: 'omit', headers: {} };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(API + path, init).then(function (res) {
      if (!res.ok) {
        var err = new Error('http ' + res.status);
        err.status = res.status;
        throw err;
      }
      return res.status === 202 || res.status === 204 ? null : res.json();
    });
  }

  /* ------------------------------------------------------------------ DOM */

  var host = document.createElement('div');
  host.setAttribute('data-pipe-chat', '');
  var root = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent = [
    ':host{all:initial}',
    '.pc-root{--pc-moss:#4a5d23;--pc-surface:#ffffff;--pc-surface-2:#e9e7df;--pc-terracotta-soft:#f8e4df;--pc-ink:#16150f;--pc-ink-2:#55544d;',
    'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;font-weight:400;line-height:20px;color:var(--pc-ink)}',
    '.pc-root *{box-sizing:border-box}',
    '.pc-launcher{position:fixed;right:16px;bottom:16px;width:56px;height:56px;border-radius:50%;border:0;background:var(--pc-moss);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);z-index:2147483646}',
    '.pc-launcher:focus-visible,.pc-close:focus-visible,.pc-send:focus-visible,.pc-retry:focus-visible{outline:2px solid var(--pc-moss);outline-offset:2px}',
    '.pc-launcher svg{width:24px;height:24px;fill:#fff}',
    '.pc-panel{position:fixed;right:16px;bottom:88px;width:360px;height:520px;max-height:calc(100vh - 104px);display:none;flex-direction:column;background:var(--pc-surface);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.25);z-index:2147483647}',
    '.pc-panel.pc-open{display:flex}',
    '.pc-full .pc-panel{right:0;bottom:0;width:100vw;height:100vh;max-height:none;border-radius:0}',
    '.pc-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--pc-moss);color:#fff;font-size:16px;font-weight:600;line-height:24px}',
    '.pc-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pc-close{width:44px;height:44px;margin:-10px -12px -10px 0;border:0;background:transparent;color:#fff;cursor:pointer;font-size:24px;line-height:24px}',
    '.pc-banner{padding:8px 16px;background:var(--pc-terracotta-soft);color:var(--pc-ink);font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '.pc-retry{min-height:44px;padding:0 12px;border:0;background:transparent;color:var(--pc-ink);font-size:12px;font-weight:600;text-decoration:underline;cursor:pointer}',
    '.pc-list{flex:1;overflow-y:auto;padding:16px;background:var(--pc-surface-2);display:flex;flex-direction:column;gap:8px}',
    '.pc-state{margin:auto;color:var(--pc-ink-2);text-align:center;display:flex;flex-direction:column;align-items:center;gap:8px}',
    '.pc-spinner{width:24px;height:24px;border:2px solid var(--pc-ink-2);border-top-color:transparent;border-radius:50%;animation:pc-spin 1s linear infinite}',
    '@keyframes pc-spin{to{transform:rotate(360deg)}}',
    '.pc-bubble{max-width:80%;padding:8px 12px;border-radius:12px;word-break:break-word;white-space:pre-wrap}',
    '.pc-in{align-self:flex-start;background:var(--pc-surface);color:var(--pc-ink)}',
    '.pc-out{align-self:flex-end;background:var(--pc-moss);color:#fff}',
    '.pc-time{display:block;margin-top:4px;font-size:12px;opacity:.7}',
    '.pc-composer{display:flex;gap:8px;padding:12px;background:var(--pc-surface);border-top:1px solid var(--pc-surface-2)}',
    '.pc-input{flex:1;min-width:0;min-height:44px;padding:0 12px;border:1px solid var(--pc-ink-2);border-radius:8px;font:inherit;font-size:14px;color:var(--pc-ink);background:var(--pc-surface)}',
    '.pc-input:focus-visible{outline:2px solid var(--pc-moss);outline-offset:0}',
    '.pc-send{min-height:44px;padding:0 16px;border:0;border-radius:8px;background:var(--pc-moss);color:#fff;font:inherit;font-weight:600;cursor:pointer}',
    '.pc-send:disabled{opacity:.5;cursor:not-allowed}',
  ].join('\n');

  var wrap = document.createElement('div');
  wrap.className = 'pc-root';

  var launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'pc-launcher';
  launcher.setAttribute('aria-label', 'Abrir chat');
  launcher.setAttribute('aria-expanded', 'false');
  (function buildIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z');
    svg.appendChild(path);
    launcher.appendChild(svg);
  })();

  var panel = document.createElement('div');
  panel.className = 'pc-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat');

  var head = document.createElement('div');
  head.className = 'pc-head';
  var title = document.createElement('span');
  title.className = 'pc-title';
  title.textContent = state.channelName;
  var closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'pc-close';
  closeButton.setAttribute('aria-label', 'Fechar chat');
  closeButton.textContent = '×';
  head.appendChild(title);
  head.appendChild(closeButton);

  var banner = document.createElement('div');
  banner.className = 'pc-banner';
  banner.setAttribute('role', 'alert');
  banner.hidden = true;
  var bannerText = document.createElement('span');
  bannerText.textContent = 'Sem conexão com o chat.';
  var retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.className = 'pc-retry';
  retryButton.textContent = 'Tentar novamente';
  banner.appendChild(bannerText);
  banner.appendChild(retryButton);

  var list = document.createElement('div');
  list.className = 'pc-list';
  list.setAttribute('aria-live', 'polite');

  var composer = document.createElement('form');
  composer.className = 'pc-composer';
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'pc-input';
  input.maxLength = 1000;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Mensagem');
  input.placeholder = 'Digite sua mensagem';
  var sendButton = document.createElement('button');
  sendButton.type = 'submit';
  sendButton.className = 'pc-send';
  sendButton.textContent = 'Enviar';
  sendButton.disabled = true;
  composer.appendChild(input);
  composer.appendChild(sendButton);

  panel.appendChild(head);
  panel.appendChild(banner);
  panel.appendChild(list);
  panel.appendChild(composer);
  wrap.appendChild(launcher);
  wrap.appendChild(panel);
  root.appendChild(style);
  root.appendChild(wrap);

  /* --------------------------------------------------------------- render */

  function timeLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function stateBlock(text, spinner) {
    var box = document.createElement('div');
    box.className = 'pc-state';
    if (spinner) {
      var s = document.createElement('div');
      s.className = 'pc-spinner';
      s.setAttribute('aria-hidden', 'true');
      box.appendChild(s);
    }
    var p = document.createElement('span');
    p.textContent = text;
    box.appendChild(p);
    return box;
  }

  function render() {
    title.textContent = state.channelName;
    banner.hidden = state.status !== 'offline';
    wrap.className = 'pc-root' + (window.innerWidth < 480 ? ' pc-full' : '');
    panel.className = 'pc-panel' + (state.open ? ' pc-open' : '');
    launcher.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    launcher.hidden = state.open && window.innerWidth < 480;

    while (list.firstChild) list.removeChild(list.firstChild);
    if (state.status === 'connecting') {
      list.appendChild(stateBlock('Conectando...', true));
    } else if (!state.messages.length) {
      if (state.greeting) list.appendChild(stateBlock(state.greeting, false));
    } else {
      state.messages.forEach(function (message) {
        var bubble = document.createElement('div');
        bubble.className = 'pc-bubble ' + (message.direction === 'in' ? 'pc-out' : 'pc-in');
        var text = document.createElement('span');
        text.textContent = message.text;
        var time = document.createElement('span');
        time.className = 'pc-time';
        time.textContent = timeLabel(message.createdAt);
        bubble.appendChild(text);
        bubble.appendChild(time);
        list.appendChild(bubble);
      });
      list.scrollTop = list.scrollHeight;
    }
    var canSend = state.status === 'ready' && input.value.trim().length > 0 && !state.sending;
    sendButton.disabled = !canSend;
  }

  /* ------------------------------------------------------------- behavior */

  function schedule() {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = null;
    if (state.status !== 'ready') return;
    state.timer = window.setTimeout(poll, state.open ? POLL_OPEN_MS : POLL_CLOSED_MS);
  }

  function absorb(rows) {
    var added = false;
    rows.forEach(function (row) {
      if (state.seen[row.id]) return;
      state.seen[row.id] = true;
      state.messages.push(row);
      if (!state.since || row.createdAt > state.since) state.since = row.createdAt;
      added = true;
    });
    return added;
  }

  function poll() {
    var query = '?visitorId=' + encodeURIComponent(state.visitorId) + '&token=' + encodeURIComponent(state.token);
    if (state.since) query += '&since=' + encodeURIComponent(state.since);
    return request('GET', '/messages' + query).then(
      function (rows) {
        state.errors = 0;
        absorb(Array.isArray(rows) ? rows : []);
        render();
        schedule();
      },
      function () {
        state.errors += 1;
        if (state.errors >= MAX_ERRORS) {
          state.status = 'offline';
          render();
        } else {
          schedule();
        }
      },
    );
  }

  function connect() {
    state.status = 'connecting';
    state.errors = 0;
    render();
    var stored = readStored();
    var body = stored && stored.visitorId && stored.token ? { visitorId: stored.visitorId, token: stored.token } : {};
    request('POST', '/session', body)
      .catch(function (err) {
        if (body.token && err.status === 404) return request('POST', '/session', {});
        throw err;
      })
      .then(
        function (session) {
          state.visitorId = session.visitorId;
          state.token = session.token;
          state.greeting = session.greeting || '';
          state.channelName = session.channelName || 'Chat';
          writeStored();
          state.status = 'ready';
          return poll();
        },
        function () {
          state.status = 'offline';
          render();
        },
      );
  }

  function setOpen(next) {
    state.open = next;
    render();
    if (next) {
      input.focus();
      if (state.status === 'ready') poll();
    } else {
      launcher.focus();
      schedule();
    }
  }

  launcher.addEventListener('click', function () {
    setOpen(!state.open);
  });
  closeButton.addEventListener('click', function () {
    setOpen(false);
  });
  retryButton.addEventListener('click', connect);
  input.addEventListener('input', render);
  panel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });
  window.addEventListener('resize', render);

  composer.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || state.status !== 'ready' || state.sending) return;
    state.sending = true;
    render();
    request('POST', '/messages', { visitorId: state.visitorId, token: state.token, text: text }).then(
      function () {
        state.sending = false;
        input.value = '';
        render();
        poll();
        input.focus();
      },
      function () {
        state.sending = false;
        state.status = 'offline';
        render();
      },
    );
  });

  function mount() {
    document.body.appendChild(host);
    connect();
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
