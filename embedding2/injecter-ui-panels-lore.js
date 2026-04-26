// == 인젝터 UI 패널 — Lore + Files ==
// 역할: 기본 로어 목록, 팩 활성화, JSON 가져오기/내보내기
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

  async function importEntries(db, settings, packName, entries) {
    let created = 0;
    for (const raw of entries) {
      if (!raw || !raw.name) continue;
      const e = Object.assign({}, raw);
      if (!Array.isArray(e.triggers) || !e.triggers.length) e.triggers = [e.name];
      e.packName = packName;
      e.project = settings.config.activeProject || '';
      const existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name).first();
      if (existing) await db.entries.update(existing.id, e);
      else { await db.entries.add(e); created++; }
    }
    await refreshPackCount(db, packName);
    await setPackEnabledForUrl(settings, packName, true);
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

  async function editEntryFromLore(entry, db, C) {
    const original = JSON.stringify(cleanEntryForEdit(entry), null, 2);
    const text = prompt('항목 JSON 편집', original);
    if (text === null) return null;
    const parsed = JSON.parse(text);
    if (!parsed.name) throw new Error('name 값이 필요함');
    if (C && C.saveEntryVersion) {
      try { await C.saveEntryVersion(entry, 'manual_edit'); } catch(_){}
    }
    const updated = Object.assign({}, entry, parsed, {
      id: entry.id,
      packName: entry.packName,
      project: entry.project || '',
      enabled: entry.enabled !== false,
      lastUpdated: Date.now()
    });
    await db.entries.put(updated);
    return updated;
  }

  UI.registerPanel({
    id: 'lore',
    label: '로어',
    title: '로어',
    order: 50,
    render: async function(panel) {
      const R = L();
      const C = R.C;
      const db = R.db;
      const settings = R.settings;
      if (!db || !settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('데이터베이스나 설정을 아직 불러오지 못했음', 'error')); });
        return;
      }

      const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const activePacks = getEnabledPacks(settings, url);
      const allEntries = await db.entries.toArray();
      const entries = allEntries.filter(e => activePacks.includes(e.packName));
      const grouped = {};
      entries.forEach(e => { (grouped[e.packName] = grouped[e.packName] || []).push(e); });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('활성 로어', '현재 페이지에서 켜진 팩의 로어 항목'));
        if (!activePacks.length) {
          nd.appendChild(UI.createNotice('현재 페이지에 켜진 팩 없음. 파일 메뉴에서 사용할 팩 선택 필요', 'warn'));
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
                alert('저장함');
                location.reload();
              } catch(e) {
                alert('저장 실패: ' + e.message);
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
                alert(entry.anchor ? '앵커를 켬' : '앵커를 끔');
                location.reload();
              } catch(e) {
                alert('앵커 변경 실패: ' + e.message);
              }
            };
            const copy = makeSmallButton('복사');
            copy.onclick = function() {
              const clean = cleanEntryForEdit(entry);
              navigator.clipboard.writeText(JSON.stringify(clean, null, 2)).then(function(){ alert('복사함'); }).catch(function(){ alert('복사 실패'); });
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
  });

  UI.registerPanel({
    id: 'files',
    label: '파일',
    title: '파일',
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

      const packs = await db.packs.toArray();
      const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
      const enabled = getEnabledPacks(settings, url);

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('팩', '현재 대화에서 사용할 팩 선택. JSON 가져오기는 아래에 배치', '여기에서 켠 팩만 로어 탭과 실제 주입 후보에 들어감.\n처음 사용할 때는 먼저 팩을 켜고, 필요한 경우 아래 JSON 가져오기로 새 팩을 추가.'));
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
            if (!confirm('팩을 삭제할까요: ' + pack.name + '?')) return;
            const entries = await db.entries.where('packName').equals(pack.name).toArray();
            for (const e of entries) {
              try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(_){}
            }
            await db.entries.where('packName').equals(pack.name).delete();
            await db.packs.delete(pack.name);
            alert('삭제함');
            location.reload();
          };

          list.appendChild(UI.createEntryRow({
            title: pack.name + ' (' + (pack.entryCount || 0) + ')',
            desc: isOn ? '현재 대화에서 사용 중' : '현재 대화에서는 사용하지 않음',
            actions: UI.createActionGroup([primary], [exportBtn], [del])
          }));
        });
        nd.appendChild(list);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('JSON 가져오기', 'JSON 파일이나 붙여넣은 JSON으로 로어 팩 가져오기'));

        const nameInput = document.createElement('input');
        nameInput.placeholder = '팩 이름';
        nameInput.style.cssText = 'width:100%;padding:6px 8px;box-sizing:border-box;margin-bottom:8px;';
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
            alert('가져온 항목: ' + arr.length + '개 / 새 항목: ' + created + '개');
            location.reload();
          } catch(e) {
            alert('가져오기 실패: ' + e.message);
          } finally {
            fileInput.value = '';
          }
        };

        const ta = document.createElement('textarea');
        ta.placeholder = '[{\"name\":\"에리\",\"triggers\":[\"슈크림 붕어빵\"],\"type\":\"character\",\"summary\":\"에리는 슈크림 붕어빵을 좋아함\"}]';
        ta.style.cssText = 'width:100%;height:110px;padding:8px;box-sizing:border-box;font-family:monospace;resize:vertical;margin:8px 0;';
        const pasteBtn = UI.createButton('붙여넣은 JSON 가져오기', { kind: 'success' });
        pasteBtn.onclick = async function() {
          const packName = nameInput.value.trim() || '수동 가져오기';
          if (!ta.value.trim()) { alert('JSON을 먼저 붙여넣으세요.'); return; }
          try {
            const parsed = JSON.parse(ta.value);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const created = await importEntries(db, settings, packName, arr);
            alert('가져온 항목: ' + arr.length + '개 / 새 항목: ' + created + '개');
            location.reload();
          } catch(e) {
            alert('가져오기 실패: ' + e.message);
          }
        };

        nd.appendChild(fileInput);
        nd.appendChild(UI.createActionGroup([fileBtn], [pasteBtn], []));
        nd.appendChild(ta);
      });
    }
  });

  UI.__lorePanelLoaded = true;
  console.log('[LoreInj:UI] lore and files panels loaded');
})();