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

  const HELP = {
    manual: {
      title: '수동 검사',
      what: '이미 나온 최신 AI 응답을 다시 읽고 로어·메모리와 어긋나는지 검사해요.',
      example: '응답이 설정과 다르게 나온 직후 누르면 마지막 AI 응답을 다시 교정 대상으로 보내요.',
      recommended: '자동 교정이 꺼져 있거나 의심되는 응답이 있을 때만 사용하세요.',
      warning: 'API 호출이 발생하고, 현재 채팅의 최신 AI 응답을 찾을 수 있어야 해요.',
      result: '필요한 경우 교정 흐름이 실행돼요.'
    },
    enable: {
      title: '응답 교정 켜기',
      what: 'AI 응답을 저장된 로어와 최근 맥락 기준으로 검사해요.',
      example: '캐릭터가 이미 알고 있는 사람을 처음 만난 것처럼 말하면 교정 후보로 잡아요.',
      recommended: '연속성이 중요한 채팅에서 켜 두세요.',
      warning: '검사 기준이 너무 빡빡하면 의도적인 말투 변화도 교정 후보로 잡을 수 있어요.',
      result: '응답 후 교정 검사 흐름이 활성화돼요.'
    },
    autoApply: {
      title: '자동 적용',
      what: '교정 결과를 확인 창 없이 바로 적용해요.',
      example: '끊긴 문장 복구처럼 확실한 수정만 빠르게 반영하고 싶을 때 사용해요.',
      recommended: '처음에는 꺼 두고 결과를 확인하세요.',
      warning: '잘못 판단한 교정도 바로 적용될 수 있어요.',
      result: '확인 단계가 줄어드는 대신 검토 기회도 줄어요.'
    },
    loreMode: {
      title: '로어 검색 방식',
      what: '교정기가 참고할 로어를 키워드만으로 찾을지, 의미 검색까지 쓸지 정해요.',
      example: '키워드는 빠르고 정확한 단어에 강하고, 의미 기반은 표현이 달라도 후보를 넓게 찾아요.',
      recommended: '검색 데이터가 충분하면 의미 기반 검색을 권장해요.',
      warning: '의미 기반은 임베딩 데이터가 없거나 오래되면 품질이 떨어져요.',
      result: '교정기가 읽는 참고 로어 범위가 달라져요.'
    },
    honorific: {
      title: '호칭 민감도',
      what: '호칭이나 말투가 저장된 관계와 다를 때 얼마나 민감하게 볼지 정해요.',
      example: '낮음은 명백한 직접 호칭 오류만 잡고, 높음은 작은 차이도 더 자주 봐요.',
      recommended: '일반 대화는 낮음을 권장해요.',
      warning: '높음은 화남, 장난, 공적인 자리 같은 의도적 변화도 오류로 볼 수 있어요.',
      result: '호칭 교정 후보의 빈도가 달라져요.'
    },
    recentTurns: {
      title: '참고할 최근 턴',
      what: '교정기가 최신 응답과 함께 읽을 최근 대화 턴 수예요.',
      example: '1은 직전 맥락만 보고, 6은 더 넓은 말투·상황 변화를 봐요.',
      recommended: '1~3부터 시작하세요.',
      warning: '너무 높으면 비용이 늘고 오래된 맥락이 교정을 방해할 수 있어요.',
      result: '교정 판단에 쓰이는 최근 맥락 폭이 바뀌어요.'
    },
    prompt: {
      title: '프롬프트 템플릿',
      what: '교정기가 어떤 기준으로 응답을 검사할지 정하는 지시문이에요.',
      example: '단순 끊김 복구만 하거나, 로어 모순까지 함께 검사하도록 바꿀 수 있어요.',
      recommended: '기본 템플릿을 먼저 사용하세요.',
      warning: '직접 수정 시 {lore}, {context}, {message} 같은 자리표시자를 지우면 교정 품질이 떨어질 수 있어요.',
      result: '교정 기준과 검사 범위가 달라져요.'
    }
  };

  function addToggle(nd, title, desc, value, onChange, help) {
    const control = UI.createSwitch
      ? UI.createSwitch(!!value, onChange, title)
      : document.createElement('input');
    if (!UI.createSwitch) {
      control.type = 'checkbox';
      control.checked = !!value;
      control.onchange = function(){ onChange(control.checked); };
    }
    nd.appendChild(UI.createSettingRow(title, desc, control, help));
  }

  function addSelect(nd, title, desc, value, options, onChange, help) {
    const sel = document.createElement('select');
    sel.style.cssText = 'width:180px;padding:6px 8px;';
    options.forEach(function(opt){
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = function(){ onChange(sel.value); };
    nd.appendChild(UI.createSettingRow(title, desc, sel, help));
    return sel;
  }

  function addNumber(nd, title, desc, value, min, max, onChange, help) {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value;
    input.min = min;
    input.max = max;
    input.style.cssText = 'width:90px;padding:6px 8px;text-align:center;';
    input.onchange = function(){
      const n = parseInt(input.value, 10);
      if (!isNaN(n)) onChange(n);
    };
    nd.appendChild(UI.createSettingRow(title, desc, input, help));
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
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('설정을 아직 불러오지 못함', 'error')); });
        return;
      }
      if (!R) {
        UI.addBox(panel, function(nd){ nd.appendChild(UI.createNotice('응답 교정 모듈을 불러오지 못함', 'error')); });
        return;
      }

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('수동 검사', '이미 처리된 응답도 최신 AI 응답을 다시 검사', HELP.manual));
        const btn = UI.createButton('최신 AI 응답 다시 검사', { kind: 'primary', bold: true });
        const status = document.createElement('div');
        status.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;min-height:16px;line-height:1.4;';
        btn.onclick = async function() {
          if (!R.manualRefine) {
            await UI.createAlertDialog({ title: '수동 검사 불가', message: '수동 교정 검사 도구를 사용할 수 없어요.', tone: 'error' });
            return;
          }
          if (!C || !C.getCurrentChatId) {
            await UI.createAlertDialog({ title: '채팅 감지 불가', message: '채팅 감지 도구를 사용할 수 없어요.', tone: 'error' });
            return;
          }
          const cid = C.getCurrentChatId();
          if (!cid) {
            await UI.createAlertDialog({ title: '채팅방 없음', message: '현재 채팅방을 찾지 못했어요.', tone: 'warn' });
            return;
          }
          btn.disabled = true;
          const orig = btn.textContent;
          btn.textContent = '검사 중';
          if (UI.setPulseStatus) UI.setPulseStatus(status, '에리가 최신 응답을 찾는 중..');
          else status.textContent = '에리가 최신 응답을 찾는 중..';
          const started = Date.now();
          try {
            const lastBot = await CrackUtil.chatRoom().findLastBotMessage(cid);
            if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('최신 AI 응답을 찾지 못함');
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

        addToggle(nd, '응답 교정 켜기', 'AI 응답을 활성 로어와 메모리 기준으로 검사', !!settings.config.refinerEnabled, function(v){
          settings.config.refinerEnabled = v;
          save(settings);
          if (v && R.setNeedsWarmup) R.setNeedsWarmup();
        }, HELP.enable);

        addToggle(nd, '자동 적용', '확인 창을 열지 않고 교정 결과를 바로 적용', !!settings.config.refinerAutoMode, function(v){
          settings.config.refinerAutoMode = v;
          save(settings);
        }, HELP.autoApply);

        addSelect(nd, '로어 검색 방식', '키워드는 빠르고, 의미 기반은 더 넓게 찾지만 임베딩 사용 가능', settings.config.refinerLoreMode || 'matchedOnly', [
          { value: 'matchedOnly', label: '키워드만' },
          { value: 'semantic', label: '의미 기반 검색' }
        ], function(v){ settings.config.refinerLoreMode = v; save(settings); }, HELP.loreMode);

        addSelect(nd, '호칭 민감도', '일반 대화에서는 낮음 권장. 최근 맥락으로 설명되지 않는 직접 호칭 오류만 잡는 용도', settings.config.refinerHonorificSensitivity || 'low', [
          { value: 'low', label: '낮음' },
          { value: 'normal', label: '보통' },
          { value: 'high', label: '높음' }
        ], function(v){ settings.config.refinerHonorificSensitivity = v; save(settings); }, HELP.honorific);

        addNumber(nd, '참고할 최근 턴', '응답 교정이 읽을 최근 대화 턴 수', settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1, 0, 20, function(v){
          settings.config.refinerContextTurns = v;
          save(settings);
        }, HELP.recentTurns);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('프롬프트 템플릿', '기본 템플릿, 주제 기반 동적 프롬프트, 직접 입력 프롬프트 중 선택', HELP.prompt));

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
            desc.textContent = '선택한 주제만 프롬프트에 포함';
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
            desc.textContent = '프롬프트 직접 수정';
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
        if (matched === 'dynamic') { topicsWrap.style.display = 'block'; renderTopics(); desc.textContent = '선택한 주제만 프롬프트에 포함'; }
        else if (matched !== 'custom' && R.TEMPLATES && R.TEMPLATES[matched]) desc.textContent = R.TEMPLATES[matched].desc || '';
        else desc.textContent = '프롬프트 직접 수정';

        nd.appendChild(tplSel);
        nd.appendChild(desc);
        nd.appendChild(topicsWrap);
        nd.appendChild(promptTa);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('관리'));
        const btn = UI.createButton('처리 기록 비우기', { kind: 'danger' });
        btn.onclick = async function(){
          if (R.clearProcessed) R.clearProcessed();
          await UI.createAlertDialog({ title: '완료', message: '처리 기록을 비웠어요.', tone: 'success' });
        };
        nd.appendChild(btn);
      });
    }
  });

  UI.__refinerPanelLoaded = true;
  console.log('[LoreInj:UI] refiner panel loaded');
})();