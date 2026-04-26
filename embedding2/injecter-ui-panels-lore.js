// == 인젝터 UI 패널 — Lore Manager ==
// 역할: 현재 채팅 팩 선택, 로어 항목 확인, JSON 가져오기/내보내기
// 의존: injecter-ui-utils.js, injecter-2.js settings/db
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:lore] UI utils not loaded');
    return;
  }
  if (UI.__lorePanelLoaded) return;

  function L() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  const HELP = {
    overview: {
      title: '로어 관리',
      what: '팩 선택, 항목 확인, JSON 가져오기를 한 화면에서 처리해요.',
      example: '먼저 사용할 팩을 켠 뒤 바로 아래에서 항목을 확인하고 편집할 수 있어요.',
      recommended: '현재 대화에 필요한 팩만 켜 두세요.',
      warning: '팩을 많이 켜면 검색 후보가 늘어 관련 없는 항목도 섞일 수 있어요.',
      result: '이전 파일/로어 분리 흐름 없이 한 화면에서 관리가 끝나요.'
    },
    packSelect: {
      title: '팩 선택',
      what: '현재 대화에서 실제로 사용할 로어 팩을 켜고 꺼요.',
      example: '“장기 세션 설정” 팩을 켜면 이 채팅에서 해당 팩 항목이 검색·주입 후보가 돼요.',
      recommended: '대화별로 꼭 필요한 팩만 켜세요.',
      warning: '꺼진 팩은 삭제되지 않지만 현재 대화에는 적용되지 않아요.',
      result: '활성 로어 목록과 주입 후보가 즉시 달라져요.'
    },
    importJson: {
      title: 'JSON 가져오기',
      what: 'JSON 파일이나 붙여넣은 JSON을 로어 팩으로 넣어요.',
      example: '팩 이름에 “테스트 설정”을 쓰고 가져오면 그 이름의 팩이 생기고 현재 대화에 켜져요.',
      recommended: '가져오기 전 팩 이름을 먼저 확인하세요.',
      warning: '같은 팩 안에 같은 이름의 항목이 있으면 새로 늘리지 않고 기존 항목을 갱신해요.',
      result: '외부 설정을 로어 팩으로 바로 사용할 수 있어요.'
    },
    activeLore: {
      title: '활성 로어',
      what: '현재 대화에 켜진 팩의 항목을 확인하고 개별로 켜거나 꺼요.',
      example: '팩은 유지하되 특정 항목만 잠시 끄면 그 항목은 이 대화에서 검색·주입 후보에서 빠져요.',
      recommended: '문제가 되는 항목을 삭제하기 전 먼저 꺼서 테스트하세요.',
      warning: '항목을 편집하면 검색 데이터는 다시 생성이 필요해요.',
      result: '항목별 사용 여부와 내용 수정이 현재 대화에 반영돼요.'
    },
    itemEdit: {
      title: '로어 항목 편집',
      what: '이름, 유형, 요약, 트리거, 삽입 문구를 구조화된 입력칸으로 수정해요.',
      example: '트리거에 별명이나 장소명을 한 줄씩 추가하면 검색 후보로 잡힐 가능성이 올라가요.',
      recommended: '기본 필드를 먼저 고치고, 고급 JSON은 구조 확인이 필요할 때만 쓰세요.',
      warning: '저장하면 기존 검색 데이터가 무효화되어 다시 생성이 필요해요.',
      result: '수정된 항목은 원본 ID와 팩을 유지한 채 저장돼요.'
    },
    searchStale: {
      title: '검색 데이터',
      what: '항목 편집 후 의미 검색용 데이터가 최신 내용과 맞지 않을 수 있음을 표시해요.',
      example: '요약을 바꾼 뒤에는 검색 데이터가 다시 만들어져야 새 표현으로 잘 찾아져요.',
      recommended: '의미 기반 검색을 쓴다면 편집 후 검색 데이터 재생성을 확인하세요.',
      warning: '재생성 전에는 키워드 검색은 되더라도 의미 기반 검색 품질이 낮을 수 있어요.',
      result: '잘못된 임베딩을 계속 쓰지 않도록 stale 상태로 남겨요.'
    }
  };

  function makeSmallButton(label, kind) {
    return UI.createButton(label, { compact: true, kind: kind || '', bold: kind === 'primary' || kind === 'danger' });
  }

  function getEnabledPacks(settings, url) {
    return (settings.config.urlPacks && settings.config.urlPacks[url]) || [];
  }

  function safeAnchorId(name) {
    return 'lore-pack-' + String(name || 'pack').replace(/[^a-zA-Z0-9가-힣_-]+/g, '-');
  }

  async function setPackEnabledForUrl(settings, packName, enabled) {
    const C = UI.getCore();
    const curUrl = C && C.getCurUrl ? C.getCurUrl() : location.href;
    const map = JSON.parse(JSON.stringify(settings.config.urlPacks || {}));
    const arr = map[curUrl] || [];
    if (enabled) {
      if (!arr.includes(packName)) arr.push(packName);
    } else {
      const idx = arr.indexOf(packName);
      if (idx >= 0) arr.splice(idx, 1);
    }
    map[curUrl] = arr;
    settings.config.urlPacks = map;
    save(settings);
  }

  function isEntryEnabled(settings, url, entry) {
    const disabled = (settings.config.urlDisabledEntries && settings.config.urlDisabledEntries[url]) || [];
    return !disabled.includes(entry.id);
  }

  function setEntryEnabledForUrl(settings, url, entry, enabled) {
    const map = JSON.parse(JSON.stringify(settings.config.urlDisabledEntries || {}));
    const arr = map[url] || [];
    const idx = arr.indexOf(entry.id);
    if (enabled && idx >= 0) arr.splice(idx, 1);
    if (!enabled && idx < 0) arr.push(entry.id);
    map[url] = arr;
    settings.config.urlDisabledEntries = map;
    save(settings);
  }

  async function refreshPackCount(db, packName) {
    const count = await db.entries.where('packName').equals(packName).count();
    const pack = await db.packs.get(packName);
    if (pack) await db.packs.update(packName, { entryCount: count });
    else await db.packs.put({ name: packName, entryCount: count, project: '' });
    return count;
  }

  function normalizeImportedEntry(raw, packName, settings) {
    if (!raw || typeof raw !== 'object' || !raw.name) return null;
    const e = Object.assign({}, raw);
    delete e.id;
    delete e.enabled;
    e.name = String(e.name).trim();
    if (!e.name) return null;
    if (!Array.isArray(e.triggers)) e.triggers = [];
    e.triggers = e.triggers.map(t => String(t || '').trim()).filter(Boolean);
    if (!e.triggers.length) e.triggers = [e.name];
    e.packName = packName;
    e.project = settings.config.activeProject || '';
    e.source = e.source || 'imported';
    e.src = e.src || 'im';
    e.ts = e.ts || Date.now();
    e.lastUpdated = Date.now();
    e.searchStale = true;
    e.searchStaleAt = Date.now();
    return e;
  }

  async function importEntries(db, settings, packName, entries) {
    if (!packName) throw new Error('팩 이름이 필요해요.');
    if (!Array.isArray(entries)) throw new Error('가져올 JSON은 배열이어야 해요.');
    const R = L();
    if (R.createSnapshot) {
      const exists = await db.entries.where('packName').equals(packName).count();
      if (exists > 0) await R.createSnapshot(packName, '가져오기 전 자동 백업 ' + new Date().toLocaleString(), 'pre_import');
    }
    let created = 0, skipped = 0;
    for (const raw of entries) {
      const e = normalizeImportedEntry(raw, packName, settings);
      if (!e) { skipped++; continue; }
      const existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name).first();
      const C = UI.getCore();
      if (existing) {
        await db.entries.update(existing.id, e);
        if (C && C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(existing.id);
      }
      else { await db.entries.add(e); created++; }
    }
    await refreshPackCount(db, packName);
    await setPackEnabledForUrl(settings, packName, true);
    if (skipped > 0) console.warn('[LoreInj:UI:lore] 가져오기에서 건너뛴 항목:', skipped);
    return created;
  }

  function cleanEntryForEdit(e) {
    const c = Object.assign({}, e || {});
    delete c.id;
    delete c.packName;
    delete c.project;
    delete c.enabled;
    return c;
  }

  function stringifyList(list) {
    return Array.isArray(list) ? list.join('\n') : '';
  }

  function parseList(text) {
    return String(text || '').split(/\n+/).map(function(x){ return x.trim(); }).filter(Boolean);
  }

  function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function entryPreviewText(entry) {
    return String(
      entry.summary ||
      entry.state ||
      entry.embed_text ||
      (entry.inject && (entry.inject.full || entry.inject.compact || entry.inject.micro)) ||
      ''
    );
  }

  function invalidateEntrySearchData(db, entryId, C) {
    const tasks = [];
    if (C && typeof C.invalidateEntryEmbeddings === 'function') {
      try { tasks.push(Promise.resolve(C.invalidateEntryEmbeddings(entryId))); } catch(_) {}
    }
    if (db && db.embeddings && entryId !== undefined && entryId !== null) {
      try { tasks.push(db.embeddings.where('entryId').equals(entryId).delete()); } catch(_) {}
    }
    return Promise.all(tasks).catch(function(){});
  }

  async function editEntryFromLore(entry, db, C) {
    return new Promise(function(resolve, reject) {
      const modal = UI.createModal({
        title: '로어 항목 편집',
        size: 'wide',
        closeLabel: '닫기',
        closeOnEsc: false,
        closeOnBackdrop: false,
        onClose: function(){ resolve(null); }
      });

      const draft = JSON.parse(JSON.stringify(cleanEntryForEdit(entry)));
      const originalJsonText = JSON.stringify(draft, null, 2);
      const status = UI.createInlineStatus('', 'info');

      modal.body.appendChild(UI.createNotice('기본 필드를 먼저 수정하고, 필요한 경우 고급 JSON에서 전체 구조를 확인하세요. 저장 후 검색 데이터는 다시 생성이 필요해요.', 'info'));
      modal.body.appendChild(UI.createSummaryGrid([
        { label: '팩', value: entry.packName || '-' },
        { label: '유형', value: entry.type || '항목' },
        { label: '검색 데이터', value: '저장 시 다시 생성 필요', desc: '의미 검색 품질 보호' }
      ]));

      const nameInput = UI.createInput({ value: draft.name || '', placeholder: '항목 이름' });
      const typeSelect = UI.createSelect({
        value: draft.type || 'character',
        options: [
          { value: 'character', label: '캐릭터' },
          { value: 'rel', label: '관계' },
          { value: 'prom', label: '약속' },
          { value: 'location', label: '장소' },
          { value: 'item', label: '아이템' },
          { value: 'event', label: '사건' },
          { value: 'concept', label: '개념' },
          { value: 'setting', label: '설정' },
          { value: 'promise', label: '약속(기존)' }
        ]
      });
      const stateInput = UI.createInput({ value: draft.state || '', placeholder: '현재 상태' });
      const summaryInput = UI.createTextarea({ value: draft.summary || entryPreviewText(draft), height: '92px', placeholder: '검색과 표시용 요약' });

      modal.body.appendChild(UI.createSection('기본 정보', '이름, 유형, 현재 상태, 요약', HELP.itemEdit));
      modal.body.appendChild(UI.createFormGrid([
        UI.createField('이름', '저장 항목의 대표 이름', nameInput),
        UI.createField('유형', '캐릭터, 관계, 약속 등', typeSelect),
        UI.createField('상태', '현재 상황이나 진행 상태', stateInput)
      ]));
      modal.body.appendChild(UI.createField('요약', '검색과 검토에 쓰는 설명', summaryInput));

      const triggerInput = UI.createTextarea({
        value: stringifyList(draft.triggers || []),
        height: '96px',
        placeholder: '트리거를 줄마다 하나씩 입력'
      });
      modal.body.appendChild(UI.createSection('트리거', '대화에서 이 항목을 찾을 키워드'));
      modal.body.appendChild(UI.createField('트리거 목록', '한 줄에 하나. 관계는 A&&B 형식 사용 가능', triggerInput));

      const inject = draft.inject && typeof draft.inject === 'object' ? draft.inject : {};
      const injectFull = UI.createInput({ value: inject.full || '', placeholder: 'full' });
      const injectCompact = UI.createInput({ value: inject.compact || '', placeholder: 'compact' });
      const injectMicro = UI.createInput({ value: inject.micro || '', placeholder: 'micro' });
      modal.body.appendChild(UI.createSection('삽입 문구', '메시지에 넣을 압축 문구'));
      modal.body.appendChild(UI.createFormGrid([
        UI.createField('전체', '가장 자세한 압축 문구', injectFull),
        UI.createField('간결', '짧은 문구', injectCompact),
        UI.createField('초압축', '가장 짧은 문구', injectMicro)
      ]));

      const partiesInput = UI.createTextarea({
        value: stringifyList(draft.parties || []),
        height: '72px',
        placeholder: '관계 인물을 줄마다 입력'
      });
      const callInput = UI.createTextarea({
        value: draft.call ? JSON.stringify(draft.call, null, 2) : '',
        height: '96px',
        monospace: true,
        placeholder: '{"A→B":"호칭"}'
      });
      const condInput = UI.createInput({ value: draft.cond || (draft.detail && draft.detail.condition) || '', placeholder: '약속 조건' });
      modal.body.appendChild(UI.createDetailsSection('관계·약속 필드', '관계/약속 항목일 때만 필요', false, function(body) {
        body.appendChild(UI.createFormGrid([
          UI.createField('관계 인물', '줄마다 한 명씩', partiesInput),
          UI.createField('약속 조건', '약속이 발동되거나 유지되는 조건', condInput)
        ]));
        body.appendChild(UI.createField('호칭 매트릭스 JSON', '예: {"에리→사용자":"오빠"}', callInput));
      }));

      const eventsInput = UI.createTextarea({
        value: Array.isArray(draft.eventHistory) ? JSON.stringify(draft.eventHistory, null, 2) : '',
        height: '130px',
        monospace: true,
        placeholder: '[{"turn":1,"summary":"중요 사건","imp":8,"emo":8}]'
      });
      modal.body.appendChild(UI.createDetailsSection('사건 기록', '중요한 변화만 JSON 배열로 관리', false, function(body) {
        body.appendChild(UI.createField('eventHistory', '배열 JSON. 비워 두면 기존 사건 기록 없음', eventsInput));
      }));

      const jsonEditor = UI.createJsonEditor({
        value: originalJsonText,
        height: '260px'
      });
      modal.body.appendChild(UI.createDetailsSection('고급 JSON', '전체 구조 확인과 직접 편집', false, function(body) {
        body.appendChild(UI.createNotice('고급 JSON을 직접 수정하면 기본 필드보다 우선 적용돼요. id, packName, project는 저장 때 원본 값으로 보존돼요.', 'warn'));
        body.appendChild(jsonEditor);
      }));

      function buildFromFields() {
        const next = Object.assign({}, draft);
        next.name = nameInput.value.trim();
        next.type = typeSelect.value || 'character';
        next.state = stateInput.value.trim();
        next.summary = summaryInput.value.trim();
        next.triggers = parseList(triggerInput.value);
        next.inject = {
          full: injectFull.value.trim(),
          compact: injectCompact.value.trim(),
          micro: injectMicro.value.trim()
        };
        if (!next.inject.full && !next.inject.compact && !next.inject.micro) delete next.inject;

        const parties = parseList(partiesInput.value);
        if (parties.length) next.parties = parties;
        else delete next.parties;

        const callText = callInput.value.trim();
        if (callText) next.call = safeJson(callText, next.call || {});
        else delete next.call;

        const cond = condInput.value.trim();
        if (cond) next.cond = cond;
        else delete next.cond;

        const eventsText = eventsInput.value.trim();
        if (eventsText) next.eventHistory = safeJson(eventsText, next.eventHistory || []);
        else delete next.eventHistory;

        return next;
      }

      function validate(next) {
        if (!next.name) return 'name 값이 필요해요.';
        if (!Array.isArray(next.triggers) || !next.triggers.length) return '트리거를 하나 이상 입력하세요.';
        if (next.eventHistory && !Array.isArray(next.eventHistory)) return 'eventHistory는 배열 JSON이어야 해요.';
        if (next.call && (typeof next.call !== 'object' || Array.isArray(next.call))) return '호칭 매트릭스는 객체 JSON이어야 해요.';
        return '';
      }

      const cancel = UI.createButton('취소');
      const saveBtn = UI.createButton('저장', { kind: 'primary', bold: true });
      cancel.onclick = function(){ modal.close(); resolve(null); };
      saveBtn.onclick = async function() {
        try {
          let parsed = null;
          const jsonText = jsonEditor && jsonEditor.textarea ? jsonEditor.textarea.value.trim() : '';
          const jsonChanged = jsonText && jsonText !== originalJsonText.trim();
          if (jsonChanged) {
            parsed = jsonEditor.getValue ? jsonEditor.getValue() : JSON.parse(jsonText);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              status.setStatus('고급 JSON은 객체여야 해요.', 'error');
              return;
            }
          }
          const next = parsed ? Object.assign(buildFromFields(), parsed) : buildFromFields();
          const validation = validate(next);
          if (validation) {
            status.setStatus(validation, 'error');
            return;
          }

          saveBtn.disabled = true;
          status.setStatus('저장 중...', 'info');

          if (C && C.saveEntryVersion) {
            try { await C.saveEntryVersion(entry, 'manual_edit'); } catch(_){}
          }

          const updated = Object.assign({}, entry, next, {
            id: entry.id,
            packName: entry.packName,
            project: entry.project || '',
            enabled: entry.enabled !== false,
            lastUpdated: Date.now(),
            searchStale: true
          });

          await db.entries.put(updated);
          await invalidateEntrySearchData(db, entry.id, C);
          status.setStatus('저장 완료. 검색 데이터는 다시 생성이 필요해요.', 'success');
          modal.close();
          resolve(updated);
        } catch(e) {
          saveBtn.disabled = false;
          status.setStatus('저장 실패: ' + String(e.message || e), 'error');
        }
      };

      modal.actions.appendChild(status);
      modal.actions.appendChild(cancel);
      modal.actions.appendChild(saveBtn);
      modal.open();
    });
  }

  function renderPackManager(panel, db, settings, C, packs, url, enabled) {
    UI.addBox(panel, function(nd) {
      nd.appendChild(UI.createSection(
        '팩 선택',
        '현재 대화에서 사용할 로어 팩을 켜고 끔',
        HELP.packSelect
      ));

      if (!packs.length) {
        nd.appendChild(UI.createNotice('등록된 팩 없음. 아래 JSON 가져오기로 새 팩 추가 가능', 'warn'));
        return;
      }

      const list = document.createElement('div');
      list.className = 'lore-scroll-list';
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
      packs.sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach(function(pack) {
        const isOn = enabled.includes(pack.name);
        const status = document.createElement('span');
        status.textContent = isOn ? '사용 중' : '꺼짐';
        status.style.cssText = 'font-size:11px;color:' + (isOn ? 'var(--lore-accent)' : 'var(--lore-sub)') + ';';

        const toggle = UI.createSwitch(isOn, async function(next) {
          await setPackEnabledForUrl(settings, pack.name, next);
          status.textContent = next ? '사용 중' : '꺼짐';
          status.style.color = next ? 'var(--lore-accent)' : 'var(--lore-sub)';
        }, pack.name + ' 사용');

        const primary = document.createElement('div');
        primary.className = 'lore-actions';
        primary.appendChild(toggle);
        primary.appendChild(status);

        const jump = makeSmallButton('항목 보기', 'primary');
        jump.onclick = function() {
          const target = document.getElementById(safeAnchorId(pack.name));
          if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        jump.disabled = !isOn;

        const exportBtn = makeSmallButton('내보내기');
        exportBtn.onclick = async function() {
          const entries = await db.entries.where('packName').equals(pack.name).toArray();
          const clean = entries.map(function(e) {
            const c = Object.assign({}, e);
            delete c.id; delete c.packName; delete c.project; delete c.enabled;
            return c;
          });
          const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = pack.name + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        };

        const del = makeSmallButton('삭제', 'danger');
        del.onclick = async function() {
          const ok = await UI.createConfirmDialog({
            title: '팩 삭제',
            message: '팩을 삭제할까요: ' + pack.name + '?\n항목과 검색 데이터도 함께 삭제돼요.',
            danger: true,
            confirmLabel: '삭제',
            cancelLabel: '취소'
          });
          if (!ok) return;
          const entries = await db.entries.where('packName').equals(pack.name).toArray();
          const R = L();
          if (R.createSnapshot && entries.length) await R.createSnapshot(pack.name, '삭제 전 자동 백업 ' + new Date().toLocaleString(), 'pre_delete');
          for (const e of entries) {
            try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(_){}
          }
          await db.entries.where('packName').equals(pack.name).delete();
          await db.packs.delete(pack.name);
          if (R.cleanupDeletedPackReferences) R.cleanupDeletedPackReferences(pack.name, entries.map(e => e.id));
          await UI.createAlertDialog({ title: '삭제 완료', message: '팩을 삭제했어요.', tone: 'success' });
          location.reload();
        };

        list.appendChild(UI.createEntryRow({
          title: pack.name + ' (' + (pack.entryCount || 0) + ')',
          desc: isOn ? '현재 대화에서 사용 중' : '현재 대화에서는 사용하지 않음',
          actions: UI.createActionGroup([primary], [jump, exportBtn], [del])
        }));
      });
      nd.appendChild(list);
    });
  }

  function renderImportTools(panel, db, settings) {
    UI.addBox(panel, function(nd) {
      nd.appendChild(UI.createSection(
        'JSON 가져오기',
        'JSON 파일이나 붙여넣은 JSON으로 로어 팩 가져오기',
        HELP.importJson
      ));

      const nameInput = UI.createInput({ placeholder: '팩 이름' });
      nameInput.style.marginBottom = '8px';
      nd.appendChild(nameInput);

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.json,application/json';
      fileInput.style.display = 'none';

      const fileBtn = UI.createButton('JSON 파일 가져오기', { kind: 'primary' });
      fileBtn.onclick = function(){ fileInput.click(); };
      fileInput.onchange = async function(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const packName = nameInput.value.trim() || file.name.replace(/\.json$/i, '');
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const created = await importEntries(db, settings, packName, arr);
          await UI.createAlertDialog({ title: '가져오기 완료', message: '가져온 항목: ' + arr.length + '개 / 새 항목: ' + created + '개', tone: 'success' });
          location.reload();
        } catch(e) {
          await UI.createAlertDialog({ title: '가져오기 실패', message: e.message, tone: 'error' });
        } finally {
          fileInput.value = '';
        }
      };

      const ta = UI.createTextarea({
        placeholder: '[{\"name\":\"에리\",\"triggers\":[\"슈크림 붕어빵\"],\"type\":\"character\",\"summary\":\"에리는 슈크림 붕어빵을 좋아함\"}]',
        height: '130px',
        monospace: true
      });
      ta.style.margin = '8px 0';

      const pasteBtn = UI.createButton('붙여넣은 JSON 가져오기', { kind: 'success' });
      pasteBtn.onclick = async function() {
        const packName = nameInput.value.trim() || '수동 가져오기';
        if (!ta.value.trim()) {
          await UI.createAlertDialog({ title: 'JSON 필요', message: 'JSON을 먼저 붙여넣으세요.', tone: 'warn' });
          return;
        }
        try {
          const parsed = JSON.parse(ta.value);
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const created = await importEntries(db, settings, packName, arr);
          await UI.createAlertDialog({ title: '가져오기 완료', message: '가져온 항목: ' + arr.length + '개 / 새 항목: ' + created + '개', tone: 'success' });
          location.reload();
        } catch(e) {
          await UI.createAlertDialog({ title: '가져오기 실패', message: e.message, tone: 'error' });
        }
      };

      nd.appendChild(fileInput);
      nd.appendChild(UI.createActionGroup([fileBtn], [pasteBtn], []));
      nd.appendChild(ta);
    });
  }

  function renderActiveLore(panel, db, settings, C, url, activePacks, allEntries) {
    const entries = allEntries.filter(e => activePacks.includes(e.packName));
    const grouped = {};
    entries.forEach(e => { (grouped[e.packName] = grouped[e.packName] || []).push(e); });

    UI.addBox(panel, function(nd) {
      nd.appendChild(UI.createSection(
        '활성 로어',
        '현재 대화에서 켜진 팩의 항목 확인과 개별 사용 설정',
        HELP.activeLore
      ));
      if (!activePacks.length) {
        nd.appendChild(UI.createNotice('현재 대화에 켜진 팩 없음. 위에서 사용할 팩을 먼저 켜세요', 'warn'));
        return;
      }
      if (!entries.length) {
        nd.appendChild(UI.createNotice('켜진 팩 안에 로어 항목 없음', 'warn'));
        return;
      }
      nd.appendChild(UI.createNotice('활성 팩: ' + activePacks.join(', '), 'info'));

      const nav = document.createElement('div');
      nav.className = 'lore-toolbar';
      nav.style.cssText = 'margin-top:10px;';
      activePacks.filter(name => grouped[name]).forEach(function(packName) {
        const chip = UI.createButton(packName, { compact: true });
        chip.onclick = function() {
          const target = document.getElementById(safeAnchorId(packName));
          if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        nav.appendChild(chip);
      });
      if (nav.childNodes.length) nd.appendChild(nav);
    });

    Object.keys(grouped).forEach(function(packName) {
      UI.addBox(panel, function(nd) {
        nd.id = safeAnchorId(packName);
        const items = grouped[packName];
        nd.appendChild(UI.createSection(packName + ' (' + items.length + ')'));
        const list = document.createElement('div');
        list.className = 'lore-scroll-list';
        list.style.cssText = 'display:flex;flex-direction:column;gap:6px;max-height:420px;overflow:auto;';
        items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).forEach(function(entry) {
          const right = document.createElement('div');
          right.className = 'lore-actions';
          const on = isEntryEnabled(settings, url, entry);
          const toggle = UI.createSwitch(on, function(next) {
            setEntryEnabledForUrl(settings, url, entry, next);
          }, entry.name + ' 사용');

          const edit = makeSmallButton('편집', 'primary');
          edit.onclick = async function() {
            try {
              const updated = await editEntryFromLore(entry, db, C);
              if (!updated) return;
              await UI.createAlertDialog({ title: '저장 완료', message: '항목을 저장했어요.', tone: 'success' });
              location.reload();
            } catch(e) {
              await UI.createAlertDialog({ title: '저장 실패', message: e.message, tone: 'error' });
            }
          };

          const anchor = makeSmallButton(entry.anchor ? '앵커 해제' : '앵커');
          anchor.onclick = async function() {
            try {
              if (C && C.saveEntryVersion) {
                try { await C.saveEntryVersion(entry, 'anchor_toggle'); } catch(_){}
              }
              entry.anchor = !entry.anchor;
              entry.lastUpdated = Date.now();
              await db.entries.put(entry);
              await UI.createAlertDialog({ title: '앵커 변경 완료', message: entry.anchor ? '앵커를 켰어요.' : '앵커를 껐어요.', tone: 'success' });
              location.reload();
            } catch(e) {
              await UI.createAlertDialog({ title: '앵커 변경 실패', message: e.message, tone: 'error' });
            }
          };

          const copy = makeSmallButton('복사');
          copy.onclick = async function() {
            const clean = cleanEntryForEdit(entry);
            try {
              await navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
              await UI.createAlertDialog({ title: '복사 완료', message: '항목 JSON을 복사했어요.', tone: 'success' });
            } catch(e) {
              await UI.createAlertDialog({ title: '복사 실패', message: String(e.message || e), tone: 'error' });
            }
          };

          right.appendChild(toggle);
          right.appendChild(edit);
          right.appendChild(anchor);
          right.appendChild(copy);
          list.appendChild(UI.createEntryRow({
            title: '[' + (entry.type || '항목') + '] ' + entry.name,
            desc: String(entry.summary || entry.inject?.compact || entry.inject?.full || '').slice(0, 180),
            actions: right
          }));
        });
        nd.appendChild(list);
      });
    });
  }

  UI.registerPanel({
    id: 'loreManager',
    label: '로어 관리',
    title: '로어 관리',
    order: 40,
    render: async function(panel) {
      const R = L();
      const db = R.db;
      const settings = R.settings;
      const C = R.C;
      if (!db || !settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('데이터베이스나 설정을 아직 불러오지 못했음', 'error')); });
        return;
      }

      const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const packs = await db.packs.toArray();
      const enabled = getEnabledPacks(settings, url);
      const allEntries = await db.entries.toArray();

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '로어 관리',
          '팩 선택, 항목 확인, JSON 가져오기를 한 화면에서 처리',
          HELP.overview
        ));
        nd.appendChild(UI.createSummaryGrid([
          { label: '등록 팩', value: String(packs.length) },
          { label: '현재 사용 팩', value: String(enabled.length) },
          { label: '전체 항목', value: String(allEntries.length) }
        ]));
      });

      renderPackManager(panel, db, settings, C, packs, url, enabled);
      renderImportTools(panel, db, settings);
      renderActiveLore(panel, db, settings, C, url, enabled, allEntries);
    }
  });

  UI.__lorePanelLoaded = true;
  console.log('[LoreInj:UI] lore manager panel loaded');
})();