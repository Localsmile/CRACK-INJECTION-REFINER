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
    addExtLog, setPackEnabled,
    DEFAULT_TEMPORAL_EXTRACT_PROMPT,
    DEFAULT_TEMPORAL_EXTRACT_SCHEMA
  } = _w.__LoreInj;

  function normalizeEntryForMerge(entry, turn) {
    if (C.normalizeLoreEntry) return C.normalizeLoreEntry(entry, { turn, source: 'auto_extracted' });
    return entry;
  }

  function mergeArrayUnique(a, b) {
    return Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean)));
  }

  function mergeCallState(existing, incoming) {
    if (!incoming || typeof incoming !== 'object') return existing;
    const base = existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : {};
    for (const [k, v] of Object.entries(incoming)) {
      if (!base[k]) base[k] = v;
      else if (typeof base[k] === 'object' && typeof v === 'object') base[k] = { ...base[k], ...v };
      else base[k] = v;
    }
    return base;
  }

  function mergeInject(existing, incoming, name, state) {
    if (!incoming || typeof incoming !== 'object') return existing;
    const base = existing && typeof existing === 'object' ? JSON.parse(JSON.stringify(existing)) : {};
    const merged = C.mergeLoreSummary ? C.mergeLoreSummary(base, incoming, name, state) : null;
    return {
      full: merged ? merged.full : (incoming.full || base.full || ''),
      compact: merged ? merged.compact : (incoming.compact || base.compact || ''),
      micro: incoming.micro || base.micro || ''
    };
  }

  function selectExistingForContext(entries, context, limit) {
    const ctx = String(context || '').toLowerCase();
    const lim = limit || 50;
    const scoreOne = (e) => {
      let s = 0;
      const name = String(e.name || '').toLowerCase();
      const hay = [
        e.name,
        ...(e.triggers || []),
        e.embed_text || '',
        ...(e.entities || []),
        ...(e.parties || []),
        ...((e.detail && e.detail.parties) || [])
      ].join(' ').toLowerCase();
      if (name && ctx.includes(name)) s += 120;
      for (const t of (e.triggers || [])) {
        if (!t || t.length < 2) continue;
        const parts = String(t).split('&&').map(p => p.trim().toLowerCase()).filter(Boolean);
        if (parts.length && parts.every(p => ctx.includes(p))) { s += parts.length > 1 ? 80 : 30; break; }
      }
      if (e.anchor) s += 100;
      if (e.isCurrentArc) s += 60;
      if (e.type === 'rel' || e.type === 'relationship' || e.type === 'prom' || e.type === 'promise') s += 30;
      s += (e.imp || 5) + (e.emo || 0) + (e.sur || 0);
      if (e.lastUpdated) s += Math.max(0, 30 - Math.floor((Date.now() - e.lastUpdated) / 86400000));
      if (hay && ctx && hay.split(/\s+/).some(w => w.length >= 2 && ctx.includes(w))) s += 10;
      return s;
    };
    return [...(entries || [])].map(e => ({ e, s: scoreOne(e) })).sort((a,b) => b.s - a.s).slice(0, lim).map(x => x.e);
  }

  function normalizeTemporalCandidates(parsed, limit) {
    let arr = parsed;
    if (arr && !Array.isArray(arr) && Array.isArray(arr.events)) arr = arr.events;
    if (arr && !Array.isArray(arr) && Array.isArray(arr.entries)) arr = arr.entries;
    if (!Array.isArray(arr)) return [];
    const max = Math.max(1, limit || 5);
    const clamp10 = (v, fb) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return fb;
      return Math.max(1, Math.min(10, Math.round(n)));
    };
    return arr
      .filter(e => e && typeof e === 'object')
      .map(e => {
        const title = e.title || e.name || e.summary?.micro || e.summary?.compact || 'timeline event';
        // Phase 11 gate compatibility: derive imp/emo/sur from importance/emotional/surprise/confidence so timeline events pass mergeExtractedData gating.
        const impBase = e.imp != null ? e.imp : e.importance;
        const emoBase = e.emo != null ? e.emo : e.emotional;
        const surBase = e.sur != null ? e.sur : (e.surprise != null ? e.surprise : (e.confidence != null ? Number(e.confidence) * 10 : null));
        const imp = clamp10(impBase, 6);
        const emo = clamp10(emoBase, 5);
        const sur = clamp10(surBase, 6);
        return {
          ...e,
          type: C.TIMELINE_EVENT_TYPE || 'timeline_event',
          title,
          name: e.name || title,
          imp, emo, sur,
          gs: imp + emo + sur,
          source: e.source || 'temporal_extracted'
        };
      })
      .filter(e => e.name)
      .slice(0, max);
  }

  async function runTemporalExtractPass(opts = {}) {
    if (settings.config.temporalExtractEnabled === false) return { count: 0, skipped: true };
    const context = opts.context || '';
    const apiOpts = opts.apiOpts || {};
    const url = opts.url || C.getCurUrl();
    const chatKey = opts.chatKey || getChatKey();
    const isManual = !!opts.isManual;
    const msgCount = opts.msgCount || 0;
    const promptTpl = settings.config.temporalExtractPrompt || DEFAULT_TEMPORAL_EXTRACT_PROMPT;
    const schema = settings.config.temporalExtractSchema || DEFAULT_TEMPORAL_EXTRACT_SCHEMA;
    if (!promptTpl || !schema || !context) return { count: 0, skipped: true };

    let apiLog = null;
    try {
      const prompt = promptTpl.replace('{context}', context).replace('{schema}', schema);
      const res = await C.callGeminiApi(prompt, { ...apiOpts, responseMimeType: 'application/json' });
      apiLog = { status: res.status, error: res.error, retries: res.retries };
      if (!res.text) throw new Error('시간축 AI 응답없음 (' + (res.error || '알수없음') + ')');
      const parsed = parseJsonLoose(res.text);
      const events = normalizeTemporalCandidates(parsed, settings.config.temporalMaxEventsPerPass || 5);
      if (!events.length) {
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: msgCount, isManual, status: '시간축 추출 내용 없음', api: apiLog });
        return { count: 0, empty: true };
      }
      const count = await mergeExtractedData(events, url);
      let embedMsg = '';
      if (count > 0 && settings.config.embeddingEnabled && settings.config.autoEmbedOnExtract !== false) {
        try {
          const epName = await getAutoExtPackForUrl(url);
          extBadgeShow('에리가 시간축 임베딩 갱신 중');
          const embedOpts = { ...apiOpts, model: settings.config.embeddingModel || 'gemini-embedding-001' };
          await C.embedPack(epName, embedOpts);
          embedMsg = ' / 임베딩 완료';
        } catch(embErr) {
          console.warn('[Lore] 시간축 자동임베딩 실패:', embErr.message);
          embedMsg = ' / 임베딩 실패';
        }
      }
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count, msgs: msgCount, isManual, status: '시간축 추출 성공' + embedMsg, api: apiLog });
      return { count, events };
    } catch (err) {
      console.warn('[Lore:temporal] 추출 실패:', err);
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: msgCount, isManual, status: '시간축 추출 실패', error: err.message || String(err), api: apiLog });
      return { count: 0, error: err.message || String(err) };
    }
  }

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
    for (let e of entries) {
      if (!e.name) continue;
      e = normalizeEntryForMerge(e, getTurnCounter(chatKey));
      e.gs = (e.imp || 5) + (e.sur || 5) + (e.emo || 5);
      if (settings.config.importanceGating !== false) {
        if (e.gs < (settings.config.importanceThreshold || 12)) continue;
        e.gateScore = e.gs;
      }
      processedCount++;
      const TL_TYPE_MERGE = C.TIMELINE_EVENT_TYPE || 'timeline_event';
      // Phase 12: timeline_event는 stable id / when.anchor / type 매칭으로 분리해 일반 lore와 의도치 않게 합쳐지지 않게 한다.
      if (e.type === TL_TYPE_MERGE && C.stableTimelineEventId && !e.eventId) {
        try { e.eventId = C.stableTimelineEventId(e); } catch(_) {}
      }
      let existing;
      if (e.type === TL_TYPE_MERGE) {
        const _tlId = e.eventId || (C.stableTimelineEventId ? (function(){ try { return C.stableTimelineEventId(e); } catch(_) { return null; } })() : null);
        if (_tlId) {
          existing = await db.entries.where('packName').equals(packName).and(x => {
            if (x.type !== TL_TYPE_MERGE) return false;
            if (x.eventId === _tlId) return true;
            try { return !!(C.stableTimelineEventId && C.stableTimelineEventId(x) === _tlId); } catch(_) { return false; }
          }).first();
        }
        if (!existing) {
          const _wa = e.when && e.when.anchor ? String(e.when.anchor) : '';
          existing = await db.entries.where('packName').equals(packName).and(x => x.type === TL_TYPE_MERGE && x.name === e.name && (_wa ? (x.when && x.when.anchor === _wa) : true)).first();
        }
      } else {
        existing = await db.entries.where('packName').equals(packName).and(x => x.name === e.name && x.type !== TL_TYPE_MERGE).first();
      }
      // Phase 12: timeline_event union merge backup — 일반 머지 흐름이 단순 spread로 union 필드를 덮어쓰는 것을 방지.
      // Phase 13-fix: anchor 보호된 timeline_event는 union backup도 건너뛴다 (anchor 무결성 우선; participants/hooks 등도 anchor snap이 그대로 보존).
      let _tlMergeBackup = null;
      if (existing && e.type === TL_TYPE_MERGE && existing.anchor !== true) {
        const _mergeArr = (a, b) => Array.from(new Set([...(Array.isArray(a)?a:[]), ...(Array.isArray(b)?b:[])].filter(Boolean)));
        _tlMergeBackup = {
          participants: _mergeArr(existing.participants, e.participants),
          hooks: _mergeArr(existing.hooks, e.hooks),
          recallTriggers: _mergeArr(existing.recallTriggers, e.recallTriggers),
          linkedLore: _mergeArr(existing.linkedLore, e.linkedLore),
          actions: _mergeArr(existing.actions, e.actions),
          when: { ...(existing.when || {}), ...(e.when || {}) }
        };
      }
      if (existing) {
        existing = normalizeEntryForMerge(existing, getTurnCounter(chatKey));
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
          callState: existing.callState ? JSON.parse(JSON.stringify(existing.callState)) : undefined,
          callHistory: existing.callHistory ? JSON.parse(JSON.stringify(existing.callHistory)) : undefined,
          inject: existing.inject ? JSON.parse(JSON.stringify(existing.inject)) : undefined,
          timeline: existing.timeline ? JSON.parse(JSON.stringify(existing.timeline)) : undefined,
          entities: existing.entities ? JSON.parse(JSON.stringify(existing.entities)) : undefined,
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
        if (e.inject) existing.inject = mergeInject(existing.inject, e.inject, existing.name, e.state || existing.state);
        if (e.state !== undefined) existing.state = e.state;
        if (e.call) existing.call = { ...(existing.call || {}), ...e.call };
        if (e.callState) existing.callState = mergeCallState(existing.callState, e.callState);
        if (e.timeline) existing.timeline = { ...(existing.timeline || {}), ...e.timeline };
        if (e.entities) existing.entities = mergeArrayUnique(existing.entities, e.entities);
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
              summary: {
                full: `${existing.name} 과거 이벤트 ${oldEvents.length}건: ${oldEvents.slice(-3).map(ev => `t${ev.turn}:${ev.summary}`).join(' / ')}`,
                compact: `${existing.name} 과거 이벤트 ${oldEvents.length}건`,
                micro: `${existing.name}=과거`
              },
              timeline: { eventTurn: lastTurn, relativeOrder: 'past', sceneLabel: 'archived shard', observedRecency: 'old' },
              entities: existing.entities || existing.parties || existing.detail?.parties || [],
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
          if (e.summary) existing.summary = C.mergeLoreSummary ? C.mergeLoreSummary(existing.summary, e.summary, existing.name, e.state || existing.state) : e.summary;
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
          if (e.summary) existing.summary = C.mergeLoreSummary ? C.mergeLoreSummary(existing.summary, e.summary, existing.name, e.state || existing.state) : e.summary;
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
        // Phase 12: timeline_event 전용 union merge 결과 복원 (일반 머지가 덮어쓴 union 필드 회복).
        if (_tlMergeBackup) {
          if (_tlMergeBackup.participants && _tlMergeBackup.participants.length) existing.participants = _tlMergeBackup.participants;
          if (_tlMergeBackup.hooks && _tlMergeBackup.hooks.length) existing.hooks = _tlMergeBackup.hooks;
          if (_tlMergeBackup.recallTriggers && _tlMergeBackup.recallTriggers.length) existing.recallTriggers = _tlMergeBackup.recallTriggers;
          if (_tlMergeBackup.linkedLore && _tlMergeBackup.linkedLore.length) existing.linkedLore = _tlMergeBackup.linkedLore;
          if (_tlMergeBackup.actions && _tlMergeBackup.actions.length) existing.actions = _tlMergeBackup.actions;
          if (_tlMergeBackup.when && Object.keys(_tlMergeBackup.when).length) existing.when = _tlMergeBackup.when;
        }
        try { if (C.normalizeTemporalGraph) existing = C.normalizeTemporalGraph(existing, { currentTurn: getTurnCounter(chatKey), sceneId: chatKey }); } catch(_) {}
        try { if (C.invalidateEntryEmbeddings) await C.invalidateEntryEmbeddings(existing.id); } catch(_) {}
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
        try { if (C.normalizeTemporalGraph) e = C.normalizeTemporalGraph(e, { currentTurn: getTurnCounter(chatKey), sceneId: chatKey }); } catch(_) {}
        await db.entries.put(e); addedCount++;
      }
    }
    if (processedCount > 0) {
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
          filtered = selectExistingForContext(existingEntries, context, 50);
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
      if (settings.config.temporalExtractEnabled !== false) {
        await runTemporalExtractPass({ context, apiOpts, url: _url, chatKey, isManual, msgCount: recentMsgs.length });
      }
    } catch (err) {
      addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: recentMsgs.length, isManual, status: '실패', error: err.message, api: apiLog });
      if (isManual) alert('추출 실패: ' + err.message);
    }
  }

  async function runBatchExtract(opts = {}) {
    const turnsPerBatch = opts.turnsPerBatch || 50;
    const overlap = opts.overlap !== undefined ? opts.overlap : 5;
    const maxAttempts = opts.maxAttempts || 3;
    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    const _url = C.getCurUrl(); const chatKey = getChatKey();
    const apiType = settings.config.autoExtApiType || 'key';
    const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson
                  : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript
                  : !settings.config.autoExtKey;
    if (missing) throw new Error('API 설정 미완료');

    extBadgeShow('에리가 전체 로그 가져오는 중');
    const allMsgs = await C.fetchLogs(99999);
    if (!allMsgs || !allMsgs.length) { extBadgeHide(); throw new Error('대화 기록 없음'); }
    const totalMsgs = allMsgs.length;
    const batchMsgSize = Math.max(2, turnsPerBatch * 2);
    const overlapMsgs = Math.max(0, overlap * 2);
    const step = Math.max(1, batchMsgSize - overlapMsgs);
    const batches = [];
    for (let i = 0; i < totalMsgs; i += step) {
      const slice = allMsgs.slice(i, i + batchMsgSize);
      if (slice.length < 2) break;
      batches.push(slice);
      if (i + batchMsgSize >= totalMsgs) break;
    }

    const report = { totalBatches: batches.length, totalMsgs, ok: 0, failed: 0, empty: 0, entriesAdded: 0, batchResults: [] };

    let personaPrefix = '';
    if (settings.config.autoExtIncludePersona) {
      try {
        const pName = await C.fetchPersonaName();
        if (pName) personaPrefix = '[User Persona: "' + pName + '"] All "user" role messages are from this character. Use "' + pName + '" as the character name, NOT "user".\n\n';
      } catch(e) {}
    }
    const tpl = settings.getActiveTemplate();
    const promptTpl = settings.config.autoExtIncludeDb ? tpl.promptWithDb : tpl.promptWithoutDb;

    for (let bi = 0; bi < batches.length; bi++) {
      const msgs = batches[bi];
      extBadgeShow('에리가 배치 ' + (bi + 1) + '/' + batches.length + ' 분석 중');
      if (onProgress) { try { onProgress({ phase: 'batch', index: bi + 1, total: batches.length }); } catch(_){} }

      const context = msgs.map(m => m.role + ': ' + m.message).join('\n');
      let entriesText = '[]';
      if (settings.config.autoExtIncludeDb) {
        const packName = await getAutoExtPackForUrl(_url);
        const existing = await db.entries.where('packName').equals(packName).toArray();
        if (existing.length > 0) {
          const filtered = existing.length > 40 ? selectExistingForContext(existing, context, 50) : existing;
          const clean = filtered.map(({ id, packName, project, enabled, ...rest }) => rest);
          entriesText = JSON.stringify(clean, null, 2);
        }
      }
      const prompt = personaPrefix + promptTpl.replace('{context}', context).replace('{entries}', entriesText).replace('{schema}', tpl.schema);

      let ok = false; let status = 'failed'; let lastErr = ''; let rawSnippet = ''; let attempts = 0; let mergedCount = 0;
      for (let attempt = 0; attempt < maxAttempts && !ok; attempt++) {
        attempts++;
        try {
          const apiOpts = {
            apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
            vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
            firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
            model: settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel,
            maxRetries: 0, responseMimeType: 'application/json'
          };
          const res = await C.callGeminiApi(prompt, apiOpts);
          if (!res || !res.text) { lastErr = 'API 응답 없음 (' + ((res && res.error) || '알 수 없음') + ')'; continue; }
          rawSnippet = String(res.text).slice(0, 200);
          const parsed = parseJsonLoose(res.text);
          if (!parsed) { lastErr = 'JSON 파싱 실패 | 응답 스니핏: ' + rawSnippet; continue; }
          if (Array.isArray(parsed) && parsed.length > 0) {
            mergedCount = await mergeExtractedData(parsed, _url);
            report.entriesAdded += mergedCount;
            status = 'ok'; ok = true;
          } else {
            status = 'empty'; ok = true;
          }
        } catch (e) { lastErr = '예외: ' + (e.message || String(e)); }
      }
      if (ok) {
        if (status === 'empty') report.empty++; else report.ok++;
        report.batchResults.push({ batch: bi + 1, status, attempts, entries: mergedCount });
        // Phase 11: per-batch temporal pass so batch extraction also harvests timeline events.
        if (settings.config.temporalExtractEnabled !== false) {
          try {
            const tApiOpts = {
              apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
              vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
              firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
              model: settings.config.autoExtModel === '_custom' ? settings.config.autoExtCustomModel : settings.config.autoExtModel,
              maxRetries: 0, responseMimeType: 'application/json'
            };
            const tres = await runTemporalExtractPass({ context, apiOpts: tApiOpts, url: _url, chatKey, isManual: true, msgCount: msgs.length });
            if (tres && tres.count) {
              report.entriesAdded += tres.count;
              report.batchResults.push({ batch: bi + 1, status: 'temporal_ok', attempts: 1, entries: tres.count });
            } else if (tres && tres.error) {
              report.batchResults.push({ batch: bi + 1, status: 'temporal_failed', attempts: 1, error: tres.error });
            }
          } catch (terr) {
            console.warn('[Lore:batch] 시간축 추출 실패 (배치 ' + (bi + 1) + '):', terr.message || terr);
            report.batchResults.push({ batch: bi + 1, status: 'temporal_failed', attempts: 1, error: terr.message || String(terr) });
          }
        }
      } else {
        report.failed++;
        report.batchResults.push({ batch: bi + 1, status: 'failed', attempts, error: lastErr, rawSnippet });
        console.warn('[Lore:batch] 배치 ' + (bi + 1) + '/' + batches.length + ' 실패 (' + attempts + '회): ' + lastErr);
        addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: 0, msgs: msgs.length, isManual: true, status: '배치 ' + (bi + 1) + '/' + batches.length + ' 실패', error: lastErr });
      }
    }

    addExtLog(chatKey, { time: new Date().toLocaleTimeString(), count: report.entriesAdded, msgs: totalMsgs, isManual: true, status: '전체 추출 완료 (성공 ' + report.ok + ' / 빈 ' + report.empty + ' / 실패 ' + report.failed + ' / ' + report.totalBatches + '개 배치, 병합 ' + report.entriesAdded + '건)' });

    if (settings.config.embeddingEnabled && settings.config.autoEmbedOnExtract !== false && report.entriesAdded > 0) {
      try {
        const epName = await getAutoExtPackForUrl(_url);
        extBadgeShow('에리가 임베딩 갱신 중');
        const embedOpts = {
          apiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson,
          vertexLocation: settings.config.autoExtVertexLocation || 'global', vertexProjectId: settings.config.autoExtVertexProjectId,
          firebaseScript: settings.config.autoExtFirebaseScript, firebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
          model: settings.config.embeddingModel || 'gemini-embedding-001'
        };
        await C.embedPack(epName, embedOpts);
        report.embedded = true;
      } catch(embErr) {
        console.warn('[Lore:batch] 임베딩 실패:', embErr.message);
        report.embedError = embErr.message;
      }
    }
    extBadgeHide();
    return report;
  }

  Object.assign(_w.__LoreInj, {
    mergeExtractedData, runAutoExtract, runBatchExtract, runTemporalExtractPass,
    extBadgeShow, extBadgeHide,
    __extractLoaded: true
  });
  console.log('[LoreInj:4] extract loaded');
})();
