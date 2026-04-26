// == 인젝터 모듈 1/6 — 인터셉터 ==
// WebSocket/Fetch 후킹 + _w.__loreRegister 등록
// @run-at document-start 로드 필수
(function(){
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  _w.__LoreInj = _w.__LoreInj || {};
  if (_w.__LoreInj.__interceptorLoaded) return;

  const _origFetch = _w.fetch.bind(_w);
  const _origWsSend = _w.WebSocket.prototype.send;
  let _injectFn = null;

  function getFetchUrl(input) {
    if (!input) return '';
    if (input instanceof Request) return input.url || '';
    if (input instanceof URL) return input.href;
    return String(input || '');
  }

  function getFetchMethod(input, init) {
    const method = input instanceof Request ? input.method : ((init || {}).method || 'GET');
    return String(method || 'GET').toUpperCase();
  }

  function shouldSkipInjectionText(text) {
    return !text || typeof text !== 'string' || text.includes('OOC:');
  }

  function isLikelyChatSendUrl(reqUrl) {
    if (!reqUrl) return false;
    try {
      const u = new URL(reqUrl, location.href);
      if (!/(^|\.)wrtn\.ai$/.test(u.hostname)) return false;
      const path = (u.pathname || '').toLowerCase();
      if (path.includes('/summaries') || path.includes('/memory') || path.includes('/memories')) return false;
      return path.includes('/messages') ||
             path.includes('/message') ||
             path.includes('/chat') ||
             path.includes('/chats') ||
             path.includes('/chat-room') ||
             path.includes('/chatrooms');
    } catch(e) {
      const s = String(reqUrl).toLowerCase();
      return s.includes('/messages') || s.includes('/message') || s.includes('/chat') || s.includes('/chats');
    }
  }

  // WebSocket 인터셉터
  _w.WebSocket.prototype.send = function(data){
    const ws = this;
    if (_injectFn && typeof data === 'string' && data.length > 10) {
      const bi = data.indexOf('[');
      if (bi > 0) {
        try {
          const prefix = data.slice(0, bi), arr = JSON.parse(data.slice(bi));
          if (Array.isArray(arr) && arr[0] === 'send' && arr[1] && typeof arr[1].message === 'string' && arr[1].message.length > 0) {
            if (!shouldSkipInjectionText(arr[1].message)) {
              const orig = arr[1].message;
              (async () => {
                try {
                  const mod = await _injectFn(orig);
                  if (orig !== mod) {
                    arr[1].message = mod;
                    _origWsSend.call(ws, prefix + JSON.stringify(arr));
                  } else {
                    _origWsSend.call(ws, data);
                  }
                } catch(e) {
                  console.error('[Lore] WS err:', e);
                  _origWsSend.call(ws, data);
                }
              })();
              return;
            }
          }
        } catch(e) {}
      }
    }
    return _origWsSend.call(this, data);
  };

  // Fetch 인터셉터
  _w.fetch = async function(...args) {
    try {
      if (_injectFn) {
        const isReq = args[0] instanceof Request;
        const reqUrl = getFetchUrl(args[0]);
        const method = getFetchMethod(args[0], args[1]);
        if (method === 'POST' && isLikelyChatSendUrl(reqUrl)) {
          let bodyText = null;
          if (isReq) { try { bodyText = await args[0].clone().text(); } catch (e) {} }
          else if (args[1]?.body && typeof args[1].body === 'string') bodyText = args[1].body;
          if (bodyText) {
            let body = null; try { body = JSON.parse(bodyText); } catch (e) {}
            if (body) {
              let injected = false;
              if (Array.isArray(body.messages)) {
                for (let i = body.messages.length - 1; i >= 0; i--) {
                  if (body.messages[i].role === 'user' && typeof body.messages[i].content === 'string') {
                    if (!shouldSkipInjectionText(body.messages[i].content)) {
                      const original = body.messages[i].content;
                      body.messages[i].content = await _injectFn(original);
                      if (original !== body.messages[i].content) injected = true;
                    }
                    break;
                  }
                }
              }
              if (!injected) {
                for (const key of ['content', 'message', 'text', 'prompt', 'query']) {
                  if (body[key] !== undefined && typeof body[key] === 'string') {
                    if (!shouldSkipInjectionText(body[key])) {
                      const original = body[key];
                      body[key] = await _injectFn(original);
                      if (original !== body[key]) injected = true;
                    }
                    break;
                  }
                }
              }
              if (!injected && body.variables && typeof body.variables === 'object') {
                for (const key of ['content', 'message', 'text', 'prompt', 'query']) {
                  if (body.variables[key] !== undefined && typeof body.variables[key] === 'string') {
                    if (!shouldSkipInjectionText(body.variables[key])) {
                      const original = body.variables[key];
                      body.variables[key] = await _injectFn(original);
                      if (original !== body.variables[key]) injected = true;
                    }
                    break;
                  }
                }
              }
              if (injected) {
                const newBodyText = JSON.stringify(body);
                if (isReq) args[0] = new Request(args[0], { body: newBodyText });
                else { args[1] = args[1] || {}; args[1].body = newBodyText; }
              }
            }
          }
        }
      }
    } catch (e) {}
    return _origFetch.apply(this, args);
  };

  _w.__loreRegister = function(fn) { _injectFn = fn; };
  _w.__LoreInj.__interceptorLoaded = true;
  console.log('[LoreInj:1] interceptor loaded');
})();