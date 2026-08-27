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
  let prepared = null;
  const path = () => _w.location.pathname;
  const needsInjection = text => typeof text === 'string' && text.length > 0 && !text.includes('OOC:') && !text.includes('<ooc_lore_context>');

  function createJob(text, transport) {
    const controller = new AbortController();
    const job = { input: text, output: text, path: path(), startedAt: Date.now(), controller, effects: [], committed: false };
    job.promise = Promise.resolve().then(async () => {
      if (!_injectFn || controller.signal.aborted) return;
      const output = await _injectFn(text, {
        transport, signal: controller.signal,
        onCommit: effect => { if (!controller.signal.aborted) job.effects.push(effect); }
      });
      if (typeof output !== 'string' || !output.length) throw new Error('Invalid lore injection result');
      job.output = output;
    });
    return job;
  }

  function commit(job) {
    if (!job || job.committed || job.controller.signal.aborted) return;
    job.committed = true;
    for (const effect of job.effects.splice(0)) {
      try { Promise.resolve(effect()).catch(e => console.warn('[Lore] send bookkeeping:', e)); }
      catch (e) { console.warn('[Lore] send bookkeeping:', e); }
    }
  }

  function takePrepared(text) {
    const job = prepared;
    if (!job || job.input !== text) return null;
    prepared = null;
    if (job.path !== path() || job.controller.signal.aborted || Date.now() > job.expiresAt) {
      job.controller.abort();
    }
    return job;
  }

  _w.__LoreInj.sendBridge = {
    canPrepare: () => !!_injectFn,
    needsInjection,
    prepare: text => createJob(text, 'composer'),
    arm(job) { job.expiresAt = Date.now() + 25000; prepared = job; },
    cancel(job) {
      if (!job || job.committed) return;
      job.controller.abort();
      job.effects.length = 0;
      if (prepared === job) prepared = null;
    }
  };

  function parseSendFrame(data) {
    if (typeof data === 'string' && data.length > 10) {
      const bi = data.indexOf('[');
      if (bi > 0) {
        try {
          const prefix = data.slice(0, bi), arr = JSON.parse(data.slice(bi));
          if (Array.isArray(arr) && arr[0] === 'send' && needsInjection(arr[1]?.message)) return { prefix, arr };
        } catch (_) {}
      }
    }
    return null;
  }

  // WebSocket 인터셉터
  _w.WebSocket.prototype.send = function(data){
    const packet = _injectFn && parseSendFrame(data);
    if (!packet) return _origWsSend.call(this, data);
    const { prefix, arr } = packet;
    const ws = this;
    const ready = takePrepared(arr[1].message);
    if (ready) {
      if (ready.controller.signal.aborted || ws.readyState !== 1) return;
      arr[1].message = ready.output;
      // Let native failures reach Socket.IO; never replay them with the original text.
      const result = _origWsSend.call(ws, prefix + JSON.stringify(arr));
      commit(ready);
      return result;
    }
    const job = createJob(arr[1].message, 'websocket');
    // Unknown/programmatic send paths still must not outlive Crack's 30s ACK window.
    const expiry = setTimeout(() => job.controller.abort(), 25000);
    (async () => {
      try { await job.promise; }
      catch(e) { console.error('[Lore] WS err:', e); return; }
      finally { clearTimeout(expiry); }
      if (job.controller.signal.aborted || path() !== job.path || Date.now() - job.startedAt >= 25000 || ws.readyState !== 1) return;
      arr[1].message = job.output;
      try { _origWsSend.call(ws, prefix + JSON.stringify(arr)); commit(job); }
      catch (e) { console.error('[Lore] send failed:', e); }
    })();
  };

  // Fetch 인터셉터
  _w.fetch = async function(...args) {
    try {
      if (_injectFn) {
        let reqUrl = '', isReq = false;
        if (args[0] instanceof Request) { reqUrl = args[0].url; isReq = true; } else reqUrl = args[0];
        const method = isReq ? args[0].method : ((args[1] || {}).method || 'GET');
        let platformRequest = false;
        try { const host = new URL(reqUrl, _w.location.href).hostname; platformRequest = host === 'wrtn.ai' || host.endsWith('.wrtn.ai'); } catch (_) {}
        if (method.toUpperCase() === 'POST' && platformRequest) {
          let bodyText = null;
          if (isReq) { try { bodyText = await args[0].clone().text(); } catch (e) {} }
          else if (args[1]?.body && typeof args[1].body === 'string') bodyText = args[1].body;
          if (bodyText) {
            let body = null; try { body = JSON.parse(bodyText); } catch (e) {}
            if (body) {
              let target = null;
              if (Array.isArray(body.messages)) {
                for (let i = body.messages.length - 1; i >= 0; i--) {
                  if (body.messages[i].role === 'user' && typeof body.messages[i].content === 'string') {
                    target = [body.messages[i], 'content'];
                    break;
                  }
                }
              }
              if (!target) {
                for (const key of ['content', 'message', 'text', 'prompt', 'query']) {
                  if (body[key] !== undefined && typeof body[key] === 'string') {
                    target = [body, key];
                    break;
                  }
                }
              }
              if (!target && body.variables && typeof body.variables === 'object') {
                for (const key of ['content', 'message', 'text', 'prompt', 'query']) {
                  if (body.variables[key] !== undefined && typeof body.variables[key] === 'string') {
                    target = [body.variables, key];
                    break;
                  }
                }
              }
              if (target && needsInjection(target[0][target[1]])) {
                const original = target[0][target[1]];
                const job = takePrepared(original) || createJob(original, 'fetch');
                await job.promise;
                const signal = isReq ? args[0].signal : args[1]?.signal;
                if (job.controller.signal.aborted || signal?.aborted || job.path !== path()) throw new DOMException('Send cancelled', 'AbortError');
                target[0][target[1]] = job.output;
                const newBodyText = JSON.stringify(body);
                if (isReq) args[0] = new Request(args[0], { body: newBodyText });
                else args[1] = { ...args[1], body: newBodyText };
                const response = await _origFetch.apply(this, args);
                if (response.ok) commit(job);
                return response;
              }
            }
          }
        }
      }
    } catch (e) {
      // A rejected request may already have reached the server. Do not replay it.
      throw e;
    }
    return _origFetch.apply(this, args);
  };

  _w.__loreRegister = function(fn) { _injectFn = fn; };
  _w.__LoreInj.__interceptorLoaded = true;
  console.log('[LoreInj:1] interceptor loaded');
})();
