// injecter / sub-backup — 전체 백업/동기화
// 역할: 전체 파일 백업, 서버 수동 동기화, 서버 백업 삭제
// 의존: injecter-6-sub-file (backupTools)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded && _w.__LoreInj.backupTools) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded && _w.__LoreInj.backupTools)) { console.error('[LoreInj:sub-backup] backupTools 미로드'); return; }
  if (_w.__LoreInj.__subBackupLoaded) return;

  const { C, db, settings } = _w.__LoreInj;
  const B = _w.__LoreInj.backupTools;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const DEFAULT_BACKUP_SERVER_URL = 'https://crack-lore-backup-sync.localai0301.workers.dev';
  let serverSession = null;
  let activePassword = '';

  const FIELD = 'width:100%;padding:7px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
  const BTN = 'padding:7px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid #444;background:#111;color:#ccc;font-weight:bold;';

  function getCfg() {
    return settings.config || {};
  }

  function saveCfg(patch) {
    Object.assign(settings.config, patch || {});
    settings.save();
  }

  function getServerUrl() {
    return DEFAULT_BACKUP_SERVER_URL;
  }

  function assertServerInput(userId, password, needPassword) {
    if (!String(userId || '').trim()) throw new Error('ID를 입력해야 함.');
    if (needPassword && !String(password || '')) throw new Error('비밀번호를 입력해야 함.');
  }

  function restoreStoredSession() {
    const cfg = getCfg();
    if (serverSession && serverSession.token) return;
    if (!cfg.backupServerId || !cfg.backupServerToken || !cfg.backupServerPassword) return;
    if (cfg.backupServerTokenExpiresAt && Number(cfg.backupServerTokenExpiresAt) < Date.now()) return;
    serverSession = {
      userId: cfg.backupServerId,
      token: cfg.backupServerToken,
      expiresAt: Number(cfg.backupServerTokenExpiresAt || 0)
    };
    activePassword = cfg.backupServerPassword || '';
  }

  function persistSession(userId, password, token, expiresAt) {
    saveCfg({
      backupServerId: userId,
      backupServerPassword: password,
      backupServerToken: token,
      backupServerTokenExpiresAt: expiresAt || 0
    });
  }

  function clearSession() {
    serverSession = null;
    activePassword = '';
    saveCfg({
      backupServerPassword: '',
      backupServerToken: '',
      backupServerTokenExpiresAt: 0
    });
  }

  function b64url(bytes) {
    let bin = '';
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromB64url(s) {
    let b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function transformBytes(bytes, StreamCtor) {
    if (typeof Blob === 'undefined' || typeof Response === 'undefined' || typeof StreamCtor !== 'function') throw new Error('compression unsupported');
    const stream = new Blob([bytes]).stream().pipeThrough(new StreamCtor('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gzipBytes(bytes) {
    return transformBytes(bytes, typeof CompressionStream !== 'undefined' ? CompressionStream : null);
  }

  async function gunzipBytes(bytes) {
    return transformBytes(bytes, typeof DecompressionStream !== 'undefined' ? DecompressionStream : null);
  }

  async function sha256Text(text) {
    return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  }

  async function makeAuthSecret(userId, password) {
    return sha256Text('crack-lore-sync-auth:v1:' + userId + ':' + password);
  }

  async function deriveBackupKey(userId, password) {
    const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({
      name: 'PBKDF2',
      salt: enc.encode('crack-lore-sync-backup:v1:' + userId),
      iterations: 150000,
      hash: 'SHA-256'
    }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function encryptJson(obj, userId, password, opts = {}) {
    const key = await deriveBackupKey(userId, password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    let format = 'v1';
    let plain = enc.encode(JSON.stringify(obj));
    if (opts.compress) {
      try {
        plain = await gzipBytes(plain);
        format = 'v2gzip';
      } catch (_) {
        format = 'v1';
      }
    }
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return format + '.' + b64url(iv) + '.' + b64url(data);
  }

  async function decryptJson(cipher, userId, password) {
    const parts = String(cipher || '').split('.');
    if (parts.length !== 3 || (parts[0] !== 'v1' && parts[0] !== 'v2gzip')) throw new Error('지원하지 않는 암호화 형식.');
    const key = await deriveBackupKey(userId, password);
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(parts[1]) }, key, fromB64url(parts[2]));
    let bytes = new Uint8Array(data);
    if (parts[0] === 'v2gzip') bytes = await gunzipBytes(bytes);
    return JSON.parse(dec.decode(bytes));
  }

  function localizeServerError(message, status) {
    const msg = String(message || '').trim();
    const lower = msg.toLowerCase();
    if (!msg) return status ? ('서버 요청 실패. HTTP ' + status) : '서버 요청 실패.';
    if (lower.includes('id must use 3-80 letters')) return 'ID는 3~80자의 영문, 숫자, 마침표, 밑줄, 하이픈만 사용할 수 있음.';
    if (lower === 'id already exists') return '이미 사용 중인 ID.';
    if (lower === 'login failed') return 'ID 또는 비밀번호가 맞지 않음.';
    if (lower === 'login required') return '로그인이 필요함. 다시 로그인할 것.';
    if (lower === 'invalid auth secret') return '로그인 정보 생성에 실패함. ID와 비밀번호를 다시 확인할 것.';
    if (lower === 'invalid encrypted payload') return '백업 암호화 데이터 형식이 올바르지 않음.';
    if (lower.includes('backup limit reached')) return '서버 백업은 최대 10개까지 보관됨. 기존 백업을 삭제한 뒤 다시 저장할 것.';
    if (lower === 'backup not found') return '선택한 서버 백업을 찾을 수 없음. 목록을 새로고침할 것.';
    if (lower === 'post required') return '서버 요청 방식이 올바르지 않음.';
    if (lower.includes('d1 binding db missing')) return '서버 DB 연결이 설정되지 않음.';
    if (lower.startsWith('http ')) return '서버 요청 실패. ' + msg;
    return msg;
  }

  function backupSummary(backup) {
    const db = backup && backup.db || {};
    const packs = Array.isArray(db.packs) ? db.packs : [];
    const entries = Array.isArray(db.entries) ? db.entries : [];
    const packNames = new Set(packs.map(p => p && p.name).filter(Boolean));
    entries.forEach(e => { if (e && e.packName) packNames.add(e.packName); });
    return {
      schema: backup.schema,
      version: backup.version,
      exportedAt: backup.exportedAt,
      appVersion: backup.appVersion || '',
      includeSecrets: !!backup.includeSecrets,
      serverSlim: !!backup.serverSlim,
      packs: Array.from(packNames).sort(),
      entryCount: entries.length,
      embeddingCount: Array.isArray(db.embeddings) ? db.embeddings.length : 0,
      embeddingExcluded: !!backup.embeddingExcluded,
      historyExcluded: !!backup.historyExcluded,
      logsExcluded: !!backup.logsExcluded,
      settingCount: backup.settings ? Object.keys(backup.settings).length : 0,
      localStorageCount: backup.localStorage ? Object.keys(backup.localStorage).length : 0
    };
  }

  async function serverFetch(path, body, token) {
    const url = getServerUrl();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { message: text }; }
    if (!res.ok || !data || data.ok === false) {
      throw new Error(localizeServerError((data && (data.error || data.message)) || ('HTTP ' + res.status), res.status));
    }
    return data;
  }

  async function apiCheckId(userId) {
    return serverFetch('/api/check-id', { id: userId });
  }

  async function apiRegister(userId, password) {
    const authSecret = await makeAuthSecret(userId, password);
    return serverFetch('/api/register', { id: userId, authSecret });
  }

  async function apiLogin(userId, password) {
    const authSecret = await makeAuthSecret(userId, password);
    const data = await serverFetch('/api/login', { id: userId, authSecret });
    serverSession = { userId, token: data.token, expiresAt: data.expiresAt || 0 };
    activePassword = password;
    persistSession(userId, password, data.token, data.expiresAt || 0);
    return data;
  }

  async function apiList() {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/list', {}, serverSession.token);
  }

  async function apiUpload(title, payload, encryptedMeta) {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/create', { title, payload, encryptedMeta }, serverSession.token);
  }

  async function apiReplace(backupId, payload, encryptedMeta) {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/replace', { backupId, payload, encryptedMeta }, serverSession.token);
  }

  async function apiDownload(backupId) {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/get', { backupId }, serverSession.token);
  }

  async function apiDelete(backupId) {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/delete', { backupId }, serverSession.token);
  }

  function isCompressedPayload(payload) {
    return String(payload || '').startsWith('v2gzip.');
  }

  async function backupNeedsCompression(item) {
    if (!item || !item.encryptedMeta) return true;
    try {
      const meta = await decryptJson(item.encryptedMeta, serverSession.userId, activePassword);
      return !(meta && (meta.payloadCompressed === true || meta.payloadFormat === 'v2gzip'));
    } catch (_) {
      return true;
    }
  }

  async function makeCompressedBackupMeta(item) {
    if (!item || !item.encryptedMeta) return item && item.encryptedMeta || '';
    try {
      const meta = await decryptJson(item.encryptedMeta, serverSession.userId, activePassword);
      if (!meta || typeof meta !== 'object') return item.encryptedMeta;
      meta.payloadCompressed = true;
      meta.payloadFormat = 'v2gzip';
      return await encryptJson(meta, serverSession.userId, activePassword);
    } catch (e) {
      console.warn('[LoreInj:backup] backup metadata refresh skipped:', e && e.message ? e.message : e);
      return item.encryptedMeta;
    }
  }

  // The server never sees a user's backup password, so old ciphertext must be recompressed in the browser.
  // /replace keeps backupId stable and D1 swaps chunks in one transaction.
  async function compressLegacyServerBackups(items, statusEl) {
    const candidates = [];
    for (const item of (items || [])) {
      if (await backupNeedsCompression(item)) candidates.push(item);
    }
    let migrated = 0;
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      setInlineStatus(statusEl, '기존 서버 백업 압축 중: ' + (i + 1) + '/' + candidates.length, '#8bc');
      const downloaded = await apiDownload(item.backupId);
      if (isCompressedPayload(downloaded.payload)) continue;
      if (!String(downloaded.payload || '').startsWith('v1.')) throw new Error('기존 백업의 암호화 형식을 확인할 수 없음.');
      const data = await decryptJson(downloaded.payload, serverSession.userId, activePassword);
      const payload = await encryptJson(data, serverSession.userId, activePassword, { compress: true });
      if (!isCompressedPayload(payload)) throw new Error('이 브라우저에서 백업 압축을 사용할 수 없음. 최신 브라우저에서 다시 시도할 것.');
      await apiReplace(item.backupId, payload, await makeCompressedBackupMeta(item));
      migrated++;
    }
    return { checked: candidates.length, migrated };
  }

  function makeInput(value, placeholder, type) {
    const input = document.createElement('input');
    input.type = type || 'text';
    input.value = value || '';
    input.placeholder = placeholder || '';
    input.style.cssText = FIELD;
    return input;
  }

  function makeBtn(label, color) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = BTN + (color || '');
    return btn;
  }

  function addText(nd, text, style) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = style || 'font-size:11px;color:#888;line-height:1.45;margin-top:6px;';
    nd.appendChild(div);
    return div;
  }

  function setInlineStatus(el, text, tone) {
    if (!el) return;
    el.textContent = text || '';
    el.style.color = tone || '#888';
  }

  function setButtonBusy(btn, label) {
    if (!btn) return () => {};
    const oldText = btn.textContent;
    const oldOpacity = btn.style.opacity;
    btn.disabled = true;
    btn.textContent = label || '처리 중';
    btn.style.opacity = '.65';
    return () => {
      btn.disabled = false;
      btn.textContent = oldText;
      btn.style.opacity = oldOpacity || '';
    };
  }

  function setButtonsDisabled(buttons, disabled) {
    (buttons || []).forEach(btn => {
      if (!btn) return;
      btn.disabled = !!disabled;
      btn.style.opacity = disabled ? '.65' : '';
    });
  }

  async function clearLocalInstallData() {
    try {
      if (db && db.tables) {
        for (const table of db.tables) {
          try { await table.clear(); } catch (_) {}
        }
      }
      if (db && typeof db.close === 'function') {
        try { db.close(); } catch (_) {}
      }
      if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase('lore-injector');
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
      }
    } catch (_) {}
    const shouldRemove = (key) => {
      const k = String(key || '');
      return k === 'lore-injector-v5'
        || k === 'lore-hybrid-stats'
        || k.startsWith('lore-')
        || k.startsWith('speech-refiner-');
    };
    try {
      const keys = [];
      for (let i = 0; i < _w.localStorage.length; i++) keys.push(_w.localStorage.key(i));
      keys.filter(shouldRemove).forEach(k => { try { _w.localStorage.removeItem(k); } catch (_) {} });
    } catch (_) {}
    try {
      const skeys = [];
      for (let i = 0; i < _w.sessionStorage.length; i++) skeys.push(_w.sessionStorage.key(i));
      skeys.filter(shouldRemove).forEach(k => { try { _w.sessionStorage.removeItem(k); } catch (_) {} });
    } catch (_) {}
  }

  function formatTime(ts) {
    if (!ts) return '-';
    try { return new Date(ts).toLocaleString(); } catch (_) { return String(ts); }
  }

  async function importBackupWithMode(data, mode, includeSecrets) {
    let conflictPlan = null;
    if (mode === 'merge') {
      const analysis = await B.analyzeBackupConflicts(data);
      conflictPlan = await B.showBackupImportDialog(analysis);
      if (!conflictPlan) return null;
    }
    return B.importFullBackup(data, mode, { includeSecrets, importSettings: mode === 'replace', conflictPlan });
  }

  function formatEmbedRestoreSuffix(result) {
    if (!result) return '';
    if (result.skipped) return result.reason ? (' / 검색 준비 생략: ' + result.reason.replace('임베딩용', '의미 검색용')) : '';
    if (result.failed) return ' / 검색 준비 실패: ' + result.error;
    return ' / 검색 준비 ' + (result.count || 0) + '개 완료';
  }

  async function embedRestoredPacks(report, statusEl) {
    const packs = Array.from(new Set(((report && report.touchedPacks) || []).filter(Boolean)));
    if (!packs.length) return { skipped: true, reason: '복원된 로어팩 없음' };
    const missing = typeof _w.__LoreInj.getApiMissingReason === 'function'
      ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed')
      : '';
    if (missing) return { skipped: true, reason: missing };
    if (!C || typeof C.embedPack !== 'function') return { skipped: true, reason: '검색 준비 기능을 찾을 수 없음' };
    const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts
      ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'serverRestoreEmbed', chatKey: 'global' })
      : {
        apiType: settings.config.autoExtApiType === 'deepseek' ? 'key' : (settings.config.autoExtApiType || 'key'),
        key: settings.config.autoExtApiType === 'deepseek' ? settings.config.autoExtFirebaseEmbedKey : settings.config.autoExtKey,
        vertexJson: settings.config.autoExtVertexJson,
        vertexLocation: settings.config.autoExtVertexLocation || 'global',
        vertexProjectId: settings.config.autoExtVertexProjectId,
        firebaseScript: settings.config.autoExtFirebaseScript,
        firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
        model: settings.config.embeddingModel || 'gemini-embedding-001',
        costContext: { feature: 'serverRestoreEmbed', chatKey: 'global' }
      };
    let count = 0;
    try {
      for (let i = 0; i < packs.length; i++) {
        const packName = packs[i];
        setInlineStatus(statusEl, '검색 준비 중: ' + packName + ' (' + (i + 1) + '/' + packs.length + ')', '#8bc');
        count += await C.embedPack(packName, apiOpts, (done, total) => {
          setInlineStatus(statusEl, '검색 준비 중: ' + packName + ' ' + done + '/' + total, '#8bc');
        });
      }
      return { packs: packs.length, count };
    } catch (e) {
      return { failed: true, error: e.message || String(e), packs: packs.length, count };
    }
  }

  function renderBackupUI(panel) {
    restoreStoredSession();
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div'); title.textContent = '파일 백업'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
      addText(nd, '설정, 로어팩, 로어, 검색 준비, 채팅별 활성 상태를 파일로 저장하거나 가져옴.');
      const optRow = document.createElement('div'); optRow.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;';
      const mkCheck = (label, checked) => {
        const wrap = document.createElement('label'); wrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:12px;color:#aaa;cursor:pointer;';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!checked;
        wrap.appendChild(cb); wrap.appendChild(document.createTextNode(label));
        optRow.appendChild(wrap);
        return cb;
      };
      const includeSecretsCb = mkCheck('API 키 포함', false);
      const includeLogsCb = mkCheck('비용/로그 포함', true);
      nd.appendChild(optRow);

      const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
      const exportBtn = makeBtn('파일로 저장', 'border-color:#285;color:#6c9;');
      const importMergeBtn = makeBtn('파일에서 병합', 'border-color:#258;color:#8bc;');
      const importReplaceBtn = makeBtn('파일로 교체 복원', 'border-color:#833;color:#e88;');
      const importFile = document.createElement('input'); importFile.type = 'file'; importFile.accept = '.json,application/json'; importFile.style.display = 'none';
      let importMode = 'merge';

      exportBtn.onclick = async () => {
        exportBtn.disabled = true; const orig = exportBtn.textContent; exportBtn.textContent = '준비 중...';
        try {
          const data = await B.exportFullBackup({ includeSecrets: includeSecretsCb.checked, includeLogs: includeLogsCb.checked });
          const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          B.downloadJson('crack-lore-backup-' + stamp + '.json', data);
        } catch (e) { alert('파일 저장 실패: ' + e.message); }
        exportBtn.textContent = orig; exportBtn.disabled = false;
      };
      importMergeBtn.onclick = () => { importMode = 'merge'; importFile.click(); };
      importReplaceBtn.onclick = () => {
        if (!confirm('현재 로컬 데이터를 백업 파일 기준으로 교체함. 작업 전 내부 백업은 남김.')) return;
        importMode = 'replace'; importFile.click();
      };
      importFile.onchange = async (ev) => {
        const file = ev.target.files && ev.target.files[0]; if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          const report = await importBackupWithMode(data, importMode, includeSecretsCb.checked);
          if (report) alert('파일 가져오기 완료: 로어 ' + report.entries + '개 / 검색 준비 ' + report.embeddings + '개');
        } catch (e) { alert('파일 가져오기 실패: ' + e.message); }
        importFile.value = '';
      };
      row.appendChild(exportBtn); row.appendChild(importMergeBtn); row.appendChild(importReplaceBtn); row.appendChild(importFile); nd.appendChild(row);
      addText(nd, '파일에서 병합: 현재 데이터 유지, 겹치는 로어팩/설정은 가져오기 전에 처리 방식을 고름.', 'font-size:10px;color:#8a9;line-height:1.45;margin-top:8px;');
      addText(nd, '파일로 교체 복원: 현재 로컬 DB를 백업 파일 기준으로 바꿈. 실행 전 내부 백업 남김.', 'font-size:10px;color:#b88;line-height:1.45;margin-top:3px;');
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div'); title.textContent = '서버 동기화'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
      addText(nd, '계정으로 로그인하면 PC/모바일에서 같은 서버 백업을 볼 수 있음. 서버에는 로어/팩/채팅별 활성 상태 중심으로 저장하고, 검색 준비/이력/로그는 복원 후 필요한 만큼 다시 생성함.');
      const cfg = getCfg();
      const accountBox = document.createElement('div'); accountBox.style.cssText = 'border:1px solid #292929;border-radius:6px;background:#111;padding:10px;margin-top:10px;';
      const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
      if (typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches) grid.style.gridTemplateColumns = '1fr';
      const idInput = makeInput(cfg.backupServerId || '', 'ID');
      const pwInput = makeInput(cfg.backupServerPassword || '', '비밀번호', 'password');
      grid.appendChild(idInput); grid.appendChild(pwInput); accountBox.appendChild(grid);
      const status = document.createElement('div');
      status.style.cssText = 'font-size:12px;color:#888;line-height:1.45;margin-top:8px;';
      accountBox.appendChild(status);
      const accountBtns = document.createElement('div'); accountBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
      const checkBtn = makeBtn('ID 확인', 'border-color:#555;color:#bbb;');
      const regBtn = makeBtn('계정 만들기', 'border-color:#285;color:#6c9;');
      const loginBtn = makeBtn('로그인', 'border-color:#258;color:#8bc;');
      const logoutBtn = makeBtn('로그아웃', 'border-color:#833;color:#e88;');
      accountBtns.appendChild(checkBtn); accountBtns.appendChild(regBtn); accountBtns.appendChild(loginBtn); accountBtns.appendChild(logoutBtn); accountBox.appendChild(accountBtns);
      nd.appendChild(accountBox);
      const listBox = document.createElement('div'); listBox.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px;'; nd.appendChild(listBox);
      const workStatus = addText(nd, '', 'font-size:12px;color:#888;line-height:1.45;margin-top:8px;min-height:18px;');
      let selected = null;
      let lastItems = [];
      let serverBusy = false;
      const serverButtons = [];

      const beginServerWork = (btn, busyLabel, statusText) => {
        if (serverBusy) {
          setInlineStatus(workStatus, '다른 서버 작업 처리 중. 잠시 뒤 다시 시도할 것.', '#d8a');
          return null;
        }
        serverBusy = true;
        setInlineStatus(workStatus, statusText || '서버 작업 처리 중...', '#8bc');
        setButtonsDisabled(serverButtons, true);
        const restoreBtn = setButtonBusy(btn, busyLabel);
        return (finalText, finalTone) => {
          restoreBtn();
          setButtonsDisabled(serverButtons, false);
          serverBusy = false;
          if (finalText) setInlineStatus(workStatus, finalText, finalTone || '#8a9');
        };
      };

      const setStatus = () => {
        restoreStoredSession();
        status.textContent = serverSession ? ('로그인됨: ' + serverSession.userId) : '로그인 안 됨.';
        logoutBtn.style.display = serverSession ? '' : 'none';
        loginBtn.style.display = serverSession ? 'none' : '';
      };

      const renderList = async () => {
        restoreStoredSession();
        setStatus();
        listBox.textContent = '';
        if (!serverSession || !activePassword) {
          setInlineStatus(workStatus, '로그인 필요.', '#888');
          addText(listBox, '로그인하면 현재 계정의 서버 백업 목록이 표시됨.', 'font-size:12px;color:#777;padding:10px;');
          return;
        }
        setInlineStatus(workStatus, '서버 백업 목록 불러오는 중...', '#8bc');
        try {
          const res = await apiList();
          lastItems = res.items || [];
          if (!lastItems.length) {
            addText(listBox, '서버 백업 없음.', 'font-size:12px;color:#777;padding:10px;');
            setInlineStatus(workStatus, '목록 갱신 완료. 서버 백업 없음.', '#8a9');
            return;
          }
          for (const item of lastItems) {
            let meta = null;
            try { meta = item.encryptedMeta ? await decryptJson(item.encryptedMeta, serverSession.userId, activePassword) : null; } catch (_) {}
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = 'width:100%;text-align:left;border:1px solid #333;background:#111;color:#ccc;border-radius:4px;padding:8px;cursor:pointer;';
            const label = meta ? ((meta.packs || []).slice(0, 4).join(', ') || '로어팩 없음') : (item.title || item.backupId);
            const embLabel = meta && meta.embeddingExcluded ? ' / 검색 준비는 복원 후 생성' : (meta ? ' / 검색 준비 ' + (meta.embeddingCount || 0) + '개' : '');
            const slimLabel = meta && meta.historyExcluded ? ' / 이력 제외' : '';
            const compressedLabel = meta && meta.payloadCompressed ? ' / 압축됨' : '';
            row.textContent = formatTime(item.createdAt) + ' / ' + label + ' / 로어 ' + (meta ? meta.entryCount : '?') + '개' + embLabel + slimLabel + compressedLabel + ' / ' + Math.ceil((item.payloadBytes || 0) / 1024) + 'KB';
            row.onclick = () => {
              selected = item;
              Array.from(listBox.children).forEach(x => x.style.borderColor = '#333');
              row.style.borderColor = '#58a';
            };
            listBox.appendChild(row);
          }
          setInlineStatus(workStatus, '목록 갱신 완료. 서버 백업 ' + lastItems.length + '개.', '#8a9');
        } catch (e) {
          addText(listBox, '목록 불러오기 실패: ' + e.message, 'font-size:12px;color:#d88;padding:10px;');
          setInlineStatus(workStatus, '목록 불러오기 실패: ' + e.message, '#d88');
        }
      };

      const persistId = () => saveCfg({ backupServerId: idInput.value.trim() });
      checkBtn.onclick = async () => {
        const done = beginServerWork(checkBtn, '확인 중...', 'ID 중복 확인 중...');
        if (!done) return;
        try {
          persistId();
          assertServerInput(idInput.value, '', false);
          const res = await apiCheckId(idInput.value.trim());
          const msg = res.available ? '사용 가능한 ID.' : '이미 사용 중인 ID.';
          done(msg, res.available ? '#8a9' : '#d8a');
          alert(msg);
        } catch (e) { done('ID 확인 실패: ' + e.message, '#d88'); alert('ID 확인 실패: ' + e.message); }
      };
      regBtn.onclick = async () => {
        const done = beginServerWork(regBtn, '생성 중...', '계정 생성 중...');
        if (!done) return;
        try {
          persistId();
          assertServerInput(idInput.value, pwInput.value, true);
          await apiRegister(idInput.value.trim(), pwInput.value);
          setInlineStatus(workStatus, '계정 생성 완료. 로그인 처리 중...', '#8bc');
          await apiLogin(idInput.value.trim(), pwInput.value);
          setStatus();
          await renderList();
          done('계정 생성 및 로그인 완료.', '#8a9');
          alert('계정 생성 완료.');
        } catch (e) { done('계정 생성 실패: ' + e.message, '#d88'); alert('계정 생성 실패: ' + e.message); }
      };
      loginBtn.onclick = async () => {
        const done = beginServerWork(loginBtn, '로그인 중...', '로그인 중...');
        if (!done) return;
        try {
          persistId();
          assertServerInput(idInput.value, pwInput.value, true);
          await apiLogin(idInput.value.trim(), pwInput.value);
          setStatus();
          await renderList();
          done('로그인 완료.', '#8a9');
          alert('로그인 완료.');
        } catch (e) { done('로그인 실패: ' + e.message, '#d88'); alert('로그인 실패: ' + e.message); }
      };
      logoutBtn.onclick = async () => {
        const done = beginServerWork(logoutBtn, '로그아웃 중...', '로그아웃 처리 중...');
        if (!done) return;
        clearSession();
        pwInput.value = '';
        selected = null;
        setStatus();
        await renderList();
        done('로그아웃 완료.', '#8a9');
      };

      const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
      const refreshBtn = makeBtn('목록 새로고침', 'border-color:#555;color:#bbb;');
      const uploadBtn = makeBtn('서버에 저장', 'border-color:#285;color:#6c9;');
      const mergeBtn = makeBtn('서버에서 병합', 'border-color:#258;color:#8bc;');
      const replaceBtn = makeBtn('서버 백업으로 교체', 'border-color:#833;color:#e88;');
      const deleteBtn = makeBtn('선택 백업 삭제', 'border-color:#833;color:#e88;');
      serverButtons.push(checkBtn, regBtn, loginBtn, logoutBtn, refreshBtn, uploadBtn, mergeBtn, replaceBtn, deleteBtn);
      refreshBtn.onclick = async () => {
        const done = beginServerWork(refreshBtn, '불러오는 중...', '서버 백업 목록 불러오는 중...');
        if (!done) return;
        await renderList();
        done(workStatus.textContent || '목록 갱신 완료.', workStatus.style.color || '#8a9');
      };
      uploadBtn.onclick = async () => {
        const done = beginServerWork(uploadBtn, '저장 중...', '서버 저장 준비 중...');
        if (!done) return;
        try {
          if (!serverSession || !activePassword) throw new Error('먼저 로그인해야 함.');
          setInlineStatus(workStatus, '기존 서버 백업 확인 중...', '#8bc');
          const list = await apiList();
          const migration = await compressLegacyServerBackups(list.items || [], workStatus);
          if ((list.items || []).length >= 10) throw new Error('서버 백업은 최대 10개까지 보관됨. 기존 백업을 삭제한 뒤 다시 저장할 것.');
          setInlineStatus(workStatus, '현재 백업 만드는 중...', '#8bc');
          const data = await B.exportFullBackup({ includeSecrets: false, includeLogs: false, includeEmbeddings: false, includeHistory: false, serverSlim: true });
          const meta = backupSummary(data);
          setInlineStatus(workStatus, '백업 압축/암호화 중...', '#8bc');
          const payload = await encryptJson(data, serverSession.userId, activePassword, { compress: true });
          meta.payloadCompressed = payload.startsWith('v2gzip.');
          meta.payloadFormat = meta.payloadCompressed ? 'v2gzip' : 'v1';
          const encryptedMeta = await encryptJson(meta, serverSession.userId, activePassword);
          setInlineStatus(workStatus, '서버에 업로드 중...', '#8bc');
          await apiUpload('backup-' + new Date().toISOString().slice(0, 19), payload, encryptedMeta);
          await renderList();
          const completeMessage = migration.migrated ? ('서버 저장 완료. 기존 백업 ' + migration.migrated + '개도 압축함.') : '서버 저장 완료.';
          done(completeMessage, '#8a9');
          alert(completeMessage);
        } catch (e) { done('서버 저장 실패: ' + e.message, '#d88'); alert('서버 저장 실패: ' + e.message); }
      };
      const pullSelected = async (mode) => {
        if (!selected) throw new Error('가져올 서버 백업을 선택해야 함.');
        setInlineStatus(workStatus, '서버 백업 내려받는 중...', '#8bc');
        const res = await apiDownload(selected.backupId);
        setInlineStatus(workStatus, '백업 복호화 중...', '#8bc');
        const data = await decryptJson(res.payload, serverSession.userId, activePassword);
        setInlineStatus(workStatus, mode === 'replace' ? '교체 복원 처리 중...' : '병합 처리 중...', '#8bc');
        const report = await importBackupWithMode(data, mode, false);
        if (!report) return null;
        const embedReport = await embedRestoredPacks(report, workStatus);
        return { report, embedReport };
      };
      mergeBtn.onclick = async () => {
        const done = beginServerWork(mergeBtn, '병합 중...', '서버 병합 준비 중...');
        if (!done) return;
        try {
          const result = await pullSelected('merge');
          if (result) {
            const report = result.report;
            const embedMsg = formatEmbedRestoreSuffix(result.embedReport);
            done('서버 병합 완료. 로어 ' + report.entries + '개' + embedMsg + '.', '#8a9');
            alert('서버 병합 완료: 로어 ' + report.entries + '개' + embedMsg);
          }
          else done('서버 병합 취소됨.', '#d8a');
        } catch (e) { done('서버 병합 실패: ' + e.message, '#d88'); alert('서버 병합 실패: ' + e.message); }
      };
      replaceBtn.onclick = async () => {
        if (!confirm('현재 로컬 데이터를 선택한 서버 백업 기준으로 교체함.')) return;
        const done = beginServerWork(replaceBtn, '교체 중...', '서버 교체 복원 준비 중...');
        if (!done) return;
        try {
          const result = await pullSelected('replace');
          if (result) {
            const report = result.report;
            const embedMsg = formatEmbedRestoreSuffix(result.embedReport);
            done('서버 교체 복원 완료. 로어 ' + report.entries + '개' + embedMsg + '.', '#8a9');
            alert('서버 교체 복원 완료: 로어 ' + report.entries + '개' + embedMsg);
          }
          else done('서버 교체 복원 취소됨.', '#d8a');
        } catch (e) { done('서버 교체 복원 실패: ' + e.message, '#d88'); alert('서버 교체 복원 실패: ' + e.message); }
      };
      deleteBtn.onclick = async () => {
        const done = beginServerWork(deleteBtn, '삭제 중...', '서버 백업 삭제 준비 중...');
        if (!done) return;
        try {
          if (!selected) throw new Error('삭제할 서버 백업을 선택해야 함.');
          if (!confirm('선택한 서버 백업을 삭제함. 로컬 데이터는 삭제되지 않음.')) { done('서버 백업 삭제 취소됨.', '#d8a'); return; }
          setInlineStatus(workStatus, '서버 백업 삭제 중...', '#8bc');
          await apiDelete(selected.backupId);
          selected = null;
          await renderList();
          done('서버 백업 삭제 완료.', '#8a9');
          alert('서버 백업 삭제 완료.');
        } catch (e) { done('서버 삭제 실패: ' + e.message, '#d88'); alert('서버 삭제 실패: ' + e.message); }
      };
      btns.appendChild(refreshBtn); btns.appendChild(uploadBtn); btns.appendChild(mergeBtn); btns.appendChild(replaceBtn); btns.appendChild(deleteBtn); nd.appendChild(btns);
      setTimeout(renderList, 0);
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div'); title.textContent = '저장 공간 정리'; title.style.cssText = 'font-size:14px;color:#da8;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
      addText(nd, '사용하지 않는 검색 준비와 삭제된 로어의 기록을 지움. 스냅샷은 각 로어팩의 최근 3개만 남기고, 남은 스냅샷과 변경 이력은 압축함. 현재 로어 본문과 최근 복원 지점은 유지함.');
      const btn = makeBtn('사용하지 않는 데이터 정리', 'border-color:#642;color:#da8;margin-top:10px;');
      btn.onclick = async () => {
        if (!confirm('삭제된 로어의 남은 기록과 각 로어팩의 오래된 스냅샷을 정리합니다. 현재 로어와 최근 스냅샷 3개는 유지합니다. 계속할까요?')) return;
        const done = setButtonBusy(btn, '정리 중...');
        try {
          if (typeof _w.__LoreInj.cleanupUnusedLoreStorage !== 'function') throw new Error('저장 공간 정리 기능을 찾을 수 없음.');
          const report = await _w.__LoreInj.cleanupUnusedLoreStorage({ trimSnapshots: true, maxSnapshotsPerPack: 3, compressHistory: true });
          const removed = (report.orphanEmbeddingsRemoved || 0) + (report.orphanEntryVersionsRemoved || 0) + (report.orphanSnapshotsRemoved || 0) + (report.snapshotsTrimmed || 0) + (report.emptyPacksRemoved || 0);
          const compressed = (report.snapshotsCompressed || 0) + (report.entryVersionsCompressed || 0);
          done();
          alert((removed || compressed) ? ('저장 공간 정리 완료: 삭제 ' + removed + '개 / 압축 ' + compressed + '개.') : '정리하거나 압축할 데이터가 없습니다.');
        } catch (e) {
          done();
          alert('저장 공간 정리 실패: ' + (e && e.message ? e.message : e));
        }
      };
      nd.appendChild(btn);
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div'); title.textContent = '로컬 데이터 삭제'; title.style.cssText = 'font-size:14px;color:#e88;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
      addText(nd, '이 브라우저에 저장된 로어, 설정, 검색 준비, 로그를 모두 삭제함. 서버 백업은 삭제되지 않음.');
      const btn = makeBtn('이 브라우저의 로어 데이터 삭제', 'border-color:#833;color:#f99;margin-top:10px;');
      btn.onclick = async () => {
        if (!confirm('이 브라우저의 로어/설정/검색 준비/로그가 모두 삭제됨. 서버 백업은 남음. 계속할까요?')) return;
        const typed = prompt('정말 삭제하려면 "삭제"를 입력하세요.');
        if (typed !== '삭제') return;
        const done = setButtonBusy(btn, '삭제 중...');
        try {
          await clearLocalInstallData();
          alert('로컬 데이터 삭제 완료. 페이지를 새로고침합니다.');
          location.reload();
        } catch (e) {
          done();
          alert('로컬 데이터 삭제 실패: ' + (e && e.message ? e.message : e));
        }
      };
      nd.appendChild(btn);
    }});
  }

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  _w.__LoreInj.registerSubMenu('backup', function(modal) {
    modal.createSubMenu('백업/동기화', (m) => {
      m.replaceContentPanel(renderBackupUI, '백업/동기화');
    });
  });

  _w.__LoreInj.__subBackupLoaded = true;
})();
