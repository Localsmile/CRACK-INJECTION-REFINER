// == 인젝터 모듈 4/6 — 추출 파이프라인 ==
// mergeExtractedData, runAutoExtract, _doExtract, extBadge watchdog
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:4] settings 미로드'); return; }
  if (_w.__LoreInj.__extractLoaded) return;

  const {
    C, db, _ls, settings,
    parseJsonLoose, createSnapshot,
    getChatKey, getTurnCounter,
    getAutoExtPackForUrl,
    addExtLog, setPackEnabled
  } = _w.__LoreInj;

  async function mergeExtractedData(entries, url) {
    const packName = await getAutoExtPackForUrl(url);
    const chatKey = getChatKey();
    let ap = [...(settings.config.autoPacks || [])];
    if (!ap.includes(packName)) { ap.push(packName); settings.config.autoPacks = ap; settings.save(); }
    const proj = settings.config.activeProject || '';
    let pack = await db.packs.get(packName);
    if (!pack) await db.packs.put({ name: packName, entryCount: 0, project: proj });
    else await createSnapshot(packName, '자동 병합 전 백업', 'auto');

    let addedCount = 0, processedCount = 0;
    for (const e of entries) {
      if (!e.name) continue;
      e.gs = (e.imp || 5) + (e.sur || 5) + (e.emo || 5);
      if (settings.config.importanceGating !== false) {
        if (e.gs < (settings.config.importanceThreshold || 12)) continue;
        e.gateScore = e.gs;
      }
      processedCount++;
      let existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name).first();
      if (existing) {
        // 서사 무결성: 덮어쓰기 전 현재 상태 백업 (append-only)
        try { if (C.saveEntryVersion) await C.saveEntryVersion(existing, 'extract_merge'); } catch(ex) {}
        // Narrative Anchor: 앵커 엔트리는 summary/state/detail/call/inject 등 내러티브 필드 보호.
        // 스냅샷 떠놨다가 put 직전 복원. eventHistory/triggers 병합만 허용.
        const _anchorGuard = existing.anchor === true;
        const _anchorSnap = _anchorGuard ? {
          summary: existing.summary,
          state: existing.state,
          detail: existing.detail ? JSON.parse(JSON.stringify(existing.detail)) : undefined,
          call: existing.call ? JSON.parse(JSON.stringify(existing.call)) : undefined,
          callHistory: existing.callHistory ? JSON.parse(JSON.stringify(existing.callHistory)) : undefined,
          inject: existing.inject ? JSON.parse(JSON.stringify(existing.inject)) : undefined,
          cond: existing.cond,
          imp: existing.imp, sur: existing.sur, emo: existing.emo, gs: existing.gs,
          arc: existing.arc ? JSON.parse(JSON.stringify(existing.arc)) : undefined
        } : null;
        if (!_anchorGuard && ['relationship', 'promise', 'rel', 'prom'].includes(e.type)) {
          const oldS = existing.state || existing.detail?.current_status || existing.detail?.status || null;
          const newS = e.state || e.detail?.current_status || e.detail?.status || null;
          if (oldS && newS && oldS !== newS) {
            const cLog = JSON.parse(_ls.getItem('lore-contradictions') || '[]');
            cLog.unshift({ name: e.name, type: e.type, oldStatus: oldS, newStatus: newS, turn: getTurnCounter(chatKey), time: Date.now() });
            if (cLog.length > 50) cLog.length = 50;
            _ls.setItem('lore-contradictions', JSON.stringify(cLog));
          }
        }
        existing.triggers = [...new Set([...(existing.triggers || []), ...(e.triggers || [])])];
        if (e.embed_text) existing.embed_text = e.embed_text;
        if (e.inject) existing.inject = e.inject;
        if (e.state !== undefined) existing.state = e.state;
        if (e.call) existing.call = { ...(existing.call || {}), ...e.call };
        if (Array.isArray(e.callDelta) && e.callDelta.length > 0) {
          existing.callHistory = existing.callHistory || [];
          for (const d of e.callDelta) {
            if (!d.from || !d.to || !d.term) continue;
            existing.callHistory.push({
              turn: d.turnApprox || getTurnCounter(chatKey),
              from: d.from, to: d.to, term: d.term,
              prevTerm: d.prevTerm || null, ts: Date.now()
            });
          }
          if (existing.callHistory.length > 30) existing.callHistory = existing.callHistory.slice(-30);
        }
        if (Array.isArray(e.eventHistory) && e.eventHistory.length > 0) {
          existing.eventHistory = existing.eventHistory || [];
          for (const ev of e.eventHistory) {
            if (!ev || !ev.summary) continue;
            const normSum = ev.summary.trim();
            if (existing.eventHistory.some(x => x.summary === normSum)) continue;
            existing.eventHistory.push({
              turn: ev.turn || getTurnCounter(chatKey),
              summary: normSum,
              imp: ev.imp || 5,
              emo: ev.emo || 5,
              ts: Date.now()
            });
          }
          existing.eventHistory.sort((a,b) => (a.turn||0) - (b.turn||0));
          if (existing.eventHistory.length > 30) {
            const oldEvents = existing.eventHistory.slice(0, 20);
            const recentEvents = existing.eventHistory.slice(20);
            const rootId = existing.rootId || existing.id;
            const lastTurn = oldEvents[oldEvents.length - 1]?.turn || 0;
            const firstTurn = oldEvents[0]?.turn || 0;
            const shardEntry = {
              name: `${existing.name} [과거 t${firstTurn}~t${lastTurn}]`,
              type: existing.type,
              packName: existing.packName,
              project: existing.project || '',
              enabled: true,
              triggers: [...(existing.triggers || [])],
              embed_text: existing.embed_text,
              rootId: rootId,
              isCurrentArc: false,
              eventHistory: oldEvents,
              inject: {
                full: `${existing.name}[과거사] ${oldEvents.slice(-2).map(ev => `t${ev.turn}:${ev.summary.slice(0,40)}`).join('|')}`,
                compact: `${existing.name}[과거 ${oldEvents.length}건]`,
                micro: `${existing.name}=과거`
              },
              state: '과거사',
              source: 'shard_split',
              src: 'sh',
              ts: Date.now(),
              lastUpdated: Date.now(),
              imp: existing.imp, emo: existing.emo, sur: existing.sur,
              gs: existing.gs
            };
            await db.entries.put(shardEntry);
            existing.eventHistory = recentEvents;
            existing.rootId = null;
            existing.isCurrentArc = true;
          }
          if (existing.inject && typeof existing.inject === 'object') {
            const base = (existing.inject.full || '').split(' | 최근:')[0];
            const recent = existing.eventHistory.slice(-2).map(ev => `t${ev.turn}:${ev.summary.slice(0,40)}`).join('|');
            existing.inject.full = recent ? base + ' | 최근:' + recent : base;
          }
        }
        if (e.cond !== undefined) existing.cond = e.cond;
        if (e.imp) existing.imp = e.imp;
        if (e.sur) existing.sur = e.sur;
        if (e.emo) existing.emo = e.emo;
        existing.gs = (existing.imp || 5) + (existing.sur || 5) + (existing.emo || 5);
        existing.ts = Date.now();

        if (e.type === 'rel' && Array.isArray(e.arc)) {
          existing.arc = existing.arc || [];
          for (const a of e.arc) {
            const dup = existing.arc.find(x => x.ph === a.ph && x.t === a.t);
            if (dup) Object.assign(dup, a); else existing.arc.push(a);
          }
        }

        if (['relationship', 'promise'].includes(e.type)) {
          if (e.summary) existing.summary = e.summary;
          if (e.detail) {
            existing.detail = existing.detail || {};
            if (e.detail.current_status !== undefined) existing.detail.current_status = e.detail.current_status;
            if (e.detail.status !== undefined) existing.detail.status = e.detail.status;
            if (e.detail.parties) existing.detail.parties = e.detail.parties;
            if (e.detail.condition !== undefined) existing.detail.condition = e.detail.condition;

            if (e.detail.nicknames) {
              existing.detail.nicknames = existing.detail.nicknames || {};
              Object.assign(existing.detail.nicknames, e.detail.nicknames);
            }

            if (Array.isArray(e.detail.arc)) {
              existing.detail.arc = existing.detail.arc || [];
              for (const newArc of e.detail.arc) {
                const dup = existing.detail.arc.find(a => a.phase === newArc.phase && a.approx_turn === newArc.approx_turn);
                if (dup) Object.assign(dup, newArc); else existing.detail.arc.push(newArc);
              }
            }
          }
        } else if (e.type !== 'rel' && e.type !== 'prom') {
          if (e.summary && (!existing.summary || !existing.summary.includes(e.summary))) existing.summary = existing.summary ? existing.summary + ' / ' + e.summary : e.summary;
          if (e.detail) {
            existing.detail = existing.detail || {};
            if (e.detail.current_state !== undefined) existing.detail.current_state = e.detail.current_state;
            if (e.detail.last_interaction !== undefined) existing.detail.last_interaction = e.detail.last_interaction;
            for (const k in e.detail) {
              if (['current_state', 'last_interaction'].includes(k)) continue;
              if (!existing.detail[k]) existing.detail[k] = e.detail[k];
              else if (Array.isArray(e.detail[k])) existing.detail[k] = [...new Set([...(existing.detail[k] || []), ...e.detail[k]])];
              else if (typeof existing.detail[k] === 'string' && typeof e.detail[k] === 'string' && !existing.detail[k].includes(e.detail[k])) existing.detail[k] += ' ' + e.detail[k];
            }
          }
        }
        if (e.gateScore) existing.gateScore = e.gateScore;
        existing.lastUpdated = Date.now();

        if (e.type === 'relationship' || e.type === 'rel') {
          let parties = (e.detail?.parties) || e.parties;
          if ((!parties || parties.length < 2) && typeof e.name === 'string') {
            if (e.name.includes('↔')) parties = e.name.split('↔').map(s => s.trim()).filter(Boolean);
            else if (e.name.includes('&')) parties = e.name.split('&').map(s => s.trim()).filter(Boolean);
          }
          if (parties && parties.length >= 2) {
            const [c1, c2] = parties;
            try { await C.recordFirstEncounter(c1, c2, { turnApprox: getTurnCounter(chatKey), timestamp: Date.now() }); } catch(ex) {}
          }
        }
        // Narrative Anchor: 보호 필드 복원
        if (_anchorSnap) {
          for (const k of Object.keys(_anchorSnap)) {
            if (_anchorSnap[k] === undefined) delete existing[k];
            else existing[k] = _anchorSnap[k];
          }
        }
        await db.entries.put(existing);
      } else {
        e.packName = packName; e.project = proj; e.enabled = true;
        e.src = e.src || (e.source === 'user_stated' ? 'us' : (e.source === 'imported' ? 'im' : 'ax'));
        e.source = e.source || 'auto_extracted';
        e.ts = Date.now();
        e.lastUpdated = e.ts;
        if ((e.type === 'rel' || e.type === 'relationship') && Array.isArray(e.callDelta) && e.callDelta.length > 0) {
          e.callHistory = e.callHistory || [];
          for (const d of e.callDelta) {
            if (!d.from || !d.to || !d.term) continue;
            e.callHistory.push({
              turn: d.turnApprox || getTurnCounter(chatKey),
              from: d.from, to: d.to, term: d.term,
              prevTerm: d.prevTerm || null, ts: Date.now()
            });
          }
        }
        if (Array.isArray(e.eventHistory) && e.eventHistory.length > 0) {
          e.eventHistory = e.eventHistory.filter(ev => ev && ev.summary).map(ev => ({
            turn: ev.turn || getTurnCounter(chatKey),
            summary: ev.summary.trim(),
            imp: ev.imp || 5, emo: ev.emo || 5, ts: Date.now()
          })).sort((a,b) => (a.turn||0) - (b.turn||0));
          if (e.eventHistory.length > 30) e.eventHistory = e.eventHistory.slice(-30);
          if (e.inject && typeof e.inject === 'object') {
            const base = (e.inject.full || '').split(' | 최근:')[0];
            const recent = e.eventHistory.slice(-2).map(ev => `t${ev.turn}:${ev.summary.slice(0,40)}`).join('|');
            e.inject.full = recent ? base + ' | 최근:' + recent : base;
          }
        }
        await db.entries.put(e); addedCount++;
      }
    }
    if (addedCount > 0) {
      const count = await db.entries.where('packName').equals(packName).count();
      await db.packs.update(packName, { entryCount: count });
      await setPackEnabled(packName, true);
    }
    return processedCount;
  }

  const _extQ = { running: false, pendingTurns: 0, manualPending: false };
  let _extBadgeMsg = null, _extBadgeWatchdog = null;
  function extBadgeShow(msg) {
    _extBadgeMsg = msg;
    try { C.showStatusBadge(msg); } catch(e){}
    if (_extBadgeWatchdog) return;
    _extBadgeWatchdog = setInterval(() => {
      if (!_extBadgeMsg) return;
      const badge = document.getElementById('lore-status-badge');
      if (badge && badge.style.opacity === '1' && (badge.textContent || '').includes(_extBadgeMsg)) return;
      try { C.showStatusBadge(_extBadgeMsg); } catch(e){}
    }, 1500);
  }
  function extBadgeHide() {
    _extBadgeMsg = null;
    if (_extBadgeWatchdog) { clearInterval(_extBadgeWatchdog); _extBadgeWatchdog = null; }
    try { C.hideStatusBadge(); } catch(e){}
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && _extBadgeMsg) { try { C.showStatusBadge(_extBadgeMsg); } catch(e){} }
  });

  async function runAutoExtract(isManual = false) {
    if (_extQ.running) { _extQ.pendingTurns++; if (isManual) _extQ.manualPending = true; return; }
    _extQ.running = true; _extQ.pendingTurns = 0; _extQ.manualPending = false;
    extBadgeShow('에리가 대화 분석 중');
    try { await _doExtract(isManual); }
    finally {
      _extQ.running = false; extBadgeHide();
      if (_extQ.pendingTurns > 0 || _extQ.manualPending) { const nextManual = _extQ.manualPending; setTimeout(() => runAutoExtract(nextManual), 500); }
    }
  }

  async function _doExtract(isManual) {
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    const apiType = settings.config.autoExtApiType || 'key';
    const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson
                  : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript
                  : !settings.config.autoExtKey;
    if (missing) { if (isManual) alert('API 설정 미완료.'); return; }
    const scanR = settings.config.autoExtScanRange || 6; const extraTurns = _extQ.pendingTurns || 0;
    const effectiveRange = scanR + extraTurns; const fetchCount = (effectiveRange + settings.config.autoExtOffset) * 2;
    let recentMsgs = await C.fetchLogs(fetchCount > 0 ? fetchCount : 20);
    if (!recentMsgs.length) { if (isManual) alert('대화 기록 없음.'); return; }
    const offsetCount = settings.config.autoExtOffset * 2;
    if (offsetCount > 0 && recentMsgs.length > offsetCount) recentMsgs = recentMsgs.slice(0, recentMsgs.length - offsetCount);
    const context = recentMsgs.map(m => m.role + ': ' + m.message).join('\n');
    let entriesText = '[]';
    if (settings.config.autoExtIncludeDb) {
      const packName = await getAutoExtPackForUrl(_url);
      const existingEntries = await db.entries.where('packName').equals(packName).toArray();
      if (existingEntries.length > 0) {
        let filtered = existingEntries;
        if (existingEntries.length > 30) {
          const ctxLower = context.toLowerCase();
          const scoreEntry = (e) => {
            let s = 0;
            const hay = (e.name || '') + ' ' + (e.triggers || []).join(' ') + ' ' + (e.embed_text || '');
            const hayLower = hay.toLowerCase();
            if (ctxLower.includes((e.name || '').toLowerCase()) && e.name) s += 100;
            for (const t of (e.triggers || [])) {
              if (!t || t.length < 2) continue;
              const parts = t.split('&&').map(p => p.trim().toLowerCase());
              if (parts.every(p => ctxLower.includes(p))) { s += 30; break; }
            }
            s += (e.imp || 5) + (e.emo || 0);
            if (e.lastUpdated) s += Math.max(0, 20 - Math.floor((Date.now() - e.lastUpdated) / 86400000));
            if (e.isCurrentArc) s += 50;
            return s;
          };
          const scored = existingEntries.map(e => ({ e, s: scoreEntry(e) }));
          scored.sort((a, b) => b.s - a.s);

          const relevant = scored.filter(x => x.s >= 100).map(x => x.e);
          const topImp = scored.filter(x => x.s < 100).slice(0, Math.max(0, 40 - relevant.length)).map(x => x.e);
          filtered = [...relevant, ...topImp];
        }
        const clean = filtered.map(({ id, packName, project, enabled, ...rest }) => rest);
        entriesText = JSON.stringify(clean, null, 2);
      }
    }
    let personaPrefix = '';
    if (settings.config.autoExtIncludePersona) {
      const pName = await C.fetchPersonaName();
      if (pName) personaPrefix = `[User Persona: "${pName}"] All "user" role messages are from this character. Use "${pName}" as the character name, NOT "user".\n\n`;
    }
    const tpl = settings.getActiveTemplate();
    const promptTpl = settings.config.autoExtIncludeDb ? tpl.promptWithDb : tpl.promptWithoutDb;
    const prompt = personaPrefix + promptTpl.replace('{context}', context).replace('{entries}', entriesText).replace('{schema}', tpl.schema);

    let apiLog = null;
    try {
      const apiOpts = {
        apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
        vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
        firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
        model: settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel,
        maxRetries: settings.config.autoExtMaxRetries || 1, responseMimeType: 'application/json'
      };
      const res = await C.callGeminiApi(prompt, apiOpts);
      apiLog = { status: res.status, error: res.error, retries: res.retries };
      if (!res.text) throw new Error('AI 응답없음 (' + (res.error || '알수없음') + ')');
      const parsed = parseJsonLoose(res.text);
      if (!parsed) throw new Error('JSON 파싱 실패 (응답 스니포: ' + (res.text || '').slice(0, 100) + ')');
      if (Array.isArray(parsed) && parsed.length > 0) {
        const cnt = await mergeExtractedData(parsed, _url);
        let embedMsg = '';
        if (settings.config.embeddingEnabled && settings.config.autoEmbedOnExtract !== false) {
          try {
            const epName = await getAutoExtPackForUrl(_url);
            extBadgeShow('에리가 임베딩 갱신 중');
            const embedOpts = { ...apiOpts, model: settings.config.embeddingModel || 'gemini-embedding-001' };
            await C.embedPack(epName, embedOpts);
            embedMsg = ' (자동 임베딩 완료)';
          } catch(embErr) { console.warn('[Lore] 자동임베딩 실패:', embErr.message); embedMsg = ' (자동 임베딩 실패)'; }
        }
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: cnt, msgs: recentMsgs.length, isManual, status: '성공', api: apiLog });
        if (isManual) alert(cnt + '개 로어 추출 및 병합됨.' + embedMsg);
      } else {
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: recentMsgs.length, isManual, status: '추출 내용 없음', api: apiLog });
        if (isManual) alert('새로운 설정 정보 없음.');
      }
    } catch (err) {
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: recentMsgs.length, isManual, status: '실패', error: err.message, api: apiLog });
      if (isManual) alert('추출 실패: ' + err.message);
    }
  }

  Object.assign(_w.__LoreInj, {
    mergeExtractedData, runAutoExtract,
    extBadgeShow, extBadgeHide,
    __extractLoaded: true
  });
  console.log('[LoreInj:4] extract loaded');
})();
