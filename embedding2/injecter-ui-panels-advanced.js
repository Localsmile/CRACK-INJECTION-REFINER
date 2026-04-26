// == 인젝터 UI 패널 — Advanced Tools ==
// 역할: 스냅샷, 엔트리 편집, 버전 복원, 임베딩, 변환
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
  function cleanEntryForEdit(e) {
    const c = Object.assign({}, e || {});
    delete c.id;
    delete c.packName;
    delete c.project;
    delete c.enabled;
    return c;
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

    nd.appendChild(UI.createSection('스냅샷', '팩 단위 백업을 만들거나 복원합니다.'));

    if (!db || !db.snapshots || !createSnapshot || !restoreSnapshot) {
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
          alert('스냅샷을 복원했습니다.');
          location.reload();
        } catch(e) {
          alert('복원 실패: ' + e.message);
        } finally {
          restore.disabled = false;
        }
      };
      item.appendChild(info);
      item.appendChild(restore);
      list.appendChild(item);
    });
    nd.appendChild(list);
  }

  async function renderEntryTools(nd, R) {
    const db = R.db;
    const settings = R.settings;
    const C = R.C || UI.getCore();

    nd.appendChild(UI.createSection('항목 편집', '항목 하나를 수정하거나, 앵커로 잠그거나, 버전을 복원하거나, 검색 데이터를 다시 생성합니다.'));

    if (!db || !settings || !settings.config) {
      nd.appendChild(UI.createNotice('데이터베이스나 설정을 아직 불러오지 못했습니다.', 'error'));
      return;
    }

    const packs = await db.packs.toArray();
    const packSel = document.createElement('select');
    packSel.style.cssText = cssInput('margin-bottom:8px;');
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = '전체 팩';
    packSel.appendChild(allOpt);
    packs.forEach(function(pack) {
      const opt = document.createElement('option');
      opt.value = pack.name;
      opt.textContent = pack.name + ' (' + (pack.entryCount || 0) + ')';
      packSel.appendChild(opt);
    });

    const entrySel = document.createElement('select');
    entrySel.style.cssText = cssInput('margin-bottom:8px;');

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-bottom:8px;min-height:16px;';

    const ta = document.createElement('textarea');
    ta.style.cssText = cssInput('height:240px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const historyBox = document.createElement('div');
    historyBox.style.cssText = 'display:none;margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;';

    let currentEntries = [];
    let currentEntry = null;

    async function loadEntries() {
      entrySel.innerHTML = '';
      const packName = packSel.value;
      currentEntries = packName ? await db.entries.where('packName').equals(packName).toArray() : await db.entries.toArray();
      currentEntries.sort(function(a, b) {
        return String(a.packName || '').localeCompare(String(b.packName || '')) || String(a.name || '').localeCompare(String(b.name || ''));
      });
      currentEntries.forEach(function(e) {
        const opt = document.createElement('option');
        opt.value = String(e.id);
        opt.textContent = '[' + (e.type || '항목') + '] ' + e.name + ' / ' + e.packName + (e.anchor ? ' / 앵커' : '');
        entrySel.appendChild(opt);
      });
      selectEntry();
    }

    function selectEntry() {
      currentEntry = currentEntries.find(e => String(e.id) === String(entrySel.value)) || currentEntries[0] || null;
      if (!currentEntry) {
        meta.textContent = '항목 없음';
        ta.value = '';
        historyBox.style.display = 'none';
        historyBox.innerHTML = '';
        return;
      }
      entrySel.value = String(currentEntry.id);
      meta.textContent = 'ID: ' + currentEntry.id + ' / 팩: ' + currentEntry.packName + ' / 앵커: ' + (currentEntry.anchor ? '켬' : '끔');
      ta.value = JSON.stringify(cleanEntryForEdit(currentEntry), null, 2);
      historyBox.style.display = 'none';
      historyBox.innerHTML = '';
    }

    packSel.onchange = loadEntries;
    entrySel.onchange = selectEntry;

    nd.appendChild(packSel);
    nd.appendChild(entrySel);
    nd.appendChild(meta);
    nd.appendChild(ta);

    const actions = document.createElement('div');
    actions.className = 'lore-actions';
    actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

    const saveBtn = smallButton('JSON 저장', 'primary');
    saveBtn.onclick = async function() {
      if (!currentEntry) return;
      try {
        const parsed = JSON.parse(ta.value);
        if (!parsed.name) throw new Error('name 값이 필요합니다.');
        const updated = Object.assign({}, currentEntry, parsed, {
          id: currentEntry.id,
          packName: currentEntry.packName,
          project: currentEntry.project || '',
          enabled: currentEntry.enabled !== false,
          lastUpdated: Date.now()
        });
        if (C && C.saveEntryVersion) {
          try { await C.saveEntryVersion(currentEntry, 'manual_edit'); } catch(_){}
        }
        await db.entries.put(updated);
        currentEntry = updated;
        const idx = currentEntries.findIndex(e => e.id === updated.id);
        if (idx >= 0) currentEntries[idx] = updated;
        meta.textContent = '저장됨. ID: ' + updated.id + ' / 팩: ' + updated.packName + ' / 앵커: ' + (updated.anchor ? '켬' : '끔');
        alert('저장했습니다.');
      } catch(e) {
        alert('저장 실패: ' + e.message);
      }
    };

    const anchorBtn = smallButton('앵커 전환');
    anchorBtn.onclick = async function() {
      if (!currentEntry) return;
      currentEntry.anchor = !currentEntry.anchor;
      await db.entries.put(currentEntry);
      meta.textContent = 'ID: ' + currentEntry.id + ' / 팩: ' + currentEntry.packName + ' / 앵커: ' + (currentEntry.anchor ? '켬' : '끔');
      ta.value = JSON.stringify(cleanEntryForEdit(currentEntry), null, 2);
      alert(currentEntry.anchor ? '앵커를 켰습니다.' : '앵커를 껐습니다.');
    };

    const embedBtn = smallButton('검색 데이터 생성', 'success');
    embedBtn.onclick = async function() {
      if (!currentEntry) return;
      if (!C || !C.ensureEmbedding) { alert('검색 데이터 생성 도구를 불러오지 못했습니다.'); return; }
      if (!hasApi(settings, true)) { alert('검색 데이터 API 설정이 없습니다.'); return; }
      embedBtn.disabled = true;
      const orig = embedBtn.textContent;
      embedBtn.textContent = '생성 중';
      try {
        await C.ensureEmbedding(currentEntry, apiOpts(settings, true));
        alert('검색 데이터를 생성했습니다.');
      } catch(e) {
        alert('검색 데이터 생성 실패: ' + e.message);
      } finally {
        embedBtn.textContent = orig;
        embedBtn.disabled = false;
      }
    };

    const historyBtn = smallButton('버전 기록');
    historyBtn.onclick = async function() {
      if (!currentEntry) return;
      if (!C || !C.getEntryVersions || !C.restoreEntryVersion) {
        historyBox.style.display = 'block';
        historyBox.innerHTML = '<div style="font-size:11px;color:#d66;">버전 기록 도구를 불러오지 못했습니다.</div>';
        return;
      }
      if (historyBox.style.display !== 'none') {
        historyBox.style.display = 'none';
        return;
      }
      historyBox.style.display = 'block';
      historyBox.innerHTML = '<div style="font-size:11px;color:#888;">버전 불러오는 중</div>';
      try {
        const versions = await C.getEntryVersions(currentEntry.id);
        historyBox.innerHTML = '';
        if (!versions || !versions.length) {
          historyBox.appendChild(UI.createNotice('저장된 버전이 없습니다. 이후 편집이나 추출 병합 전에 버전이 생성됩니다.', 'info'));
          return;
        }
        versions.forEach(function(v) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border-bottom:1px dashed #222;padding:6px 0;';
          const info = document.createElement('div');
          info.style.cssText = 'font-size:11px;color:#aaa;line-height:1.5;word-break:break-all;flex:1;';
          const snap = v.snapshot || {};
          info.textContent = new Date(v.ts).toLocaleString() + ' / ' + (v.reason || '자동') + ' / ' + String(snap.summary || snap.name || '').slice(0, 100);
          const restore = smallButton('복원', 'danger');
          restore.onclick = async function() {
            if (!confirm('이 항목 버전을 복원할까요? 가능하면 현재 상태가 먼저 백업됩니다.')) return;
            try {
              const restored = await C.restoreEntryVersion(v.id);
              currentEntry = restored;
              const idx = currentEntries.findIndex(e => e.id === restored.id);
              if (idx >= 0) currentEntries[idx] = restored;
              ta.value = JSON.stringify(cleanEntryForEdit(restored), null, 2);
              meta.textContent = '복원됨. ID: ' + restored.id + ' / 팩: ' + restored.packName + ' / 앵커: ' + (restored.anchor ? '켬' : '끔');
              alert('복원했습니다.');
            } catch(e) {
              alert('복원 실패: ' + e.message);
            }
          };
          row.appendChild(info);
          row.appendChild(restore);
          historyBox.appendChild(row);
        });
      } catch(e) {
        historyBox.innerHTML = '<div style="font-size:11px;color:#d66;">오류: ' + e.message + '</div>';
      }
    };

    if (UI.createActionGroup) {
      nd.appendChild(UI.createActionGroup([saveBtn, embedBtn], [anchorBtn, historyBtn], []));
    } else {
      actions.appendChild(saveBtn);
      actions.appendChild(anchorBtn);
      actions.appendChild(embedBtn);
      actions.appendChild(historyBtn);
      nd.appendChild(actions);
    }
    nd.appendChild(historyBox);

    await loadEntries();
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

  function renderTemplateTools(nd, R) {
    const settings = R.settings;

    nd.appendChild(UI.createSection('추출 템플릿', '자동 추출에 사용할 프롬프트를 만들고 수정합니다.'));

    if (!settings || !settings.config || !settings.getActiveTemplate) {
      nd.appendChild(UI.createNotice('템플릿 설정을 불러오지 못했습니다.', 'error'));
      return;
    }

    if (!Array.isArray(settings.config.templates)) settings.config.templates = [];

    const top = document.createElement('div');
    top.className = 'lore-actions';
    top.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
    const select = document.createElement('select');
    select.style.cssText = cssInput('flex:1;');
    const newBtn = smallButton('새 템플릿', 'primary');
    const renameBtn = smallButton('이름 변경');
    const delBtn = smallButton('삭제', 'danger');
    top.appendChild(select);
    top.appendChild(newBtn);
    top.appendChild(renameBtn);
    top.appendChild(delBtn);
    nd.appendChild(top);

    const schemaLabel = document.createElement('div');
    schemaLabel.textContent = '스키마 JSON';
    schemaLabel.style.cssText = 'font-size:12px;color:#999;margin:8px 0 4px;';
    const schema = document.createElement('textarea');
    schema.style.cssText = cssInput('height:130px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const noDbLabel = document.createElement('div');
    noDbLabel.textContent = '프롬프트 — 기존 로어 미포함';
    noDbLabel.style.cssText = 'font-size:12px;color:#999;margin:8px 0 4px;';
    const noDb = document.createElement('textarea');
    noDb.style.cssText = cssInput('height:150px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const withDbLabel = document.createElement('div');
    withDbLabel.textContent = '프롬프트 — 기존 로어 포함';
    withDbLabel.style.cssText = 'font-size:12px;color:#999;margin:8px 0 4px;';
    const withDb = document.createElement('textarea');
    withDb.style.cssText = cssInput('height:150px;font-family:monospace;resize:vertical;margin-bottom:8px;');

    const saveBtn = UI.createButton('템플릿 저장', { kind: 'success', bold: true });
    const resetBtn = UI.createButton('기본값으로 복구', { kind: '', bold: false });

    nd.appendChild(schemaLabel);
    nd.appendChild(schema);
    nd.appendChild(noDbLabel);
    nd.appendChild(noDb);
    nd.appendChild(withDbLabel);
    nd.appendChild(withDb);

    const btnRow = document.createElement('div');
    btnRow.className = 'lore-actions';
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(resetBtn);
    nd.appendChild(btnRow);

    function activeTemplate() {
      return settings.getActiveTemplate() || settings.config.templates[0];
    }

    function renderOptions() {
      select.innerHTML = '';
      settings.config.templates.forEach(function(t) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name + (t.isDefault ? ' (기본)' : '');
        select.appendChild(opt);
      });
      select.value = settings.config.activeTemplateId || 'default';
      renderFields();
    }

    function renderFields() {
      const t = activeTemplate();
      if (!t) return;
      schema.value = t.schema || '';
      noDb.value = t.promptWithoutDb || '';
      withDb.value = t.promptWithDb || '';
      const readOnly = !!t.isDefault;
      schema.disabled = readOnly;
      noDb.disabled = readOnly;
      withDb.disabled = readOnly;
      renameBtn.style.display = readOnly ? 'none' : '';
      delBtn.style.display = readOnly ? 'none' : '';
      resetBtn.style.display = readOnly ? 'none' : '';
      const opacity = readOnly ? '0.6' : '1';
      schema.style.opacity = opacity;
      noDb.style.opacity = opacity;
      withDb.style.opacity = opacity;
    }

    select.onchange = function() {
      settings.config.activeTemplateId = select.value;
      save(settings);
      renderFields();
    };

    newBtn.onclick = function() {
      const name = prompt('템플릿 이름');
      if (!name) return;
      const base = activeTemplate();
      const id = 'tpl_' + Date.now();
      settings.config.templates.push({
        id,
        name: name.trim(),
        isDefault: false,
        schema: base ? base.schema : '',
        promptWithoutDb: base ? base.promptWithoutDb : '',
        promptWithDb: base ? base.promptWithDb : ''
      });
      settings.config.activeTemplateId = id;
      save(settings);
      renderOptions();
    };

    renameBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) return;
      const name = prompt('템플릿 이름', t.name);
      if (!name) return;
      t.name = name.trim();
      save(settings);
      renderOptions();
    };

    delBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) return;
      if (!confirm('템플릿을 삭제할까요: ' + t.name + '?')) return;
      settings.config.templates = settings.config.templates.filter(x => x.id !== t.id);
      settings.config.activeTemplateId = 'default';
      save(settings);
      renderOptions();
    };

    saveBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) { alert('기본 템플릿은 읽기 전용입니다.'); return; }
      try {
        JSON.parse(schema.value);
      } catch(e) {
        if (!confirm('스키마가 올바른 JSON이 아닙니다. 그래도 저장할까요?')) return;
      }
      t.schema = schema.value;
      t.promptWithoutDb = noDb.value;
      t.promptWithDb = withDb.value;
      save(settings);
      alert('템플릿을 저장했습니다.');
    };

    resetBtn.onclick = function() {
      const t = activeTemplate();
      if (!t || t.isDefault) return;
      const def = settings.config.templates.find(x => x.isDefault || x.id === 'default');
      if (!def) { alert('기본 템플릿을 찾지 못했습니다.'); return; }
      if (!confirm('이 템플릿을 기본값으로 되돌릴까요?')) return;
      t.schema = def.schema;
      t.promptWithoutDb = def.promptWithoutDb;
      t.promptWithDb = def.promptWithDb;
      save(settings);
      renderFields();
      alert('템플릿을 복구했습니다.');
    };

    renderOptions();
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
      await UI.addBox(panel, async function(nd) { await renderEntryTools(nd, R); });
      await UI.addBox(panel, async function(nd) { await renderConversionTools(nd, R); });
    }
  });

  UI.__advancedPanelLoaded = true;
  console.log('[LoreInj:UI] advanced panel loaded');
})();