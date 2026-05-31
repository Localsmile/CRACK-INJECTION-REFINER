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

  const { C, settings } = _w.__LoreInj;
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

  function cleanUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function getServerUrl() {
    return cleanUrl(getCfg().backupServerUrl || DEFAULT_BACKUP_SERVER_URL);
  }

  function assertServerInput(url, userId, password, needPassword) {
    if (!cleanUrl(url)) throw new Error('서버 주소를 확인해야 함.');
    if (!String(userId || '').trim()) throw new Error('ID를 입력해야 함.');
    if (needPassword && !String(password || '')) throw new Error('비밀번호를 입력해야 함.');
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

  async function encryptJson(obj, userId, password) {
    const key = await deriveBackupKey(userId, password);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = enc.encode(JSON.stringify(obj));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return 'v1.' + b64url(iv) + '.' + b64url(data);
  }

  async function decryptJson(cipher, userId, password) {
    const parts = String(cipher || '').split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('지원하지 않는 암호화 형식.');
    const key = await deriveBackupKey(userId, password);
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(parts[1]) }, key, fromB64url(parts[2]));
    return JSON.parse(dec.decode(data));
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
      packs: Array.from(packNames).sort(),
      entryCount: entries.length,
      embeddingCount: Array.isArray(db.embeddings) ? db.embeddings.length : 0,
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
      throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
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

  async function apiDownload(backupId) {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/get', { backupId }, serverSession.token);
  }

  async function apiDelete(backupId) {
    if (!serverSession || !serverSession.token) throw new Error('먼저 로그인해야 함.');
    return serverFetch('/api/backups/delete', { backupId }, serverSession.token);
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

  function renderBackupUI(panel) {
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
      const title = document.createElement('div'); title.textContent = '서버 연결'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
      addText(nd, '수동 동기화 전용. 비밀번호는 저장하지 않음. 서버에는 암호화된 백업만 저장됨.');
      const cfg = getCfg();
      const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;';
      if (typeof matchMedia === 'function' && matchMedia('(max-width: 720px)').matches) grid.style.gridTemplateColumns = '1fr';
      const idInput = makeInput(cfg.backupServerId || '', 'ID');
      const pwInput = makeInput('', '비밀번호', 'password');
      grid.appendChild(idInput); grid.appendChild(pwInput); nd.appendChild(grid);

      const advanced = document.createElement('details');
      advanced.style.cssText = 'margin-top:8px;border:1px solid #292929;border-radius:4px;padding:8px;background:#101010;';
      const summary = document.createElement('summary');
      summary.textContent = '직접 서버 주소 사용';
      summary.style.cssText = 'cursor:pointer;font-size:11px;color:#888;';
      const urlInput = makeInput(cfg.backupServerUrl || '', DEFAULT_BACKUP_SERVER_URL);
      urlInput.style.marginTop = '8px';
      advanced.appendChild(summary);
      advanced.appendChild(urlInput);
      nd.appendChild(advanced);

      const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
      const checkBtn = makeBtn('ID 확인', 'border-color:#555;color:#bbb;');
      const regBtn = makeBtn('계정 만들기', 'border-color:#285;color:#6c9;');
      const loginBtn = makeBtn('로그인', 'border-color:#258;color:#8bc;');
      const status = addText(nd, serverSession ? ('로그인됨: ' + serverSession.userId) : '로그인 안 됨.');
      const persist = () => saveCfg({ backupServerUrl: cleanUrl(urlInput.value), backupServerId: idInput.value.trim() });
      checkBtn.onclick = async () => {
        try { persist(); assertServerInput(getServerUrl(), idInput.value, '', false); const res = await apiCheckId(idInput.value.trim()); alert(res.available ? '사용 가능한 ID.' : '이미 사용 중인 ID.'); }
        catch (e) { alert('ID 확인 실패: ' + e.message); }
      };
      regBtn.onclick = async () => {
        try { persist(); assertServerInput(getServerUrl(), idInput.value, pwInput.value, true); await apiRegister(idInput.value.trim(), pwInput.value); await apiLogin(idInput.value.trim(), pwInput.value); status.textContent = '로그인됨: ' + idInput.value.trim(); alert('계정 생성 완료.'); }
        catch (e) { alert('계정 생성 실패: ' + e.message); }
      };
      loginBtn.onclick = async () => {
        try { persist(); assertServerInput(getServerUrl(), idInput.value, pwInput.value, true); await apiLogin(idInput.value.trim(), pwInput.value); status.textContent = '로그인됨: ' + idInput.value.trim(); alert('로그인 완료.'); }
        catch (e) { alert('로그인 실패: ' + e.message); }
      };
      btns.appendChild(checkBtn); btns.appendChild(regBtn); btns.appendChild(loginBtn); nd.appendChild(btns);
    }});

    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const title = document.createElement('div'); title.textContent = '서버 백업'; title.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:8px;'; nd.appendChild(title);
      addText(nd, '서버 백업은 ID당 10개까지 저장됨. 10개가 차면 기존 백업을 삭제한 뒤 저장해야 함. 1년 지난 백업은 서버에서 자동 삭제 대상.');
      const listBox = document.createElement('div'); listBox.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px;'; nd.appendChild(listBox);
      let selected = null;
      let lastItems = [];

      const renderList = async () => {
        listBox.textContent = '';
        if (!serverSession || !activePassword) {
          addText(listBox, '로그인 후 목록을 볼 수 있음.', 'font-size:12px;color:#777;padding:10px;');
          return;
        }
        try {
          const res = await apiList();
          lastItems = res.items || [];
          if (!lastItems.length) {
            addText(listBox, '서버 백업 없음.', 'font-size:12px;color:#777;padding:10px;');
            return;
          }
          for (const item of lastItems) {
            let meta = null;
            try { meta = item.encryptedMeta ? await decryptJson(item.encryptedMeta, serverSession.userId, activePassword) : null; } catch (_) {}
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = 'width:100%;text-align:left;border:1px solid #333;background:#111;color:#ccc;border-radius:4px;padding:8px;cursor:pointer;';
            const label = meta ? ((meta.packs || []).slice(0, 4).join(', ') || '로어팩 없음') : (item.title || item.backupId);
            row.textContent = formatTime(item.createdAt) + ' / ' + label + ' / 로어 ' + (meta ? meta.entryCount : '?') + '개 / ' + Math.ceil((item.payloadBytes || 0) / 1024) + 'KB';
            row.onclick = () => {
              selected = item;
              Array.from(listBox.children).forEach(x => x.style.borderColor = '#333');
              row.style.borderColor = '#58a';
            };
            listBox.appendChild(row);
          }
        } catch (e) {
          addText(listBox, '목록 불러오기 실패: ' + e.message, 'font-size:12px;color:#d88;padding:10px;');
        }
      };

      const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
      const refreshBtn = makeBtn('목록 새로고침', 'border-color:#555;color:#bbb;');
      const uploadBtn = makeBtn('서버에 저장', 'border-color:#285;color:#6c9;');
      const mergeBtn = makeBtn('서버에서 병합', 'border-color:#258;color:#8bc;');
      const replaceBtn = makeBtn('서버 백업으로 교체', 'border-color:#833;color:#e88;');
      const deleteBtn = makeBtn('선택 백업 삭제', 'border-color:#833;color:#e88;');
      refreshBtn.onclick = renderList;
      uploadBtn.onclick = async () => {
        try {
          if (!serverSession || !activePassword) throw new Error('먼저 로그인해야 함.');
          const list = await apiList();
          if ((list.items || []).length >= 10) throw new Error('서버 백업은 최대 10개까지 보관됨. 기존 백업을 삭제한 뒤 다시 저장할 것.');
          const data = await B.exportFullBackup({ includeSecrets: false, includeLogs: true });
          const meta = backupSummary(data);
          const payload = await encryptJson(data, serverSession.userId, activePassword);
          const encryptedMeta = await encryptJson(meta, serverSession.userId, activePassword);
          await apiUpload('backup-' + new Date().toISOString().slice(0, 19), payload, encryptedMeta);
          alert('서버 저장 완료.');
          await renderList();
        } catch (e) { alert('서버 저장 실패: ' + e.message); }
      };
      const pullSelected = async (mode) => {
        if (!selected) throw new Error('가져올 서버 백업을 선택해야 함.');
        const res = await apiDownload(selected.backupId);
        const data = await decryptJson(res.payload, serverSession.userId, activePassword);
        return importBackupWithMode(data, mode, false);
      };
      mergeBtn.onclick = async () => {
        try { const report = await pullSelected('merge'); if (report) alert('서버 병합 완료: 로어 ' + report.entries + '개'); }
        catch (e) { alert('서버 병합 실패: ' + e.message); }
      };
      replaceBtn.onclick = async () => {
        if (!confirm('현재 로컬 데이터를 선택한 서버 백업 기준으로 교체함.')) return;
        try { const report = await pullSelected('replace'); if (report) alert('서버 교체 복원 완료: 로어 ' + report.entries + '개'); }
        catch (e) { alert('서버 교체 복원 실패: ' + e.message); }
      };
      deleteBtn.onclick = async () => {
        try {
          if (!selected) throw new Error('삭제할 서버 백업을 선택해야 함.');
          if (!confirm('선택한 서버 백업을 삭제함. 로컬 데이터는 삭제되지 않음.')) return;
          await apiDelete(selected.backupId);
          selected = null;
          alert('서버 백업 삭제 완료.');
          await renderList();
        } catch (e) { alert('서버 삭제 실패: ' + e.message); }
      };
      btns.appendChild(refreshBtn); btns.appendChild(uploadBtn); btns.appendChild(mergeBtn); btns.appendChild(replaceBtn); btns.appendChild(deleteBtn); nd.appendChild(btns);
      setTimeout(renderList, 0);
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
