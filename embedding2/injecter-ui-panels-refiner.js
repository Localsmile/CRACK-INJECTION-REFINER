// == 인젝터 UI 패널 — Refiner ==
// 역할: 응답 교정 설정과 수동 검수
// 의존: injecter-ui-utils.js, refiner.js, injecter-2.js settings
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:refiner] UI utils not loaded');
    return;
  }
  if (UI.__refinerPanelLoaded) return;

  function getRuntime() { return _w.__LoreInj || {}; }
  function save(settings) { if (settings && typeof settings.save === 'function') settings.save(); }

  function addToggle(nd, title, desc, value, onChange) {
    const C = UI.getCore();
    if (C && typeof C.createToggleRow === 'function') {
      nd.appendChild(C.createToggleRow(title, desc, value, onChange));
      return;
    }
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px;cursor:pointer;';
    const text = document.createElement('div');
    text.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc || ''; d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!value; cb.style.cssText = 'accent-color:#4a9;';
    cb.onchange = function(){ onChange(cb.checked); };
    text.appendChild(t); text.appendChild(d); row.appendChild(text); row.appendChild(cb); nd.appendChild(row);
  }

  function addSelect(nd, title, desc, value, options, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;';
    const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc || ''; d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    const sel = document.createElement('select'); sel.style.cssText = 'width:180px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
    options.forEach(function(opt){ const o = document.createElement('option'); o.value = opt.value; o.textContent = opt.label; sel.appendChild(o); });
    sel.value = value; sel.onchange = function(){ onChange(sel.value); };
    left.appendChild(t); left.appendChild(d); row.appendChild(left); row.appendChild(sel); nd.appendChild(row);
    return sel;
  }

  function addNumber(nd, title, desc, value, min, max, onChange) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;';
    const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
    const t = document.createElement('div'); t.textContent = title; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
    const d = document.createElement('div'); d.textContent = desc || ''; d.style.cssText = 'font-size:11px;color:#888;line-height:1.5;';
    const input = document.createElement('input'); input.type = 'number'; input.value = value; input.min = min; input.max = max;
    input.style.cssText = 'width:80px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
    input.onchange = function(){ const n = parseInt(input.value, 10); if (!isNaN(n)) onChange(n); };
    left.appendChild(t); left.appendChild(d); row.appendChild(left); row.appendChild(input); nd.appendChild(row);
    return input;
  }

  UI.registerPanel({
    id: 'refiner',
    label: '응답 교정',
    title: '응답 교정',
    order: 60,
    render: function(panel) {
      const L = getRuntime();
      const C = L.C;
      const R = L.R || _w.__LoreRefiner;
      const settings = L.settings;

      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Settings are not loaded yet.', 'error')); });
        return;
      }
      if (!R) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('Refiner module is not loaded.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Manual check', 'Recheck the latest AI response even if it was already processed.'));
        const btn = UI.createButton('Recheck latest AI response', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;line-height:1.4;';
        btn.onclick = async function() {
          if (!R.manualRefine) { alert('Refiner manual check is unavailable.'); return; }
          if (!C || !C.getCurrentChatId) { alert('Chat detection is unavailable.'); return; }
          const cid = C.getCurrentChatId();
          if (!cid) { alert('Could not detect chat room.'); return; }
          btn.disabled = true;
          const orig = btn.textContent;
          btn.textContent = 'Checking';
          status.textContent = 'Finding latest AI response';
          status.style.color = '#4a9';
          const started = Date.now();
          try {
            const lastBot = await CrackUtil.chatRoom().findLastBotMessage(cid);
            if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('No latest AI response found');
            status.textContent = 'Running Refiner';
            await R.manualRefine(lastBot.content, lastBot.id);
            status.textContent = 'Done (' + Math.floor((Date.now() - started) / 1000) + 's)';
            status.style.color = '#4a9';
            setTimeout(function(){ status.textContent = ''; }, 3000);
          } catch(e) {
            status.textContent = 'Failed: ' + String(e.message || e).slice(0, 80);
            status.style.color = '#d66';
          } finally {
            btn.textContent = orig;
            btn.disabled = false;
          }
        };
        nd.appendChild(btn);
        nd.appendChild(status);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Behavior'));

        addToggle(nd, 'Enable Refiner', 'Check AI responses against active lore and memory.', !!settings.config.refinerEnabled, function(v){
          settings.config.refinerEnabled = v;
          save(settings);
          if (v && R.setNeedsWarmup) R.setNeedsWarmup();
        });

        addToggle(nd, 'Auto apply', 'Apply corrections without opening the confirmation window.', !!settings.config.refinerAutoMode, function(v){
          settings.config.refinerAutoMode = v;
          save(settings);
        });

        addSelect(nd, 'Lore search mode', 'Keyword mode is faster. Semantic mode is broader and may use embeddings.', settings.config.refinerLoreMode || 'matchedOnly', [
          { value: 'matchedOnly', label: 'Keyword only' },
          { value: 'semantic', label: 'Semantic search' }
        ], function(v){ settings.config.refinerLoreMode = v; save(settings); });

        addSelect(nd, 'Honorific sensitivity', 'Use Low for RP. The checker should only flag direct-address mismatches that are not justified by recent context.', settings.config.refinerHonorificSensitivity || 'low', [
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' }
        ], function(v){ settings.config.refinerHonorificSensitivity = v; save(settings); });

        addNumber(nd, 'Context turns', 'How many recent turns the Refiner reads.', settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1, 0, 20, function(v){
          settings.config.refinerContextTurns = v;
          save(settings);
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Prompt template', 'Choose a built-in template, topic-based dynamic prompt, or custom prompt.'));

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-bottom:8px;';
        const tplSel = document.createElement('select');
        tplSel.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;margin-bottom:8px;';
        const promptTa = document.createElement('textarea');
        promptTa.style.cssText = 'width:100%;height:220px;padding:8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;font-family:monospace;resize:vertical;';
        promptTa.value = settings.config.refinerCustomPrompt || (R.DEFAULT_PROMPT || '');

        const addOpt = function(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; tplSel.appendChild(o); };
        addOpt('custom', 'Custom');
        if (R.TEMPLATES) Object.keys(R.TEMPLATES).forEach(function(k){ addOpt(k, R.TEMPLATES[k].name || k); });
        if (R.TOPICS && R.buildDynamicPrompt) addOpt('dynamic', 'Topic-based');

        const topicsWrap = document.createElement('div');
        topicsWrap.style.cssText = 'display:none;margin-bottom:12px;padding:10px;background:#111;border:1px solid #333;border-radius:4px;';
        const topicsTitle = document.createElement('div');
        topicsTitle.textContent = 'Topics';
        topicsTitle.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;margin-bottom:8px;';
        const topicsBody = document.createElement('div');
        topicsWrap.appendChild(topicsTitle);
        topicsWrap.appendChild(topicsBody);

        function normalize(s) { return String(s || '').trim().replace(/\s+/g, ' '); }
        function rebuildDynamicPrompt() {
          if (!R.buildDynamicPrompt) return;
          const built = R.buildDynamicPrompt(settings.config.refinerTopics || {}, settings.config);
          settings.config.refinerCustomPrompt = built;
          promptTa.value = built;
          save(settings);
        }
        function renderTopics() {
          if (!R.TOPICS) return;
          if (!settings.config.refinerTopics) {
            const def = {};
            Object.keys(R.TOPICS).forEach(function(k){ def[k] = true; });
            settings.config.refinerTopics = def;
          }
          topicsBody.innerHTML = '';
          Object.keys(R.TOPICS).forEach(function(k) {
            const meta = R.TOPICS[k];
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:5px 0;cursor:pointer;';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!settings.config.refinerTopics[k]; cb.style.cssText = 'margin-top:3px;accent-color:#4a9;';
            const text = document.createElement('div'); text.style.cssText = 'flex:1;';
            const label = document.createElement('div'); label.textContent = meta.label || k; label.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
            const d = document.createElement('div'); d.textContent = meta.desc || ''; d.style.cssText = 'font-size:10px;color:#888;line-height:1.4;';
            cb.onchange = function(){ settings.config.refinerTopics[k] = cb.checked; rebuildDynamicPrompt(); };
            text.appendChild(label); text.appendChild(d); row.appendChild(cb); row.appendChild(text); topicsBody.appendChild(row);
          });
        }

        tplSel.onchange = function() {
          const val = tplSel.value;
          if (val === 'dynamic' && R.buildDynamicPrompt) {
            settings.config.refinerUseDynamic = true;
            topicsWrap.style.display = 'block';
            renderTopics();
            rebuildDynamicPrompt();
            desc.textContent = 'Only checked topics are included in the prompt.';
          } else if (val !== 'custom' && R.TEMPLATES && R.TEMPLATES[val]) {
            const tpl = R.TEMPLATES[val];
            settings.config.refinerUseDynamic = false;
            topicsWrap.style.display = 'none';
            settings.config.refinerCustomPrompt = tpl.prompt;
            settings.config.refinerContextTurns = tpl.turnHint;
            promptTa.value = tpl.prompt;
            desc.textContent = tpl.desc || '';
            save(settings);
          } else {
            settings.config.refinerUseDynamic = false;
            topicsWrap.style.display = 'none';
            desc.textContent = 'Edit the prompt directly.';
            save(settings);
          }
        };

        promptTa.onchange = function() {
          settings.config.refinerCustomPrompt = promptTa.value;
          settings.config.refinerUseDynamic = false;
          tplSel.value = 'custom';
          topicsWrap.style.display = 'none';
          save(settings);
        };

        let matched = 'custom';
        const curNorm = normalize(settings.config.refinerCustomPrompt);
        if (R.TEMPLATES) Object.keys(R.TEMPLATES).forEach(function(k){ if (normalize(R.TEMPLATES[k].prompt) === curNorm) matched = k; });
        if (settings.config.refinerUseDynamic && R.TOPICS) matched = 'dynamic';
        tplSel.value = matched;
        if (matched === 'dynamic') { topicsWrap.style.display = 'block'; renderTopics(); desc.textContent = 'Only checked topics are included in the prompt.'; }
        else if (matched !== 'custom' && R.TEMPLATES && R.TEMPLATES[matched]) desc.textContent = R.TEMPLATES[matched].desc || '';
        else desc.textContent = 'Edit the prompt directly.';

        nd.appendChild(tplSel);
        nd.appendChild(desc);
        nd.appendChild(topicsWrap);
        nd.appendChild(promptTa);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('Maintenance'));
        const btn = UI.createButton('Clear processed record', { kind: 'danger' });
        btn.onclick = function(){ if (R.clearProcessed) R.clearProcessed(); alert('Processed record cleared.'); };
        nd.appendChild(btn);
      });
    }
  });

  UI.__refinerPanelLoaded = true;
  console.log('[LoreInj:UI] refiner panel loaded');
})();