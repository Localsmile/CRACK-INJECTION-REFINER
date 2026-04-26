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
      'Merge these duplicate RP lore entries into one JSON object.',
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
    if (entries.length < 2) return { entries, groups: [], reason: 'Need at least two active entries.' };

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
    if (withEmb.length < 2) return { entries, groups: [], reason: 'Need at least two entries with embeddings.' };

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
    const toDelete = group.entries.filter(e => e.id !== target.id);
    const finalEntry = Object.assign({}, draft, {
      id: target.id,
      packName: target.packName,
      project: target.project || '',
      enabled: target.enabled !== false,
      lastUpdated: Date.now()
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

    let embedMsg = 'Embedding was not regenerated.';
    if (C && C.ensureEmbedding && hasApi(settings, true)) {
      try {
        await C.ensureEmbedding(finalEntry, apiOpts(settings, true));
        embedMsg = 'Embedding regenerated.';
      } catch(e) {
        embedMsg = 'Embedding regeneration failed: ' + e.message;
      }
    }

    return { finalEntry, embedMsg };
  }

  async function undoLastMerge(db, C) {
    const undo = C && C.__lastMergeUndo;
    if (!undo || !undo.originals || !undo.originals.length) throw new Error('No merge undo data in this runtime session.');

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
      const types = Array.from(new Set(group.entries.map(e => e.type || 'entity')));
      nd.appendChild(UI.createSection('Group ' + (index + 1) + ' / ' + group.entries.length + ' entries / ' + (group.sim * 100).toFixed(1) + '%'));

      if (types.length > 1) {
        nd.appendChild(UI.createNotice('Type mismatch: ' + types.join(', ') + '. Review carefully before merging.', 'warn'));
      }

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-bottom:8px;';
      group.entries.forEach(function(e) {
        const row = document.createElement('div');
        row.style.cssText = 'border:1px solid #333;border-radius:6px;background:#111;padding:8px;font-size:11px;color:#aaa;line-height:1.5;word-break:break-all;';
        row.textContent = '[' + (e.type || 'entity') + '] ' + e.name + ' / ' + e.packName + (e.anchor ? ' / anchored' : '') + '\n' + String(e.summary || e.inject?.full || '').slice(0, 220);
        list.appendChild(row);
      });
      nd.appendChild(list);

      const mode = document.createElement('select');
      mode.style.cssText = cssInput('margin-bottom:8px;');
      [
        ['keep-longest', 'Keep longest + merge fields'],
        ['llm-summarize', 'LLM summarize merge']
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
        preview.textContent = 'Generating preview.';
        if (mode.value === 'llm-summarize') {
          if (!C || !C.callGeminiApi) throw new Error('LLM API helper is not loaded.');
          if (!hasApi(settings, false)) throw new Error('LLM API setting is missing.');
          group.draft = await buildLlmMerge(group.entries, settings, C, state.maxChars);
        } else {
          group.draft = buildKeepLongest(group.entries);
        }
        const summaryLen = String(group.draft.summary || '').length;
        preview.textContent = 'Summary length: ' + summaryLen + ' / ' + state.maxChars + '\n\n' + JSON.stringify(stripRuntimeFields(group.draft), null, 2);
      }

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';

      const previewBtn = btn('Preview', 'primary');
      previewBtn.onclick = async function() {
        previewBtn.disabled = true;
        try { await buildPreview(); }
        catch(e) { preview.style.display = 'block'; preview.textContent = 'Preview failed: ' + e.message; }
        finally { previewBtn.disabled = false; }
      };

      const mergeBtn = btn('Merge', 'success');
      mergeBtn.onclick = async function() {
        try {
          if (!group.draft) await buildPreview();
          if (!group.draft) return;

          const summaryLen = String(group.draft.summary || '').length;
          if (summaryLen > state.maxChars && !confirm('Summary is over max length. Continue?')) return;
          if (types.length > 1 && !confirm('Types are different. Continue merge?')) return;
          if (!confirm('Merge ' + group.entries.length + ' entries into one?')) return;

          mergeBtn.disabled = true;
          const result = await executeMerge(group, group.draft, db, settings, C);
          alert('Merge complete. ' + result.embedMsg);
          state.groups = state.groups.filter(g => g !== group);
          rerender();
        } catch(e) {
          alert('Merge failed: ' + e.message);
        } finally {
          mergeBtn.disabled = false;
        }
      };

      row.appendChild(previewBtn);
      row.appendChild(mergeBtn);
      nd.appendChild(row);
      nd.appendChild(preview);
    });
  }

  UI.registerPanel({
    id: 'merge',
    label: '중복 병합',
    title: '중복 병합',
    order: 87,
    render: async function(panel) {
      const env = R();
      const db = env.db;
      const settings = env.settings;
      const C = env.C || UI.getCore();

      if (!db || !settings || !settings.config) {
        UI.addBox(panel, function(nd) { nd.appendChild(UI.createNotice('Database or settings are not loaded.', 'error')); });
        return;
      }

      const rerender = function() {
        state.message = state.message || 'Panel state updated. Reopen this panel to refresh results.';
      };

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Duplicate merge', 'Find duplicate active lore entries using existing embeddings.'));
        nd.appendChild(UI.createNotice('This tool edits persistent lore data. Create a snapshot before merging.', 'warn'));

        const controls = document.createElement('div');
        controls.className = 'lore-grid';
        controls.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0;';

        const thWrap = document.createElement('div');
        const thLabel = document.createElement('div');
        thLabel.textContent = 'Similarity threshold';
        thLabel.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;';
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
        maxLabel.textContent = 'Max summary chars';
        maxLabel.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;';
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

        const scan = UI.createButton('Find candidates', { kind: 'primary', bold: true });
        const undo = UI.createButton('Undo last merge', { kind: '', bold: false });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:8px;line-height:1.5;min-height:16px;';

        scan.onclick = async function() {
          scan.disabled = true;
          status.textContent = 'Scanning active entries.';
          status.style.color = '#4a9';
          try {
            const result = await scanGroups(db, settings, C);
            state.groups = result.groups;
            state.message = result.groups.length ? 'Found ' + result.groups.length + ' candidate groups.' : (result.reason || 'No candidates found.');
            status.textContent = state.message;
            status.style.color = result.groups.length ? '#4a9' : '#da8';
            rerender();
          } catch(e) {
            status.textContent = 'Scan failed: ' + e.message;
            status.style.color = '#d66';
          } finally {
            scan.disabled = false;
          }
        };

        undo.onclick = async function() {
          if (!C || !C.__lastMergeUndo) { alert('No merge undo data in this runtime session.'); return; }
          if (!confirm('Undo the last merge in this runtime session?')) return;
          undo.disabled = true;
          try {
            await undoLastMerge(db, C);
            state.groups = null;
            alert('Undo complete.');
            rerender();
          } catch(e) {
            alert('Undo failed: ' + e.message);
          } finally {
            undo.disabled = false;
          }
        };

        actions.appendChild(scan);
        actions.appendChild(undo);
        nd.appendChild(actions);
        if (state.message) status.textContent = state.message;
        nd.appendChild(status);
      });

      if (!state.groups) return;

      if (!state.groups.length) {
        UI.addBox(panel, function(nd) {
          nd.appendChild(UI.createNotice('No merge candidates at the current threshold.', 'info'));
        });
        return;
      }

      state.groups.forEach(function(group, index) {
        renderGroup(panel, group, index, db, settings, C, rerender);
      });
    }
  });

  UI.__mergePanelLoaded = true;
  console.log('[LoreInj:UI] merge panel loaded');
})();