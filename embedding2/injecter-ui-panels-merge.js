// == 인젝터 UI 패널 — Duplicate Merge ==
// 역할: 중복 로어 후보 탐색, 미리보기, 병합, 런타임 undo
// 의존: injecter-ui-utils.js, core-kernel.js, core-embedding.js, injecter-2/3.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:merge] UI utils not loaded');
    return;
  }
  if (UI.__mergePanelLoaded) return;

  function R() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }
  function cssInput(extra) {
    return 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;' + (extra || '');
  }
  function btn(label, kind) {
    return UI.createButton(label, { compact: true, kind: kind || '', bold: kind === 'primary' || kind === 'danger' || kind === 'success' });
  }

  const HELP = {
    duplicateMerge: {
      title: '중복 병합',
      what: '검색 데이터가 비슷한 활성 로어 항목을 찾아 하나로 합쳐요.',
      example: '같은 관계 변화가 여러 번 저장된 경우 긴 항목 기준 병합이나 LLM 요약 병합으로 정리해요.',
      recommended: '스냅샷을 만든 뒤 후보를 미리보기로 확인하고 병합하세요.',
      warning: '활성 팩과 검색 데이터가 있어야 후보를 찾을 수 있어요. 병합은 저장 데이터를 바꿔요.',
      result: '중복 항목이 줄고 검색 후보가 더 깔끔해져요.'
    },
    similarity: {
      title: '유사도 기준',
      what: '두 항목을 중복 후보로 볼 최소 의미 유사도예요.',
      example: '0.88은 꽤 비슷한 항목만 묶고, 0.75는 더 넓게 후보를 찾아요.',
      recommended: '0.86~0.90부터 시작하세요.',
      warning: '너무 낮으면 다른 항목까지 묶일 수 있어요.',
      result: '후보 그룹 수와 정확도가 달라져요.'
    },
    maxChars: {
      title: '요약 최대 글자 수',
      what: 'LLM 요약 병합 결과의 요약 길이 상한이에요.',
      example: '1200이면 긴 배경도 보존하고, 400이면 핵심만 남기게 돼요.',
      recommended: '800~1200을 권장해요.',
      warning: '너무 짧으면 중요한 디테일이 빠질 수 있어요.',
      result: '병합 결과의 길이와 정보량이 달라져요.'
    }
  };

  function getActiveEntries(db, settings, C) {
    const url = C && C.getCurUrl ? C.getCurUrl() : location.href;
    const activePacks = (settings.config.urlPacks && settings.config.urlPacks[url]) || [];
    const disabled = (settings.config.urlDisabledEntries && settings.config.urlDisabledEntries[url]) || [];
    return db.entries.toArray().then(function(all) {
      return all.filter(function(e) {
        return activePacks.includes(e.packName) && !disabled.includes(e.id);
      });
    });
  }
  function cosine(a, b, C) {
    if (C && typeof C.cosineSimilarity === 'function') return C.cosineSimilarity(a, b);
    if (C && typeof C.cosineSim === 'function') return C.cosineSim(a, b);
    let d = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      d += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    return d / ((Math.sqrt(na) * Math.sqrt(nb)) || 1);
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
      model: embedding ? (cfg.embeddingModel || 'gemini-embedding-001') : (cfg.autoExtModel === '_custom' ? cfg.autoExtCustomModel : cfg.autoExtModel),
      maxRetries: 2,
      responseMimeType: embedding ? undefined : 'application/json'
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
  function cleanForPrompt(e) {
    const c = Object.assign({}, e);
    delete c.id;
    delete c.packName;
    delete c.project;
    delete c.enabled;
    return c;
  }
  function stripRuntimeFields(e) {
    const c = Object.assign({}, e);
    delete c.enabled;
    return c;
  }
  function buildKeepLongest(entries) {
    const sorted = entries.slice().sort(function(a, b) {
      return String(b.summary || b.inject?.full || '').length - String(a.summary || a.inject?.full || '').length;
    });
    const anchored = sorted.find(e => e.anchor);
    const base = JSON.parse(JSON.stringify(anchored || sorted[0]));
    const trig = new Set(base.triggers || []);
    sorted.forEach(function(e) {
      (e.triggers || []).forEach(t => trig.add(t));
      if (e.detail && typeof e.detail === 'object') base.detail = Object.assign({}, e.detail, base.detail || {});
      if (e.call && typeof e.call === 'object') base.call = Object.assign({}, e.call, base.call || {});
      if (Array.isArray(e.eventHistory) && e.eventHistory.length) {
        const existing = new Set((base.eventHistory || []).map(ev => ev && ev.summary));
        base.eventHistory = base.eventHistory || [];
        e.eventHistory.forEach(function(ev) {
          if (ev && ev.summary && !existing.has(ev.summary)) {
            base.eventHistory.push(ev);
            existing.add(ev.summary);
          }
        });
      }
    });
    base.triggers = Array.from(trig).slice(0, 16);
    return base;
  }
  async function buildLlmMerge(entries, settings, C, maxChars) {
    const prompt = [
      'Merge these duplicate chat lore entries into one JSON object.',
      '',
      'Rules:',
      '1. Preserve all important facts.',
      '2. Remove repeated wording.',
      '3. Keep summary within ' + maxChars + ' characters when possible.',
      '4. Merge triggers and remove duplicates.',
      '5. Preserve relationship call, state, eventHistory, inject, and detail fields when useful.',
      '6. Output only one raw JSON object. No markdown. No code fence.',
      '',
      'Entries:',
      JSON.stringify(entries.map(cleanForPrompt), null, 2)
    ].join('\n');

    const res = await C.callGeminiApi(prompt, apiOpts(settings, false));
    if (!res || !res.text) throw new Error('No LLM response: ' + ((res && res.error) || 'unknown'));
    let text = String(res.text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (m) text = m[0];
    const parsed = JSON.parse(text);
    const base = JSON.parse(JSON.stringify(entries.find(e => e.anchor) || entries[0]));
    return Object.assign(base, parsed);
  }

  const state = {
    threshold: 0.88,
    maxChars: 1200,
    groups: null,
    message: ''
  };

  async function scanGroups(db, settings, C) {
    const entries = await getActiveEntries(db, settings, C);
    if (entries.length < 2) return { entries, groups: [], reason: '활성 항목 2개 이상 필요' };

    const ids = entries.map(e => e.id);
    let embRows = [];
    try {
      embRows = await db.embeddings.where('entryId').anyOf(ids).toArray();
    } catch(_) {
      embRows = [];
      for (const id of ids) {
        const rows = await db.embeddings.where('entryId').equals(id).toArray();
        embRows.push.apply(embRows, rows);
      }
    }

    const embMap = {};
    embRows.forEach(function(row) {
      if (!row || !row.vector) return;
      if (row.field === 'summary' || !embMap[row.entryId]) embMap[row.entryId] = row.vector;
    });

    const withEmb = entries.filter(e => embMap[e.id]);
    if (withEmb.length < 2) return { entries, groups: [], reason: '검색 데이터가 있는 항목 2개 이상 필요' };

    const parent = {};
    withEmb.forEach(e => { parent[e.id] = e.id; });
    function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
    function union(a, b) { parent[find(a)] = find(b); }

    const pairs = [];
    for (let i = 0; i < withEmb.length; i++) {
      for (let j = i + 1; j < withEmb.length; j++) {
        const sim = cosine(embMap[withEmb[i].id], embMap[withEmb[j].id], C);
        if (sim >= state.threshold) {
          pairs.push({ a: withEmb[i].id, b: withEmb[j].id, sim });
          union(withEmb[i].id, withEmb[j].id);
        }
      }
    }

    const map = {};
    withEmb.forEach(function(e) {
      const root = find(e.id);
      (map[root] = map[root] || []).push(e);
    });

    const groups = Object.values(map).filter(g => g.length >= 2).map(function(entries) {
      const idSet = new Set(entries.map(e => e.id));
      const maxSim = pairs.filter(p => idSet.has(p.a) && idSet.has(p.b)).reduce((m, p) => Math.max(m, p.sim), 0);
      return { entries, sim: maxSim, draft: null };
    }).sort(function(a, b) { return b.sim - a.sim; });

    return { entries, groups, reason: '' };
  }

  async function executeMerge(group, draft, db, settings, C) {
    const originals = group.entries.map(e => JSON.parse(JSON.stringify(e)));
    const target = group.entries.find(e => e.anchor) || group.entries[0];
    if (db.snapshots) {
      const packs = Array.from(new Set(group.entries.map(e => e.packName)));
      for (const packName of packs) {
        const entries = await db.entries.where('packName').equals(packName).toArray();
        const clean = entries.map(function(e) {
          const c = Object.assign({}, e);
          delete c.id;
          return c;
        });
        await db.snapshots.add({
          packName,
          timestamp: Date.now(),
          label: '병합 전 자동 백업 ' + new Date().toLocaleString(),
          type: 'pre_merge',
          entryCount: clean.length,
          data: clean
        });
      }
    }
    const toDelete = group.entries.filter(e => e.id !== target.id);
    const finalEntry = Object.assign({}, draft, {
      id: target.id,
      packName: target.packName,
      project: target.project || '',
      enabled: target.enabled !== false,
      lastUpdated: Date.now(),
      searchStale: true,
      searchStaleAt: Date.now()
    });

    for (const e of group.entries) {
      try { if (C && C.saveEntryVersion) await C.saveEntryVersion(e, 'pre_merge'); } catch(_){}
    }

    await db.entries.put(finalEntry);

    for (const e of toDelete) {
      await db.entries.delete(e.id);
      try { await db.embeddings.where('entryId').equals(e.id).delete(); } catch(_){}
    }

    try { await db.embeddings.where('entryId').equals(target.id).delete(); } catch(_){}

    const packs = new Set(group.entries.map(e => e.packName));
    for (const packName of packs) {
      try {
        const count = await db.entries.where('packName').equals(packName).count();
        await db.packs.update(packName, { entryCount: count });
      } catch(_){}
    }

    if (C) C.__lastMergeUndo = { mergedId: target.id, originals };

    let embedMsg = '검색 데이터는 다시 생성하지 않았어요.';
    if (C && C.ensureEmbedding && hasApi(settings, true)) {
      try {
        await C.ensureEmbedding(finalEntry, apiOpts(settings, true));
        embedMsg = '검색 데이터를 다시 생성함';
      } catch(e) {
        embedMsg = '검색 데이터 재생성 실패: ' + e.message;
      }
    }

    return { finalEntry, embedMsg };
  }

  async function undoLastMerge(db, C) {
    const undo = C && C.__lastMergeUndo;
    if (!undo || !undo.originals || !undo.originals.length) throw new Error('현재 실행 세션에 되돌릴 병합 기록 없음');

    if (undo.mergedId !== undefined && undo.mergedId !== null) {
      await db.entries.delete(undo.mergedId);
      try { await db.embeddings.where('entryId').equals(undo.mergedId).delete(); } catch(_){}
    }

    for (const snap of undo.originals) {
      await db.entries.put(snap);
    }

    const packs = new Set(undo.originals.map(e => e.packName));
    for (const packName of packs) {
      try {
        const count = await db.entries.where('packName').equals(packName).count();
        await db.packs.update(packName, { entryCount: count });
      } catch(_){}
    }

    C.__lastMergeUndo = null;
  }

  function renderGroup(panel, group, index, db, settings, C, rerender) {
    UI.addBox(panel, function(nd) {
      const types = Array.from(new Set(group.entries.map(e => e.type || '항목')));
      nd.appendChild(UI.createSection('그룹 ' + (index + 1) + ' / 항목 ' + group.entries.length + '개 / ' + (group.sim * 100).toFixed(1) + '%'));

      if (types.length > 1) {
        nd.appendChild(UI.createNotice('유형이 서로 다름: ' + types.join(', ') + '. 병합 전 확인 필요', 'warn'));
      }

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px;';
      group.entries.forEach(function(e) {
        const row = document.createElement('div');
        row.style.cssText = 'border:1px solid #333;border-radius:6px;background:#111;padding:8px;font-size:11px;color:#aaa;line-height:1.5;word-break:break-all;';
        row.textContent = '[' + (e.type || '항목') + '] ' + e.name + ' / ' + e.packName + (e.anchor ? ' / 앵커' : '') + '\n' + String(e.summary || e.inject?.full || '').slice(0, 220);
        list.appendChild(row);
      });
      nd.appendChild(list);

      const mode = document.createElement('select');
      mode.style.cssText = cssInput('margin-bottom:8px;');
      [
        ['keep-longest', '긴 항목 기준 + 필드 병합'],
        ['llm-summarize', 'LLM 요약 병합']
      ].forEach(function(item) {
        const opt = document.createElement('option');
        opt.value = item[0];
        opt.textContent = item[1];
        mode.appendChild(opt);
      });
      nd.appendChild(mode);

      const preview = document.createElement('div');
      preview.style.cssText = 'display:none;margin-top:8px;padding:8px;background:#0a0a0a;border:1px solid #333;border-radius:6px;font-size:11px;color:#ccc;white-space:pre-wrap;word-break:break-all;max-height:320px;overflow:auto;';

      async function buildPreview() {
        preview.style.display = 'block';
        preview.textContent = '미리보기 생성 중';
        if (mode.value === 'llm-summarize') {
          if (!C || !C.callGeminiApi) throw new Error('LLM API 도구를 불러오지 못함');
          if (!hasApi(settings, false)) throw new Error('LLM API 설정 없음');
          group.draft = await buildLlmMerge(group.entries, settings, C, state.maxChars);
        } else {
          group.draft = buildKeepLongest(group.entries);
        }
        const summaryLen = String(group.draft.summary || '').length;
        preview.textContent = '요약 길이: ' + summaryLen + ' / ' + state.maxChars + '\n\n' + JSON.stringify(stripRuntimeFields(group.draft), null, 2);
      }

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

      const previewBtn = btn('미리보기', 'primary');
      previewBtn.onclick = async function() {
        previewBtn.disabled = true;
        try { await buildPreview(); }
        catch(e) { preview.style.display = 'block'; preview.textContent = '미리보기 실패: ' + e.message; }
        finally { previewBtn.disabled = false; }
      };

      const mergeBtn = btn('병합', 'success');
      mergeBtn.onclick = async function() {
        try {
          if (!group.draft) await buildPreview();
          if (!group.draft) return;

          const summaryLen = String(group.draft.summary || '').length;
          if (summaryLen > state.maxChars) {
            const okLen = await UI.createConfirmDialog({
              title: '요약 길이 초과',
              message: '요약이 최대 길이를 넘었어요. 계속할까요?',
              danger: true,
              confirmLabel: '계속',
              cancelLabel: '취소'
            });
            if (!okLen) return;
          }
          if (types.length > 1) {
            const okType = await UI.createConfirmDialog({
              title: '유형 불일치',
              message: '유형이 서로 달라요. 그래도 병합할까요?',
              danger: true,
              confirmLabel: '병합',
              cancelLabel: '취소'
            });
            if (!okType) return;
          }
          const okMerge = await UI.createConfirmDialog({
            title: '중복 항목 병합',
            message: group.entries.length + '개 항목을 하나로 병합할까요?',
            danger: true,
            confirmLabel: '병합',
            cancelLabel: '취소'
          });
          if (!okMerge) return;

          mergeBtn.disabled = true;
          const result = await executeMerge(group, group.draft, db, settings, C);
          await UI.createAlertDialog({ title: '병합 완료', message: result.embedMsg, tone: 'success' });
          state.groups = state.groups.filter(g => g !== group);
          rerender();
        } catch(e) {
          await UI.createAlertDialog({ title: '병합 실패', message: e.message, tone: 'error' });
        } finally {
          mergeBtn.disabled = false;
        }
      };

      if (UI.createActionGroup) {
        nd.appendChild(UI.createActionGroup([mergeBtn], [previewBtn], []));
      } else {
        row.appendChild(previewBtn);
        row.appendChild(mergeBtn);
        nd.appendChild(row);
      }
      nd.appendChild(preview);
    });
  }

  async function renderDuplicateMerge(panel) {
      const env = R();
      const db = env.db;
      const settings = env.settings;
      const C = env.C || UI.getCore();

      if (!db || !settings || !settings.config) {
        UI.addBox(panel, function(nd) { nd.appendChild(UI.createNotice('데이터베이스나 설정을 아직 불러오지 못함', 'error')); });
        return;
      }

      const rerender = function() {
        state.message = state.message || '패널 상태 변경됨. 결과를 새로 보려면 이 패널을 다시 열기';
      };

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('중복 병합', '기존 검색 데이터로 활성 로어의 중복 후보 찾기', HELP.duplicateMerge));
        nd.appendChild(UI.createNotice('저장된 로어 데이터를 수정하는 도구예요. 병합 전 스냅샷을 먼저 만드세요.', 'warn'));

        const controls = document.createElement('div');
        controls.className = 'lore-grid';
        controls.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;';

        const thWrap = document.createElement('div');
        const thLabel = document.createElement('div');
        thLabel.textContent = '유사도 기준';
        thLabel.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;display:flex;align-items:center;gap:6px;';
        thLabel.appendChild(UI.createHelpIcon('유사도 기준', HELP.similarity));
        const th = document.createElement('input');
        th.type = 'number';
        th.min = '0.70';
        th.max = '0.99';
        th.step = '0.01';
        th.value = state.threshold;
        th.style.cssText = cssInput();
        th.onchange = function() {
          const v = parseFloat(th.value);
          if (!isNaN(v)) state.threshold = Math.max(0.7, Math.min(0.99, v));
        };
        thWrap.appendChild(thLabel);
        thWrap.appendChild(th);

        const maxWrap = document.createElement('div');
        const maxLabel = document.createElement('div');
        maxLabel.textContent = '요약 최대 글자 수';
        maxLabel.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;display:flex;align-items:center;gap:6px;';
        maxLabel.appendChild(UI.createHelpIcon('요약 최대 글자 수', HELP.maxChars));
        const max = document.createElement('input');
        max.type = 'number';
        max.min = '200';
        max.max = '3000';
        max.step = '50';
        max.value = state.maxChars;
        max.style.cssText = cssInput();
        max.onchange = function() {
          const v = parseInt(max.value, 10);
          if (!isNaN(v)) state.maxChars = Math.max(200, Math.min(3000, v));
        };
        maxWrap.appendChild(maxLabel);
        maxWrap.appendChild(max);

        controls.appendChild(thWrap);
        controls.appendChild(maxWrap);
        nd.appendChild(controls);

        const actions = document.createElement('div');
        actions.className = 'lore-actions';
        actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

        const scan = UI.createButton('후보 찾기', { kind: 'primary', bold: true });
        const undo = UI.createButton('마지막 병합 되돌리기', { kind: '', bold: false });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:8px;line-height:1.5;min-height:16px;';

        scan.onclick = async function() {
          scan.disabled = true;
          if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 중복 후보를 찾는 중..');
          else status.textContent = '에리가 중복 후보를 찾는 중..';
          try {
            const result = await scanGroups(db, settings, C);
            state.groups = result.groups;
            state.message = result.groups.length ? '후보 그룹 ' + result.groups.length + '개 찾음' : (result.reason || '후보 없음');
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, state.message, result.groups.length ? 'info' : 'warn');
            else status.textContent = state.message;
            rerender();
          } catch(e) {
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '스캔 실패: ' + e.message, 'error');
            else status.textContent = '스캔 실패: ' + e.message;
          } finally {
            scan.disabled = false;
          }
        };

        undo.onclick = async function() {
          if (!C || !C.__lastMergeUndo) {
            await UI.createAlertDialog({ title: '되돌릴 기록 없음', message: '현재 실행 세션에 되돌릴 병합 기록이 없어요.', tone: 'warn' });
            return;
          }
          const ok = await UI.createConfirmDialog({
            title: '마지막 병합 되돌리기',
            message: '현재 실행 세션의 마지막 병합을 되돌릴까요?',
            danger: true,
            confirmLabel: '되돌리기',
            cancelLabel: '취소'
          });
          if (!ok) return;
          undo.disabled = true;
          try {
            await undoLastMerge(db, C);
            state.groups = null;
            await UI.createAlertDialog({ title: '되돌리기 완료', message: '마지막 병합을 되돌렸어요.', tone: 'success' });
            rerender();
          } catch(e) {
            await UI.createAlertDialog({ title: '되돌리기 실패', message: e.message, tone: 'error' });
          } finally {
            undo.disabled = false;
          }
        };

        if (UI.createActionGroup) {
          nd.appendChild(UI.createActionGroup([scan], [], [undo]));
        } else {
          actions.appendChild(scan);
          actions.appendChild(undo);
          nd.appendChild(actions);
        }
        if (state.message) status.textContent = state.message;
        nd.appendChild(status);
      });

      if (!state.groups) return;

      if (!state.groups.length) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createNotice('현재 기준에서 병합 후보 없음', 'info'));
        });
        return;
      }

      state.groups.forEach(function(group, index) {
        renderGroup(panel, group, index, db, settings, C, rerender);
      });
    }

  UI.renderDuplicateMerge = renderDuplicateMerge;

  UI.__mergePanelLoaded = true;
  console.log('[LoreInj:UI] merge panel loaded');
})();