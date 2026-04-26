// == 인젝터 UI 패널 — Advanced Tools ==
// 역할: 스냅샷, 임베딩, URL·텍스트 변환
// 의존: injecter-ui-utils.js, injecter-2.js, injecter-3.js, core-importer.js, core-embedding.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:advanced] UI utils not loaded');
    return;
  }
  if (UI.__advancedPanelLoaded) return;

  function runtime() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }
  function nowName() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function cssInput(extra) {
    return 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;' + (extra || '');
  }
  function smallButton(label, kind) {
    return UI.createButton(label, { compact: true, kind: kind || '', bold: kind === 'primary' || kind === 'danger' });
  }

  function apiOpts(settings, embedding) {
    const cfg = settings.config;
    return {
      apiType: cfg.autoExtApiType || 'key',
      key: cfg.autoExtKey,
      vertexJson: cfg.autoExtVertexJson,
      vertexLocation: cfg.autoExtVertexLocation || 'global',
      vertexProjectId: cfg.autoExtVertexProjectId,
      firebaseScript: cfg.autoExtFirebaseScript,
      firebaseEmbedKey: cfg.autoExtFirebaseEmbedKey,
      model: embedding ? (cfg.embeddingModel || 'gemini-embedding-001') : (cfg.autoExtModel === '_custom' ? cfg.autoExtCustomModel : cfg.autoExtModel)
    };
  }
  function hasApi(settings, embedding) {
    const cfg = settings.config;
    const type = cfg.autoExtApiType || 'key';
    if (embedding && type === 'firebase') return !!cfg.autoExtFirebaseEmbedKey;
    if (type === 'vertex') return !!cfg.autoExtVertexJson;
    if (type === 'firebase') return !!cfg.autoExtFirebaseScript;
    return !!cfg.autoExtKey;
  }

  async function renderSnapshotTools(nd, R) {
    const db = R.db;
    const settings = R.settings;
    const createSnapshot = R.createSnapshot;
    const restoreSnapshot = R.restoreSnapshot;
    const deleteSnapshot = R.deleteSnapshot;

    nd.appendChild(UI.createSection('스냅샷', '팩 단위 백업을 만들거나 복원합니다.'));

    if (!db || !db.snapshots || !createSnapshot || !restoreSnapshot || !deleteSnapshot) {
      nd.appendChild(UI.createNotice('스냅샷 도구를 불러오지 못했습니다.', 'error'));
      return;
    }

    const packs = await db.packs.toArray();
    const row = document.createElement('div');
    row.className = 'lore-row';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:10px;';
    const packSel = document.createElement('select');
    packSel.style.cssText = cssInput('flex:1;');
    packs.forEach(function(pack) {
      const opt = document.createElement('option');
      opt.value = pack.name;
      opt.textContent = pack.name + ' (' + (pack.entryCount || 0) + ')';
      packSel.appendChild(opt);
    });
    const createBtn = smallButton('스냅샷 만들기', 'primary');
    createBtn.onclick = async function() {
      if (!packSel.value) { alert('팩을 먼저 선택하세요.'); return; }
      const label = prompt('스냅샷 이름', '수동 백업 ' + nowName());
      if (label === null) return;
      createBtn.disabled = true;
      try {
        await createSnapshot(packSel.value, label || '수동 백업', 'manual');
        alert('스냅샷을 만들었습니다.');
        location.reload();
      } catch(e) {
        alert('스냅샷 실패: ' + e.message);
      } finally {
        createBtn.disabled = false;
      }
    };
    row.appendChild(packSel);
    row.appendChild(createBtn);
    nd.appendChild(row);

    const snaps = await db.snapshots.orderBy('timestamp').reverse().toArray();
    if (!snaps.length) {
      nd.appendChild(UI.createNotice('아직 스냅샷이 없습니다.', 'info'));
      return;
    }

    const list = document.createElement('div');
    list.className = 'lore-scroll-list';
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto;';
    snaps.slice(0, 30).forEach(function(snap) {
      const item = document.createElement('div');
      item.className = 'lore-card lore-row';
      item.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:center;border:1px solid #333;border-radius:6px;background:#111;padding:8px;';
      const info = document.createElement('div');
      info.style.cssText = 'font-size:12px;color:#ccc;line-height:1.5;word-break:break-all;flex:1;';
      info.textContent = snap.packName + ' / ' + (snap.label || '스냅샷') + ' / ' + new Date(snap.timestamp).toLocaleString();
      const restore = smallButton('복원', 'danger');
      restore.onclick = async function() {
        if (!confirm('스냅샷을 복원할까요: ' + snap.packName + '? 현재 팩 항목이 교체됩니다.')) return;
        restore.disabled = true;
        try {
          await restoreSnapshot(snap.id);
          alert('스냅샷을 복원함');
          location.reload();
        } catch(e) {
          alert('복원 실패: ' + e.message);
        } finally {
          restore.disabled = false;
        }
      };
      const del = smallButton('삭제', 'danger');
      del.onclick = async function() {
        if (!confirm('스냅샷을 삭제할까요: ' + (snap.label || snap.packName) + '?')) return;
        del.disabled = true;
        try {
          await deleteSnapshot(snap.id);
          alert('스냅샷을 삭제함');
          location.reload();
        } catch(e) {
          alert('삭제 실패: ' + e.message);
        } finally {
          del.disabled = false;
        }
      };
      item.appendChild(info);
      item.appendChild(UI.createActionGroup([restore], [], [del]));
      list.appendChild(item);
    });
    nd.appendChild(list);
  }



  async function renderConversionTools(nd, R) {
    const C = R.C || UI.getCore();
    const settings = R.settings;
    const setPackEnabled = R.setPackEnabled;

    nd.appendChild(UI.createSection('URL·텍스트 변환', '외부 설정을 로어 팩으로 변환합니다.'));

    if (!C || !C.importFromUrl || !C.importFromText || !settings || !settings.config) {
      nd.appendChild(UI.createNotice('가져오기 도구를 불러오지 못했습니다.', 'error'));
      return;
    }

    const pack = document.createElement('input');
    pack.placeholder = '팩 이름';
    pack.style.cssText = cssInput('margin-bottom:8px;');
    nd.appendChild(pack);

    const url = document.createElement('input');
    url.placeholder = 'URL 붙여넣기';
    url.style.cssText = cssInput('margin-bottom:8px;');
    nd.appendChild(url);

    const urlBtn = UI.createButton('URL 변환', { kind: 'primary', bold: true });
    const urlStatus = document.createElement('div');
    urlStatus.style.cssText = 'font-size:11px;color:#888;margin:6px 0 14px;min-height:16px;line-height:1.5;';
    urlBtn.onclick = async function() {
      const packName = pack.value.trim();
      if (!url.value.trim() || !packName) { alert('URL과 팩 이름이 필요합니다.'); return; }
      if (!hasApi(settings, false)) { alert('LLM API 설정이 없습니다.'); return; }
      urlBtn.disabled = true;
      urlStatus.textContent = 'URL 변환 중';
      urlStatus.style.color = '#4a9';
      try {
        const count = await C.importFromUrl(url.value.trim(), packName, apiOpts(settings, false));
        if (count > 0 && setPackEnabled) await setPackEnabled(packName, true);
        urlStatus.textContent = count + '개 항목 생성';
        urlStatus.style.color = count ? '#4a9' : '#da8';
      } catch(e) {
        urlStatus.textContent = '실패: ' + e.message;
        urlStatus.style.color = '#d66';
      } finally {
        urlBtn.disabled = false;
      }
    };
    nd.appendChild(urlBtn);
    nd.appendChild(urlStatus);

    const text = document.createElement('textarea');
    text.placeholder = '원문, 캐릭터 시트, 세계관 설정, 장면 노트를 붙여넣기';
    text.style.cssText = cssInput('height:150px;font-family:monospace;resize:vertical;margin-bottom:8px;');
    nd.appendChild(text);

    const textBtn = UI.createButton('텍스트 변환', { kind: 'success', bold: true });
    const textStatus = document.createElement('div');
    textStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;min-height:16px;line-height:1.5;';
    textBtn.onclick = async function() {
      const packName = pack.value.trim();
      if (!text.value.trim() || !packName) { alert('텍스트와 팩 이름이 필요합니다.'); return; }
      if (!hasApi(settings, false)) { alert('LLM API 설정이 없습니다.'); return; }
      textBtn.disabled = true;
      textStatus.textContent = '텍스트 변환 중';
      textStatus.style.color = '#4a9';
      try {
        const count = await C.importFromText(text.value.trim(), packName, apiOpts(settings, false));
        if (count > 0 && setPackEnabled) await setPackEnabled(packName, true);
        textStatus.textContent = count + '개 항목 생성';
        textStatus.style.color = count ? '#4a9' : '#da8';
      } catch(e) {
        textStatus.textContent = '실패: ' + e.message;
        textStatus.style.color = '#d66';
      } finally {
        textBtn.disabled = false;
      }
    };
    nd.appendChild(textBtn);
    nd.appendChild(textStatus);
  }



  UI.registerPanel({
    id: 'advanced',
    label: '고급 도구',
    title: '고급 도구',
    order: 110,
    render: async function(panel) {
      const R = runtime();

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('고급 도구', '로어 데이터 정비나 이전 작업에만 사용합니다.'));
        nd.appendChild(UI.createNotice('이 도구는 저장된 로어 데이터를 수정합니다. 큰 변경 전 스냅샷을 만드세요.', 'warn'));
      });

      await UI.addBox(panel, async function(nd) { await renderSnapshotTools(nd, R); });
      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('항목 편집', '로어 탭에서 각 항목을 바로 수정'));
        nd.appendChild(UI.createNotice('항목 JSON 편집과 앵커 전환은 로어 탭의 각 항목 행으로 이동했습니다.', 'info'));
      });
      await UI.addBox(panel, async function(nd) { await renderConversionTools(nd, R); });
    }
  });

  UI.__advancedPanelLoaded = true;
  console.log('[LoreInj:UI] advanced panel loaded');
})();