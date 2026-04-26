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
    order: 70,
    render: function(panel) {
      const L = getRuntime();
      const C = L.C;
      const R = L.R || _w.__LoreRefiner;
      const settings = L.settings;

      if (!settings || !settings.config) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('설정을 아직 불러오지 못했습니다.', 'error')); });
        return;
      }
      if (!R) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('응답 교정 모듈을 불러오지 못했습니다.', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('수동 검사', '이미 처리된 응답이라도 최신 AI 응답을 다시 검사합니다.'));
        const btn = UI.createButton('최신 AI 응답 다시 검사', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;line-height:1.4;';
        btn.onclick = async function() {
          if (!R.manualRefine) { alert('수동 교정 검사를 사용할 수 없습니다.'); return; }
          if (!C || !C.getCurrentChatId) { alert('채팅 감지 도구를 사용할 수 없습니다.'); return; }
          const cid = C.getCurrentChatId();
          if (!cid) { alert('채팅방을 찾지 못했습니다.'); return; }
          btn.disabled = true;
          const orig = btn.textContent;
          btn.textContent = '검사 중';
          if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 최신 응답을 찾는 중..');
          else status.textContent = '에리가 최신 응답을 찾는 중..';
          const started = Date.now();
          try {
            const lastBot = await CrackUtil.chatRoom().findLastBotMessage(cid);
            if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('최신 AI 응답을 찾지 못했습니다');
            if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 응답을 교정하는 중..');
            else status.textContent = '에리가 응답을 교정하는 중..';
            await R.manualRefine(lastBot.content, lastBot.id);
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '완료 (' + Math.floor((Date.now() - started) / 1000) + '초)', 'info');
            else status.textContent = '완료 (' + Math.floor((Date.now() - started) / 1000) + '초)';
            setTimeout(function(){ status.textContent = ''; }, 3000);
          } catch(e) {
            if (UI.clearPulseStatus) UI.clearPulseStatus(status, '실패: ' + String(e.message || e).slice(0, 80), 'error');
            else status.textContent = '실패: ' + String(e.message || e).slice(0, 80);
          } finally {
            btn.textContent = orig;
            btn.disabled = false;
          }
        };
        nd.appendChild(btn);
        nd.appendChild(status);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('동작 설정'));

        addToggle(nd, '응답 교정 켜기', 'AI 응답을 활성 로어와 메모리 기준으로 검사합니다.', !!settings.config.refinerEnabled, function(v){
          settings.config.refinerEnabled = v;
          save(settings);
          if (v && R.setNeedsWarmup) R.setNeedsWarmup();
        });

        addToggle(nd, '자동 적용', '확인 창을 열지 않고 교정 결과를 바로 적용합니다.', !!settings.config.refinerAutoMode, function(v){
          settings.config.refinerAutoMode = v;
          save(settings);
        });

        addSelect(nd, '로어 검색 방식', '키워드는 빠르고, 의미 기반은 더 넓게 찾지만 임베딩을 사용할 수 있습니다.', settings.config.refinerLoreMode || 'matchedOnly', [
          { value: 'matchedOnly', label: '키워드만' },
          { value: 'semantic', label: '의미 기반 검색' }
        ], function(v){ settings.config.refinerLoreMode = v; save(settings); });

        addSelect(nd, '호칭 민감도', 'RP에서는 낮음을 권장합니다. 최근 맥락으로 설명되지 않는 직접 호칭 오류만 잡는 용도입니다.', settings.config.refinerHonorificSensitivity || 'low', [
          { value: 'low', label: '낮음' },
          { value: 'normal', label: '보통' },
          { value: 'high', label: '높음' }
        ], function(v){ settings.config.refinerHonorificSensitivity = v; save(settings); });

        addNumber(nd, '참고할 최근 턴', '응답 교정이 읽을 최근 대화 턴 수입니다.', settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1, 0, 20, function(v){
          settings.config.refinerContextTurns = v;
          save(settings);
        });
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('프롬프트 템플릿', '기본 템플릿, 주제 기반 동적 프롬프트, 직접 입력 프롬프트 중 선택합니다.'));

        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:11px;color:#888;line-height:1.5;margin-bottom:8px;';
        const tplSel = document.createElement('select');
        tplSel.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;margin-bottom:8px;';
        const promptTa = document.createElement('textarea');
        promptTa.style.cssText = 'width:100%;height:220px;padding:8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;font-family:monospace;resize:vertical;';
        promptTa.value = settings.config.refinerCustomPrompt || (R.DEFAULT_PROMPT || '');

        const addOpt = function(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; tplSel.appendChild(o); };
        addOpt('custom', '직접 입력');
        if (R.TEMPLATES) Object.keys(R.TEMPLATES).forEach(function(k){ addOpt(k, R.TEMPLATES[k].name || k); });
        if (R.TOPICS && R.buildDynamicPrompt) addOpt('dynamic', '주제 기반');

        const topicsWrap = document.createElement('div');
        topicsWrap.style.cssText = 'display:none;margin-bottom:12px;padding:10px;background:#111;border:1px solid #333;border-radius:4px;';
        const topicsTitle = document.createElement('div');
        topicsTitle.textContent = '주제';
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
            desc.textContent = '선택한 주제만 프롬프트에 포함됩니다.';
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
            desc.textContent = '프롬프트를 직접 수정합니다.';
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
        if (matched === 'dynamic') { topicsWrap.style.display = 'block'; renderTopics(); desc.textContent = '선택한 주제만 프롬프트에 포함됩니다.'; }
        else if (matched !== 'custom' && R.TEMPLATES && R.TEMPLATES[matched]) desc.textContent = R.TEMPLATES[matched].desc || '';
        else desc.textContent = '프롬프트를 직접 수정합니다.';

        nd.appendChild(tplSel);
        nd.appendChild(desc);
        nd.appendChild(topicsWrap);
        nd.appendChild(promptTa);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('관리'));
        const btn = UI.createButton('처리 기록 비우기', { kind: 'danger' });
        btn.onclick = function(){ if (R.clearProcessed) R.clearProcessed(); alert('처리 기록을 비웠습니다.'); };
        nd.appendChild(btn);
      });
    }
  });

  UI.__refinerPanelLoaded = true;
  console.log('[LoreInj:UI] refiner panel loaded');
})();