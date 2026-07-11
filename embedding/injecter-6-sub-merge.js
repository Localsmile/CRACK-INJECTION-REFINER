// injecter / sub-merge - selected lore AI merge
(async function(){
  'use strict';
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-merge] settings not loaded'); return; }
  if (_w.__LoreInj.__subMergeLoaded) return;

  const { C, db, settings } = _w.__LoreInj;

  function summaryValue(summary) {
    if (!summary) return '';
    if (typeof summary === 'object' && !Array.isArray(summary)) return String(summary.full || summary.compact || summary.micro || '');
    return String(summary || '');
  }

  function canonicalMergeType(type) {
    const value = String(type || '').toLowerCase();
    if (['character', 'identity', 'persona'].includes(value)) return 'character';
    if (['rel', 'relationship'].includes(value)) return 'relationship';
    if (['prom', 'promise'].includes(value)) return 'promise';
    if (['location', 'place'].includes(value)) return 'location';
    if (['item', 'object'].includes(value)) return 'item';
    if (['event', 'scene', 'timeline_event'].includes(value)) return 'event';
    if (['concept', 'setting', 'world'].includes(value)) return 'setting';
    return value || 'misc';
  }

  function typeCompatible(a, b) {
    return canonicalMergeType(a && a.type) === canonicalMergeType(b && b.type);
  }

  function uniq(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function mergeObj(a, b) {
    const output = (a && typeof a === 'object' && !Array.isArray(a)) ? JSON.parse(JSON.stringify(a)) : {};
    if (!b || typeof b !== 'object' || Array.isArray(b)) return output;
    for (const [key, value] of Object.entries(b)) {
      if (Array.isArray(value)) output[key] = uniq([...(Array.isArray(output[key]) ? output[key] : []), ...value]);
      else if (value && typeof value === 'object') output[key] = mergeObj(output[key], value);
      else if (value !== undefined && value !== null && value !== '') output[key] = value;
    }
    return output;
  }

  function mergeSummaries(a, b) {
    const left = a && typeof a === 'object' && !Array.isArray(a) ? a : { full: summaryValue(a) };
    const right = b && typeof b === 'object' && !Array.isArray(b) ? b : { full: summaryValue(b) };
    const join = (x, y) => {
      x = String(x || '').trim();
      y = String(y || '').trim();
      if (!x) return y;
      if (!y || x.includes(y)) return x;
      if (y.includes(x)) return y;
      return x + ' / ' + y;
    };
    return {
      full: join(left.full || left.compact || left.micro, right.full || right.compact || right.micro),
      compact: join(left.compact || left.micro, right.compact || right.micro),
      micro: right.micro || left.micro || ''
    };
  }

  function mergeDraftWithOriginals(draft, entries) {
    const sorted = [...entries].sort((a, b) => (a.lastUpdated || a.ts || 0) - (b.lastUpdated || b.ts || 0));
    const base = JSON.parse(JSON.stringify(sorted.find(entry => entry.anchor) || sorted[0] || {}));
    for (const entry of sorted) {
      base.triggers = uniq([...(base.triggers || []), ...(entry.triggers || [])]).slice(0, 12);
      base.entities = uniq([...(base.entities || []), ...(entry.entities || [])]);
      base.parties = uniq([...(base.parties || []), ...(entry.parties || [])]);
      base.participants = uniq([...(base.participants || []), ...(entry.participants || [])]);
      base.recallTriggers = uniq([...(base.recallTriggers || []), ...(entry.recallTriggers || [])]);
      base.linkedLore = uniq([...(base.linkedLore || []), ...(entry.linkedLore || [])]);
      base.detail = mergeObj(base.detail, entry.detail);
      base.call = mergeObj(base.call, entry.call);
      base.callState = mergeObj(base.callState, entry.callState);
      base.timeline = mergeObj(base.timeline, entry.timeline);
      base.eventHistory = uniq([...(base.eventHistory || []), ...(entry.eventHistory || [])]);
      base.callHistory = uniq([...(base.callHistory || []), ...(entry.callHistory || [])]);
      base.summary = mergeSummaries(base.summary, entry.summary);
      base.inject = mergeSummaries(base.inject, entry.inject || entry.summary);
    }
    const merged = mergeObj(base, draft || {});
    merged.triggers = uniq([...(base.triggers || []), ...((draft && draft.triggers) || [])]).slice(0, 12);
    merged.entities = uniq([...(base.entities || []), ...((draft && draft.entities) || [])]);
    merged.eventHistory = uniq([...(base.eventHistory || []), ...((draft && draft.eventHistory) || [])]);
    merged.callHistory = uniq([...(base.callHistory || []), ...((draft && draft.callHistory) || [])]);
    // The AI draft already consolidates the selected lore. Appending every original
    // summary again makes preview and injection text repeat the same facts.
    merged.summary = (draft && draft.summary) ? mergeSummaries(null, draft.summary) : base.summary;
    merged.inject = (draft && (draft.inject || draft.summary))
      ? mergeSummaries(null, draft.inject || draft.summary)
      : base.inject;
    return merged;
  }

  function cosine(a, b) {
    let dot = 0, normA = 0, normB = 0;
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index++) {
      dot += a[index] * b[index];
      normA += a[index] * a[index];
      normB += b[index] * b[index];
    }
    return dot / ((Math.sqrt(normA) * Math.sqrt(normB)) || 1);
  }

  async function reembedPacks(packNames, status) {
    const packs = [];
    for (const packName of Array.from(new Set((packNames || []).filter(Boolean)))) {
      if (await db.entries.where('packName').equals(packName).count()) packs.push(packName);
    }
    const missing = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'embed') : '';
    if (missing) return { skipped: true, message: missing };
    const apiOpts = _w.__LoreInj.buildEmbeddingApiOpts
      ? _w.__LoreInj.buildEmbeddingApiOpts({ model: settings.config.embeddingModel || 'gemini-embedding-001' }, { feature: 'embed', chatKey: 'global' })
      : { apiType: 'key', key: settings.config.autoExtGeminiEmbedKey || settings.config.autoExtKey, model: settings.config.embeddingModel || 'gemini-embedding-001' };
    let count = 0;
    for (const packName of packs) {
      if (status) status('검색 준비 중: ' + packName);
      count += await C.embedPack(packName, apiOpts);
    }
    return { count };
  }

  async function candidateFilter(entries, threshold) {
    if (!Array.isArray(entries) || entries.length < 2) return { ids: new Set(), scores: new Map(), preparedCount: 0 };
    const embeddings = await db.embeddings.where('entryId').anyOf(entries.map(entry => entry.id)).toArray();
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    const vectors = new Map();
    for (const embedding of embeddings) {
      if (embedding.field !== 'summary') continue;
      const entry = entryById.get(embedding.entryId);
      if (!entry || (embedding.packName && embedding.packName !== entry.packName)) continue;
      if (C.embeddingSourceHash && (embedding.sourceHash || embedding.hash) !== C.embeddingSourceHash(entry, 'summary')) continue;
      vectors.set(entry.id, embedding.vector);
    }
    const prepared = entries.filter(entry => vectors.has(entry.id));
    const ids = new Set();
    const scores = new Map();
    for (let left = 0; left < prepared.length; left++) {
      for (let right = left + 1; right < prepared.length; right++) {
        if (!typeCompatible(prepared[left], prepared[right])) continue;
        const score = cosine(vectors.get(prepared[left].id), vectors.get(prepared[right].id));
        if (score < threshold) continue;
        ids.add(prepared[left].id);
        ids.add(prepared[right].id);
        scores.set(prepared[left].id, Math.max(scores.get(prepared[left].id) || 0, score));
        scores.set(prepared[right].id, Math.max(scores.get(prepared[right].id) || 0, score));
      }
    }
    return { ids, scores, preparedCount: prepared.length };
  }

  async function buildAiMerge(entries) {
    const clean = entries.map(({ id, packName, project, enabled, ...rest }) => rest);
    const prompt = '다음 로어들은 사용자가 직접 하나로 병합하도록 선택한 항목이다. 입력에 있는 사실만 사용해 하나의 로어 JSON 객체로 병합하라.\n' +
      '1. 모든 입력을 대조해 이름, 관계, 현재와 과거 상태, 약속, 사건 원인, 결과, 미해결 훅을 누락하지 않는다.\n' +
      '2. 반복 표현만 정리하고 서로 다른 사실은 삭제하지 않는다. 충돌은 timeline과 lastUpdated를 참고하고 과거 상태는 eventHistory에 남긴다.\n' +
      '3. summary와 inject는 {full, compact, micro} 구조를 유지한다. 임의의 글자 수를 맞추려고 사실을 버리지 않는다.\n' +
      '4. eventHistory, callHistory, callState, timeline, entities, detail, participants, recallTriggers, linkedLore는 의미를 보존해 통합한다.\n' +
      '5. embed_text에는 이름, 별칭, 관계어, 사건 원인, 이해관계, 장소와 미해결 훅을 포함한다.\n' +
      '6. triggers는 양쪽 고유명사를 보존하면서 중복을 제거하고 최대 12개로 정리한다.\n' +
      '7. 서로 다른 유형이 섞였으면 가장 핵심적인 유형을 선택하고 summary.full에 나머지 역할도 보존한다.\n' +
      '8. 순수 JSON 객체 하나만 출력하고 입력에 없는 사실은 만들지 않는다.\n\n입력:\n' + JSON.stringify(clean, null, 2);
    const response = await C.callGeminiApi(prompt, _w.__LoreInj.buildGenerationApiOpts
      ? _w.__LoreInj.buildGenerationApiOpts({
          model: settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel,
          maxRetries: 2,
          responseMimeType: 'application/json'
        }, { feature: 'merge', chatKey: 'global' })
      : {
          apiType: settings.config.autoExtApiType || 'key',
          key: settings.config.autoExtKey,
          deepSeekKey: settings.config.autoExtDeepSeekKey,
          model: settings.config.autoExtModel,
          maxRetries: 2,
          responseMimeType: 'application/json'
        });
    if (!response.text) throw new Error('AI 병합 응답 없음: ' + (response.error || '알 수 없는 오류'));
    let text = response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) text = objectMatch[0];
    return mergeDraftWithOriginals(JSON.parse(text), entries);
  }

  async function updatePackCounts(packNames) {
    for (const packName of Array.from(new Set(packNames))) {
      const count = await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName, { entryCount: count });
    }
  }

  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  _w.__LoreInj.registerSubMenu('merge', function(modal) {
    modal.createSubMenu('로어 병합', (manager) => {
      const renderMerge = async (panel) => {
        const state = _w.__loreMergeState || (_w.__loreMergeState = {
          threshold: 0.88,
          useThreshold: false,
          candidateIds: null,
          candidateScores: new Map(),
          selectedIds: new Set(),
          targetId: null,
          query: '',
          preview: null,
          previewKey: ''
        });
        if (!(state.selectedIds instanceof Set)) state.selectedIds = new Set(state.selectedIds || []);
        if (!(state.candidateScores instanceof Map)) state.candidateScores = new Map();

        const url = C.getCurUrl();
        const activePacks = _w.__LoreInj.getActivePacksForUrl
          ? _w.__LoreInj.getActivePacksForUrl(url)
          : (settings.config.urlPacks && settings.config.urlPacks[url] || []);
        const allEntries = (await db.entries.toArray()).filter(entry => activePacks.includes(entry.packName));
        const liveIds = new Set(allEntries.map(entry => entry.id));
        for (const id of Array.from(state.selectedIds)) if (!liveIds.has(id)) state.selectedIds.delete(id);

        panel.addBoxedField('', '', { onInit: (node) => {
          C.setFullWidth(node);
          const title = document.createElement('div');
          title.textContent = '선택한 로어 AI 병합';
          title.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:5px;';
          node.appendChild(title);
          const description = document.createElement('div');
          description.textContent = '현재 채팅에서 켠 로어팩의 로어 중 합칠 항목만 직접 선택합니다. 유사도 임계값은 후보를 좁힐 때만 사용하며, 최종 병합 대상은 체크한 로어로 확정됩니다. 병합 후 검색 준비는 자동으로 갱신됩니다.';
          description.style.cssText = 'font-size:11px;color:#888;line-height:1.55;margin-bottom:10px;';
          node.appendChild(description);

          const filterRow = document.createElement('div');
          filterRow.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 104px;gap:8px;align-items:center;margin-bottom:8px;';
          const thresholdToggle = C.createToggleRow('유사도 후보 필터', '켜면 검색 준비된 로어 중 임계값 이상인 같은 유형의 후보만 찾습니다.', state.useThreshold, (value) => {
            state.useThreshold = value;
            if (!value) { state.candidateIds = null; state.candidateScores = new Map(); }
            manager.replaceContentPanel(renderMerge, '로어 병합');
          });
          thresholdToggle.style.margin = '0';
          const thresholdInput = document.createElement('input');
          thresholdInput.type = 'number'; thresholdInput.min = '0.70'; thresholdInput.max = '0.99'; thresholdInput.step = '0.01'; thresholdInput.value = state.threshold;
          thresholdInput.disabled = !state.useThreshold;
          thresholdInput.title = '후보 유사도 임계값';
          thresholdInput.style.cssText = 'width:100%;padding:7px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          thresholdInput.onchange = () => { const value = Number(thresholdInput.value); if (Number.isFinite(value)) state.threshold = Math.min(0.99, Math.max(0.70, value)); };
          filterRow.appendChild(thresholdToggle); filterRow.appendChild(thresholdInput); node.appendChild(filterRow);

          const candidateRow = document.createElement('div');
          candidateRow.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px;';
          const candidateButton = document.createElement('button');
          candidateButton.textContent = state.useThreshold ? '유사한 후보 찾기' : '전체 로어 표시';
          candidateButton.style.cssText = 'flex:1;min-width:150px;padding:8px;background:#258;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;';
          const resetCandidateButton = document.createElement('button');
          resetCandidateButton.textContent = '후보 필터 해제';
          resetCandidateButton.style.cssText = 'padding:8px 11px;background:transparent;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:11px;';
          candidateButton.onclick = async () => {
            if (!state.useThreshold) { state.candidateIds = null; state.candidateScores = new Map(); manager.replaceContentPanel(renderMerge, '로어 병합'); return; }
            candidateButton.disabled = true; candidateButton.textContent = '후보 찾는 중...';
            try {
              const result = await candidateFilter(allEntries, state.threshold);
              state.candidateIds = result.ids;
              state.candidateScores = result.scores;
              if (result.preparedCount < 2) alert('검색 준비된 로어가 2개 미만입니다. 로어팩 관리에서 검색 준비를 실행하세요.');
              manager.replaceContentPanel(renderMerge, '로어 병합');
            } catch (error) {
              alert('후보 검색 실패: ' + (error.message || String(error)));
              candidateButton.disabled = false; candidateButton.textContent = '유사한 후보 찾기';
            }
          };
          resetCandidateButton.onclick = () => { state.candidateIds = null; state.candidateScores = new Map(); manager.replaceContentPanel(renderMerge, '로어 병합'); };
          candidateRow.appendChild(candidateButton); candidateRow.appendChild(resetCandidateButton); node.appendChild(candidateRow);

          if (C.__lastMergeUndo && C.__lastMergeUndo.originals && C.__lastMergeUndo.originals.length) {
            const undoButton = document.createElement('button');
            undoButton.textContent = '직전 병합 취소 (' + C.__lastMergeUndo.originals.length + '개 복원)';
            undoButton.style.cssText = 'width:100%;padding:8px;margin-bottom:9px;background:transparent;color:#da8;border:1px solid #642;border-radius:4px;cursor:pointer;font-size:11px;';
            undoButton.onclick = async () => {
              if (!confirm('직전 병합을 취소하고 원본 로어를 복원할까요?')) return;
              const undo = C.__lastMergeUndo;
              const packs = Array.from(new Set(undo.originals.map(entry => entry.packName)));
              try {
                await db.transaction('rw', db.entries, db.embeddings, db.packs, async () => {
                  if (undo.mergedId != null) await db.entries.delete(undo.mergedId);
                  await db.entries.bulkPut(undo.originals);
                  const ids = uniq([undo.mergedId, ...undo.originals.map(entry => entry.id)]).filter(id => id != null);
                  if (ids.length) await db.embeddings.where('entryId').anyOf(ids).delete();
                  await updatePackCounts(packs);
                });
                C.__lastMergeUndo = null;
                state.selectedIds.clear(); state.preview = null; state.previewKey = '';
                let embeddingMessage = '';
                try {
                  const result = await reembedPacks(packs, message => { undoButton.textContent = message; });
                  embeddingMessage = result.skipped ? ' 검색 준비 생략: ' + result.message : ' 검색 준비 ' + result.count + '개 갱신.';
                } catch (error) { embeddingMessage = ' 검색 준비 갱신 실패: ' + (error.message || String(error)); }
                alert('복원 완료.' + embeddingMessage);
                manager.replaceContentPanel(renderMerge, '로어 병합');
              } catch (error) { alert('복원 실패: ' + (error.message || String(error))); }
            };
            node.appendChild(undoButton);
          }
        }});

        panel.addBoxedField('', '', { onInit: (node) => {
          C.setFullWidth(node);
          if (!activePacks.length) {
            const empty = document.createElement('div'); empty.textContent = '현재 채팅에서 켠 로어팩이 없습니다.'; empty.style.cssText = 'font-size:12px;color:#888;padding:12px;text-align:center;'; node.appendChild(empty); return;
          }
          if (allEntries.length < 2) {
            const empty = document.createElement('div'); empty.textContent = '병합할 수 있는 로어가 2개 미만입니다.'; empty.style.cssText = 'font-size:12px;color:#888;padding:12px;text-align:center;'; node.appendChild(empty); return;
          }

          const search = document.createElement('input');
          search.type = 'search'; search.value = state.query || ''; search.placeholder = '이름, 유형, 로어팩, 내용 검색';
          search.style.cssText = 'width:100%;padding:8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
          node.appendChild(search);

          const toolbar = document.createElement('div'); toolbar.style.cssText = 'display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:8px;';
          const visibleLabel = document.createElement('div'); visibleLabel.style.cssText = 'font-size:11px;color:#888;flex:1;min-width:120px;';
          const selectVisibleButton = document.createElement('button'); selectVisibleButton.textContent = '보이는 로어 선택'; selectVisibleButton.style.cssText = 'padding:5px 9px;background:transparent;color:#8bc;border:1px solid #346;border-radius:4px;cursor:pointer;font-size:10px;';
          const clearButton = document.createElement('button'); clearButton.textContent = '선택 해제'; clearButton.style.cssText = 'padding:5px 9px;background:transparent;color:#aaa;border:1px solid #444;border-radius:4px;cursor:pointer;font-size:10px;';
          toolbar.appendChild(visibleLabel); toolbar.appendChild(selectVisibleButton); toolbar.appendChild(clearButton); node.appendChild(toolbar);

          const list = document.createElement('div');
          list.style.cssText = 'max-height:360px;overflow:auto;border:1px solid #292929;border-radius:4px;background:#090909;';
          node.appendChild(list);

          const selectedBox = document.createElement('div');
          selectedBox.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #333;';
          const selectedStatus = document.createElement('div'); selectedStatus.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;margin-bottom:7px;';
          const targetLabel = document.createElement('div'); targetLabel.textContent = '병합 결과를 저장할 기준 로어'; targetLabel.style.cssText = 'font-size:11px;color:#888;margin-bottom:4px;';
          const targetSelect = document.createElement('select'); targetSelect.style.cssText = 'width:100%;padding:7px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;box-sizing:border-box;margin-bottom:8px;';
          const actionRow = document.createElement('div'); actionRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
          const previewButton = document.createElement('button'); previewButton.textContent = 'AI 병합 미리보기'; previewButton.style.cssText = 'padding:9px;background:transparent;color:#8bc;border:1px solid #346;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;';
          const mergeButton = document.createElement('button'); mergeButton.textContent = '선택한 로어 병합'; mergeButton.style.cssText = 'padding:9px;background:#285;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;';
          actionRow.appendChild(previewButton); actionRow.appendChild(mergeButton);
          const preview = document.createElement('pre'); preview.style.cssText = 'display:none;max-height:320px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:8px 0 0;padding:9px;background:#060606;border:1px solid #222;border-radius:4px;color:#ccc;font-size:10px;';
          selectedBox.appendChild(selectedStatus); selectedBox.appendChild(targetLabel); selectedBox.appendChild(targetSelect); selectedBox.appendChild(actionRow); selectedBox.appendChild(preview); node.appendChild(selectedBox);

          let visibleEntries = [];
          const selectionKey = () => Array.from(state.selectedIds).sort((a, b) => Number(a) - Number(b)).join(',');
          const invalidatePreview = () => { state.preview = null; state.previewKey = ''; preview.style.display = 'none'; preview.textContent = ''; };
          const updateSelected = () => {
            const selected = allEntries.filter(entry => state.selectedIds.has(entry.id));
            selectedStatus.textContent = '선택 ' + selected.length + '개';
            targetSelect.innerHTML = '';
            for (const entry of selected) {
              const option = document.createElement('option'); option.value = String(entry.id); option.textContent = '[' + entry.packName + '] ' + entry.name + (entry.anchor ? ' (앵커)' : ''); targetSelect.appendChild(option);
            }
            if (!selected.some(entry => String(entry.id) === String(state.targetId))) state.targetId = selected.find(entry => entry.anchor)?.id || selected[0]?.id || null;
            if (state.targetId != null) targetSelect.value = String(state.targetId);
            const disabled = selected.length < 2;
            previewButton.disabled = disabled; mergeButton.disabled = disabled; targetSelect.disabled = disabled;
            previewButton.style.opacity = disabled ? '.45' : '1'; mergeButton.style.opacity = disabled ? '.45' : '1';
          };
          targetSelect.onchange = () => { state.targetId = Number(targetSelect.value); invalidatePreview(); };

          const renderEntries = () => {
            const query = String(state.query || '').trim().toLowerCase();
            visibleEntries = allEntries.filter(entry => {
              if (state.candidateIds instanceof Set && !state.candidateIds.has(entry.id)) return false;
              const haystack = [entry.name, entry.type, entry.packName, summaryValue(entry.summary), ...(entry.triggers || [])].join(' ').toLowerCase();
              return !query || haystack.includes(query);
            });
            list.innerHTML = '';
            visibleLabel.textContent = '표시 ' + visibleEntries.length + '개 / 전체 ' + allEntries.length + '개';
            if (!visibleEntries.length) {
              const empty = document.createElement('div'); empty.textContent = state.candidateIds instanceof Set ? '조건에 맞는 후보가 없습니다.' : '검색 결과가 없습니다.'; empty.style.cssText = 'padding:18px;text-align:center;color:#666;font-size:11px;'; list.appendChild(empty); return;
            }
            for (const entry of visibleEntries) {
              const row = document.createElement('label'); row.style.cssText = 'display:grid;grid-template-columns:20px minmax(0,1fr) auto;gap:7px;align-items:start;padding:8px;border-bottom:1px solid #202020;cursor:pointer;';
              const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = state.selectedIds.has(entry.id); checkbox.style.marginTop = '2px';
              const text = document.createElement('div');
              const name = document.createElement('div'); name.textContent = '[' + (entry.type || '기타') + '] ' + (entry.name || '이름 없음'); name.style.cssText = 'font-size:11px;color:#ccc;font-weight:bold;word-break:break-word;';
              const summary = document.createElement('div'); summary.textContent = summaryValue(entry.summary) || '(요약 없음)'; summary.style.cssText = 'font-size:10px;color:#777;line-height:1.4;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;';
              text.appendChild(name); text.appendChild(summary);
              const meta = document.createElement('div');
              const score = state.candidateScores.get(entry.id);
              meta.textContent = entry.packName + (score ? ' · ' + (score * 100).toFixed(1) + '%' : ''); meta.style.cssText = 'font-size:9px;color:#666;text-align:right;max-width:110px;word-break:break-word;';
              checkbox.onchange = () => { if (checkbox.checked) state.selectedIds.add(entry.id); else state.selectedIds.delete(entry.id); invalidatePreview(); updateSelected(); };
              row.appendChild(checkbox); row.appendChild(text); row.appendChild(meta); list.appendChild(row);
            }
          };

          search.oninput = () => { state.query = search.value; renderEntries(); };
          selectVisibleButton.onclick = () => { for (const entry of visibleEntries) state.selectedIds.add(entry.id); invalidatePreview(); renderEntries(); updateSelected(); };
          clearButton.onclick = () => { state.selectedIds.clear(); state.targetId = null; invalidatePreview(); renderEntries(); updateSelected(); };

          const buildPreview = async () => {
            const selected = allEntries.filter(entry => state.selectedIds.has(entry.id));
            if (selected.length < 2) return null;
            const missing = _w.__LoreInj.getApiMissingReason ? _w.__LoreInj.getApiMissingReason(settings.config, 'generate') : '';
            if (missing) throw new Error(missing);
            preview.style.display = 'block'; preview.textContent = 'AI 병합 결과 생성 중...';
            previewButton.disabled = true; mergeButton.disabled = true;
            try {
              const draft = await buildAiMerge(selected);
              state.preview = draft; state.previewKey = selectionKey();
              preview.textContent = JSON.stringify(draft, null, 2);
              return draft;
            } catch (error) {
              state.preview = null; state.previewKey = ''; preview.textContent = '실패: ' + (error.message || String(error)); throw error;
            } finally { updateSelected(); }
          };
          previewButton.onclick = async () => { try { await buildPreview(); } catch (_) {} };
          mergeButton.onclick = async () => {
            const selected = allEntries.filter(entry => state.selectedIds.has(entry.id));
            if (selected.length < 2) return;
            let draft = state.previewKey === selectionKey() ? state.preview : null;
            if (!draft) { try { draft = await buildPreview(); } catch (_) { return; } }
            const types = Array.from(new Set(selected.map(entry => canonicalMergeType(entry.type))));
            if (types.length > 1 && !confirm('서로 다른 유형의 로어가 선택되었습니다. AI가 하나의 유형으로 정리하도록 계속할까요?')) return;
            const target = selected.find(entry => String(entry.id) === String(state.targetId)) || selected.find(entry => entry.anchor) || selected[0];
            if (!confirm(selected.length + '개 로어를 하나로 병합하고 [' + target.name + '] 위치에 저장할까요?')) return;
            mergeButton.disabled = true; mergeButton.textContent = '병합 저장 중...';
            const originals = selected.map(entry => JSON.parse(JSON.stringify(entry)));
            const packs = Array.from(new Set(selected.map(entry => entry.packName)));
            try {
              for (const entry of selected) { try { if (C.saveEntryVersion) await C.saveEntryVersion(entry, 'pre_merge'); } catch (_) {} }
              const finalEntry = {
                ...draft,
                id: target.id,
                packName: target.packName,
                project: target.project,
                enabled: target.enabled !== false,
                lastUpdated: Date.now()
              };
              const selectedIds = selected.map(entry => entry.id);
              await db.transaction('rw', db.entries, db.embeddings, db.packs, async () => {
                await db.entries.put(finalEntry);
                const deleteIds = selectedIds.filter(id => id !== target.id);
                if (deleteIds.length) await db.entries.bulkDelete(deleteIds);
                await db.embeddings.where('entryId').anyOf(selectedIds).delete();
                await updatePackCounts(packs);
              });
              C.__lastMergeUndo = { mergedId: target.id, originals };
              state.selectedIds.clear(); state.targetId = null; state.preview = null; state.previewKey = ''; state.candidateIds = null; state.candidateScores = new Map();
              let embeddingMessage = '';
              try {
                const result = await reembedPacks(packs, message => { mergeButton.textContent = message; });
                embeddingMessage = result.skipped ? '검색 준비 생략: ' + result.message : '검색 준비 ' + result.count + '개 갱신 완료.';
              } catch (error) { embeddingMessage = '검색 준비 갱신 실패: ' + (error.message || String(error)); }
              alert('병합 완료. ' + embeddingMessage);
              manager.replaceContentPanel(renderMerge, '로어 병합');
            } catch (error) {
              alert('병합 실패: ' + (error.message || String(error)));
              mergeButton.disabled = false; mergeButton.textContent = '선택한 로어 병합';
            }
          };

          renderEntries(); updateSelected();
        }});
      };
      manager.replaceContentPanel(renderMerge, '로어 병합');
    });
  });

  _w.__LoreInj.__subMergeLoaded = true;
})();
