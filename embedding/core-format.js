// crack-lore-core / format 모듈
// 역할: 엔트리 직렬화(full/compact/micro), 예산 기반 포맷터, 조립 유틸
// 의존: kernel.DEFAULTS
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore;
  if (!C || !C.__kernelLoaded) { console.error('[LoreCore:format] kernel 미로드'); return; }
  if (C.__formatLoaded) return;
  const DEFAULTS = C.DEFAULTS;

  function charLen(s) { return [...String(s || '')].length; }

  function summaryTier(e, level = 'compact') {
    const s = e && e.summary;
    if (!s) return '';
    if (typeof s === 'object' && !Array.isArray(s)) return String(s[level] || s.full || s.compact || s.micro || '');
    return String(s || '');
  }

  function callStatePairs(e, limit = 2) {
    const cs = e && e.callState;
    if (!cs || typeof cs !== 'object') return '';
    const out = [];
    for (const [k, v] of Object.entries(cs)) {
      if (!v) continue;
      const term = typeof v === 'string' ? v : (v.currentTerm || v.term || '');
      if (!term) continue;
      const scope = typeof v === 'object' && v.scope ? '@' + v.scope : '';
      out.push(`${k}:${term}${scope}`);
      if (out.length >= limit) break;
    }
    return out.join('/');
  }

  const TYPE_ABBR = { character:'Char', identity:'Char', relationship:'Rel', promise:'Prom', location:'Loc', event:'Evt', item:'Item', concept:'Sys', setting:'Sys' };

  function cfFull(e) {
    if (e.inject?.full) {
      let line = `[${e.name}|${e.state || e.type}] ${e.inject.full}`;
      if (e.call) {
        const pairs = Object.entries(e.call).map(([k,v]) => `${k}:${v}`).join('/');
        line += ` Call:${pairs}`;
      } else {
        const cs = callStatePairs(e);
        if (cs) line += ` Call:${cs}`;
      }
      return line;
    }
    const d = e.detail || {}; const abbr = TYPE_ABBR[e.type] || ''; const status = d.current_status || d.status || '';
    let line = abbr ? '[' + abbr + ':' + e.name : '[' + e.name;
    if (status) line += '|' + status; line += ']';
    const fullSummary = summaryTier(e, 'full');
    if (fullSummary) { const sum = charLen(fullSummary) > 90 ? [...fullSummary].slice(0, 87).join('') + '...' : fullSummary; line += ' ' + sum; }
    if (d.nicknames && typeof d.nicknames === 'object') {
      const pairs = Object.entries(d.nicknames);
      if (pairs.length > 0) {
        const nk = pairs.map(([k,v]) => { const m = k.match(/^(.+?)→(.+?)$/); return m ? m[1] + '->' + m[2] + ':' + v : k + ':' + v; }).join(', ');
        line += ' Call:' + nk;
      }
    }
    if (e.type === 'promise' && d.condition) line += ' Cond:' + ([...d.condition].slice(0, 25).join(''));
    return line;
  }

  function cfCompact(e) {
    if (e.inject?.compact) return `${e.name}|${e.state || ''}: ${e.inject.compact}`;
    const d = e.detail || {}; const status = d.current_status || d.status || '';
    let line = e.name; if (status) line += '|' + status; line += ':';
    const compactSummary = summaryTier(e, 'compact');
    if (compactSummary) { const sum = charLen(compactSummary) > 45 ? [...compactSummary].slice(0, 42).join('') + '...' : compactSummary; line += ' ' + sum; }
    if (d.nicknames && typeof d.nicknames === 'object') {
      const vals = Object.entries(d.nicknames);
      if (vals.length > 0) { const nk = vals.map(([k,v]) => v).join('/'); line += ' Call:' + nk; }
    }
    if (e.type === 'promise' && d.status) line += '[' + d.status + ']';
    return line;
  }

  function cfMicro(e) {
    if (e.inject?.micro) return e.inject.micro;
    const d = e.detail || {}; const microSummary = summaryTier(e, 'micro'); const val = d.current_status || d.status || (microSummary ? [...microSummary].slice(0, 25).join('') : e.type);
    let hon = ''; if (d.nicknames && typeof d.nicknames === 'object') { const vals = Object.values(d.nicknames); if (vals.length > 0) hon = '/' + vals[0]; }
    return e.name + '=' + val + hon;
  }

  function bundleGroupKey(e, activeNames) {
    if (e.type === 'character' || e.type === 'identity') return e.name;
    if (e.type === 'rel' || e.type === 'relationship') {
      let parties = e.parties || e.detail?.parties;
      if ((!parties || parties.length < 2) && typeof e.name === 'string') {
        if (e.name.includes('↔')) parties = e.name.split('↔').map(s => s.trim()).filter(Boolean);
        else if (e.name.includes('&')) parties = e.name.split('&').map(s => s.trim()).filter(Boolean);
      }
      if (parties && parties.length) {
        const hit = parties.find(p => (activeNames||[]).some(n => n === p || p.includes(n) || n.includes(p)));
        return hit || parties[0];
      }
    }
    if (e.type === 'promise' || e.type === 'prom') {
      if (typeof e.name === 'string') {
        const m = e.name.match(/^([^:\[→—-]+)/);
        if (m) return m[1].trim();
      }
    }
    return e.name;
  }

  function entryPriority(e, idx = 0, activeNames = []) {
    let s = Number(e.score || 0) * 100;
    s += (e.imp || 5) * 3 + (e.emo || 5) * 2 + (e.sur || 5);
    if (e.anchor) s += 1000;
    if (e.type === 'promise' || e.type === 'prom') s += 80;
    if (e.type === 'relationship' || e.type === 'rel') s += 60;
    if (e.state === 'pending' || e.detail?.status === 'pending') s += 40;
    if (e.callState || e.call) s += 25;
    if (Array.isArray(e.eventHistory) && e.eventHistory.length) s += 20;
    if (e.isCurrentArc) s += 25;
    if (e._nway) s += ((e._nway.unresolved || 0) * 50) + ((e._nway.activeEntity || 0) * 35) + ((e._nway.relationshipGraph || 0) * 35) + ((e._nway.temporal || 0) * 25);
    const ents = Array.isArray(e.entities) ? e.entities : (e.parties || e.detail?.parties || []);
    if (activeNames.length && ents.some(x => activeNames.some(n => x === n || String(x).includes(n) || String(n).includes(x)))) s += 45;
    return s - idx * 2;
  }

  function formatEntryAtLevel(e, level) {
    if (level === 'full') return cfFull(e);
    if (level === 'compact') return cfCompact(e);
    return cfMicro(e);
  }

  function buildLoreBudgetPlan(entries, budget, config = {}, opts = {}) {
    const activeNames = opts.activeNames || [];
    const ordered = entries.map((e, i) => ({ e, i, p: entryPriority(e, i, activeNames) })).sort((a, b) => b.p - a.p);
    const lines = [], included = [], downgraded = [], dropped = [];
    let used = 0;
    for (const row of ordered) {
      const preferred = row.p >= 120 ? 'full' : (row.p >= 75 ? 'compact' : 'micro');
      const levels = preferred === 'full' ? ['full', 'compact', 'micro'] : (preferred === 'compact' ? ['compact', 'micro'] : ['micro']);
      let picked = null, pickedLevel = null;
      for (const level of levels) {
        const line = formatEntryAtLevel(row.e, level);
        const len = charLen(line);
        if (line && used + len + 1 <= budget) { picked = line; pickedLevel = level; break; }
      }
      if (picked) {
        lines.push(picked); included.push(row.e); used += charLen(picked) + 1;
        if (pickedLevel !== preferred) downgraded.push({ name: row.e.name, from: preferred, to: pickedLevel });
      } else {
        dropped.push({ name: row.e.name, reason: 'budget' });
      }
    }
    const level = included.length ? (downgraded.length ? 'planned+downgraded' : 'planned') : 'none';
    return { text: lines.join('\n'), included, usedChars: used, level, downgraded, dropped, budgetPlan: { loreBudget: budget, used, candidates: entries.length, included: included.length, dropped: dropped.length } };
  }

  function trimToBudget(text, budget) {
    text = String(text || '');
    if (charLen(text) <= budget) return text;
    if (budget <= 3) return '';
    return [...text].slice(0, budget - 3).join('') + '...';
  }

  function planInjectionBudget(opts) {
    const {
      userInput = '', maxInputChars = 2000, entries = [], activeNames = [], unmetPairs = [],
      sceneTag = '', firstEncounterBlock = '', reunionTags = '', honorifics = '', temporalHints = '',
      config = {}, prefix = DEFAULTS.prefix, suffix = DEFAULTS.suffix
    } = opts || {};
    const userChars = charLen(userInput);
    const wrapperOverhead = charLen('\n' + prefix + '\n' + '\n' + suffix + '\n') + 2;
    let available = maxInputChars - userChars - wrapperOverhead;
    const result = { text: '', injected: '', included: [], usedChars: 0, level: 'none', downgraded: [], dropped: [], budgetPlan: {}, finalChars: userChars, reason: '' };
    if (available < 20) { result.reason = 'no_space_after_user_and_wrapper'; return result; }

    const sections = [];
    const addSection = (key, text, max) => {
      if (!text || available <= 0) return 0;
      const capped = trimToBudget(text, Math.min(max, available));
      if (!capped) return 0;
      sections.push({ key, text: capped });
      const used = charLen(capped) + 1;
      available -= used;
      return used;
    };

    addSection('scene', sceneTag, config.sceneTagChars || 90);
    addSection('firstEncounter', firstEncounterBlock, config.firstEncounterChars || 240);
    addSection('reunion', reunionTags, config.reunionTagChars || 140);
    addSection('honorifics', honorifics, config.honorificMatrixChars || DEFAULTS.honorificMatrixChars || 80);
    addSection('temporal', temporalHints, config.temporalHintChars || DEFAULTS.temporalHintChars || 180);

    const maxLoreBudget = Math.min(available, config.loreBudgetMax || DEFAULTS.loreBudgetMax || 600);
    let loreBudget = Math.max(0, maxLoreBudget);
    let lore = buildLoreBudgetPlan(entries, loreBudget, config, { activeNames, unmetPairs });
    let body = [...sections.map(x => x.text), lore.text].filter(Boolean).join('\n');
    let injected = body ? '\n' + prefix + '\n' + body + '\n' + suffix + '\n' : '';
    let finalChars = userChars + charLen(injected) + 2;

    while (finalChars > maxInputChars && loreBudget > 0) {
      loreBudget = Math.max(0, loreBudget - Math.max(40, finalChars - maxInputChars));
      lore = buildLoreBudgetPlan(entries, loreBudget, config, { activeNames, unmetPairs });
      body = [...sections.map(x => x.text), lore.text].filter(Boolean).join('\n');
      injected = body ? '\n' + prefix + '\n' + body + '\n' + suffix + '\n' : '';
      finalChars = userChars + charLen(injected) + 2;
    }

    if (finalChars > maxInputChars) {
      lore = { text: '', included: [], usedChars: 0, level: 'critical-only', downgraded: [], dropped: entries.map(e => ({ name: e.name, reason: 'critical_sections_only' })), budgetPlan: { loreBudget: 0, used: 0, candidates: entries.length, included: 0, dropped: entries.length } };
      body = sections.map(x => x.text).filter(Boolean).join('\n');
      injected = body ? '\n' + prefix + '\n' + body + '\n' + suffix + '\n' : '';
      finalChars = userChars + charLen(injected) + 2;
    }

    if (finalChars > maxInputChars) { result.reason = 'cancel_over_limit'; return result; }

    const sectionChars = {};
    for (const s of sections) sectionChars[s.key] = charLen(s.text);
    return {
      text: body,
      injected,
      included: lore.included,
      usedChars: charLen(body),
      level: lore.level,
      downgraded: lore.downgraded,
      dropped: lore.dropped,
      budgetPlan: { ...lore.budgetPlan, userChars, wrapperOverhead, availableAfterCritical: available, finalChars, maxInputChars },
      finalChars,
      reason: lore.included.length ? 'ok' : (body ? 'critical_only' : 'empty'),
      sections: sectionChars,
      bundledCount: 0
    };
  }

  function adaptiveFormat(opts) {
    const { entries: rawEntries = [], activeNames = [], unmetPairs = [], honorifics = '', budget = 350, config = {} } = opts;
    if (!rawEntries.length || budget < 30) return { text: '', included: [], usedChars: 0, level: 'none', bundledCount: 0 };
    // Bundling: 같은 주체(활성 캐릭터/당사자) 엔트리를 인접 배치.
    let entries = rawEntries;
    let bundledCount = 0;
    if (config.bundleByEntity !== false) {
      const order = []; const groups = new Map();
      for (const e of rawEntries) {
        const k = bundleGroupKey(e, activeNames);
        if (!groups.has(k)) { groups.set(k, []); order.push(k); }
        groups.get(k).push(e);
      }
      const ordered = [];
      for (const k of order) for (const e of groups.get(k)) ordered.push(e);
      entries = ordered;
      bundledCount = entries.length - order.length;
    }
    const parts = []; let remaining = budget;
    if (honorifics && config.honorificMatrixEnabled !== false) {
      const hB = Math.min(Math.floor(remaining * 0.2), 80);
      let hT = honorifics;
      if (charLen(hT) > hB) hT = [...hT].slice(0, hB - 3).join('') + '...';
      parts.push(hT); remaining -= charLen(hT) + 1;
    }
    if (config.firstEncounterWarning !== false && unmetPairs.length) {
      const fB = Math.floor(remaining * 0.1); let fUsed = 0;
      for (const [a, b] of unmetPairs) {
        const tag = '[Unmet:' + a + '&' + b + ']'; const tl = charLen(tag);
        if (fUsed + tl > fB) break; parts.push(tag); fUsed += tl + 1;
      }
      remaining -= fUsed;
    }
    const included = []; const loreParts = []; let loreUsed = 0;
    const cmpMode = (config.useCompressedFormat === false || config.autoCompression === false) ? 'full' : (config.compressionMode || 'auto');
    let level = cmpMode;

    if (cmpMode === 'auto' || cmpMode === 'full') {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const tag = (i < entries.length * 0.25 || i === 0) ? '[!] ' : '';
        const line = tag + cfFull(e); const len = charLen(line);
        if (loreUsed + len + 1 > remaining) break;
        loreParts.push(line); included.push(e); loreUsed += len + 1;
      }
    }
    const rem1 = entries.slice(included.length);
    if (rem1.length > 0 && (cmpMode === 'auto' || cmpMode === 'compact') && remaining - loreUsed > 30) {
      if (cmpMode === 'auto') level = 'mixed';
      for (const e of rem1) {
        const line = cfCompact(e); const len = charLen(line);
        if (loreUsed + len + 1 > remaining) break;
        loreParts.push(line); included.push(e); loreUsed += len + 1;
      }
    }
    const rem2 = entries.slice(included.length);
    if (rem2.length > 0 && (cmpMode === 'auto' || cmpMode === 'micro') && remaining - loreUsed > 15) {
      if (cmpMode === 'auto') level = 'mixed+micro';
      for (const e of rem2) {
        const line = cfMicro(e); const len = charLen(line);
        if (loreUsed + len + 1 > remaining) break;
        loreParts.push(line); included.push(e); loreUsed += len + 1;
      }
    }
    if (included.length === 0 && entries.length > 0) {
      level = 'compact';
      for (const e of entries) {
        let line = cfCompact(e); let len = charLen(line);
        if (loreUsed + len + 1 > remaining) { line = cfMicro(e); len = charLen(line); level = 'micro'; }
        if (loreUsed + len + 1 > remaining) break;
        loreParts.push(line); included.push(e); loreUsed += len + 1;
      }
    }
    if (loreParts.length > 0) parts.push(loreParts.join('\n'));
    const usedChars = budget - remaining + loreUsed;
    return { text: parts.join('\n'), included, usedChars, level, bundledCount };
  }

  // 하위 호환 포맷터
  function formatEntryFull(e) {
    if (e.inject?.full) return cfFull(e);
    const d = e.detail || {};
    let line = `[${e.name}|${d.current_status || e.type}] ${summaryTier(e, 'full') || ''}`;
    if (d.nicknames && typeof d.nicknames === 'object') {
      const nk = Object.entries(d.nicknames).map(([k, v]) => `${k}:${v}`).join('/');
      if (nk) line += ` 호칭:${nk}`;
    }
    if (d.cause) line += ` ←${d.cause}`;
    if (e.type === 'promise' && d.condition) line += ` 조건:${d.condition}`;
    if (e.type === 'promise' && d.status) line += ` [${d.status}]`;
    return line;
  }

  function formatEntryCompact(e) {
    if (e.inject?.compact) return cfCompact(e);
    const d = e.detail || {};
    let line = `[${e.name}|${d.current_status || e.type}]`;
    const compactSummary = summaryTier(e, 'compact');
    if (compactSummary) line += ` ${compactSummary.slice(0, 50)}`;
    if (e.type === 'promise' && d.status) line += ` [${d.status}]`;
    return line;
  }

  function formatEntryMicro(e) {
    if (e.inject?.micro) return cfMicro(e);
    const d = e.detail || {};
    return `${e.name}:${(d.current_status || summaryTier(e, 'micro') || e.type).slice(0, 25)}`;
  }

  function budgetFormat(entries, budget, config) {
    if (!entries.length) return '';
    const target = config?.targetCharsPerEntry || DEFAULTS.targetCharsPerEntry;
    let level;
    if (config?.autoCompression !== false) {
      const avgBudget = budget / entries.length;
      if (avgBudget >= target.full) level = 'full';
      else if (avgBudget >= target.compact) level = 'compact';
      else level = 'micro';
    } else { level = 'compact'; }
    const formatter = { full: formatEntryFull, compact: formatEntryCompact, micro: formatEntryMicro }[level];
    const lines = []; let used = 0;
    for (const e of entries) {
      const line = formatter(e);
      if (used + line.length > budget) break;
      lines.push(line);
      used += line.length + 1;
    }
    return lines.join('\n');
  }

  function assembleInjection(opts) {
    const { entries = [], activeNames = [], unmetPairs = [], sceneTag = '', honorifics = '', config = {}, prefix = '', suffix = '' } = opts;
    const budget = config.loreBudgetChars || DEFAULTS.loreBudgetChars;
    const parts = []; let remaining = budget;
    if (sceneTag && config.workingMemoryEnabled !== false) { parts.push(sceneTag); remaining -= sceneTag.length + 1; }
    if (honorifics && config.workingMemoryEnabled !== false) {
      const hBudget = Math.min(remaining * 0.3, config.honorificMatrixChars || DEFAULTS.honorificMatrixChars);
      const hText = honorifics.length <= hBudget ? honorifics : honorifics.slice(0, hBudget - 3) + '...';
      parts.push(hText); remaining -= hText.length + 1;
    }
    for (const [a, b] of unmetPairs) {
      const tag = `[Unmet:${a}&${b}]`;
      if (remaining - tag.length < 50) break;
      parts.push(tag); remaining -= tag.length + 1;
    }
    if (remaining > 20 && entries.length > 0) {
      const loreText = budgetFormat(entries, remaining, config);
      if (loreText) parts.push(loreText);
    }
    const body = parts.join('\n');
    if (!body) return '';
    const pfx = prefix || config.prefix || DEFAULTS.prefix;
    const sfx = suffix || config.suffix || DEFAULTS.suffix;
    return `\n${pfx}\n${body}\n${sfx}\n`;
  }

  // 첫 만남/재회 태그
  function formatFirstEncounterBlock(pair) {
    const [a, b] = pair;
    return `[★ FIRST ENCOUNTER — ${a} × ${b} ★]\n서사상 첫 대면. 서로의 이름/외형/배경 모름.\n- 호칭은 중립어("저 사람", "당신", "~씨")만 허용\n- 이전 장면의 친밀도/별칭/내부 농담 금지\n- 자기소개는 자연스러운 흐름으로만, 첫인상 감각 묘사 1개 포함`;
  }

  function formatReunionTag(pair, gap) {
    const [a, b] = pair;
    return `[Reunion: ${a}↔${b} — ${gap}턴만에 재회. 이미 아는 사이. 처음 본 듯한 대사/자기소개 금지]`;
  }

  Object.assign(C, {
    charLen, summaryTier, callStatePairs, cfFull, cfCompact, cfMicro, adaptiveFormat, bundleGroupKey,
    entryPriority, formatEntryAtLevel, buildLoreBudgetPlan, planInjectionBudget,
    formatEntryFull, formatEntryCompact, formatEntryMicro, budgetFormat, assembleInjection,
    formatFirstEncounterBlock, formatReunionTag,
    __formatLoaded: true
  });
  console.log('[LoreCore:format] loaded');
})();
