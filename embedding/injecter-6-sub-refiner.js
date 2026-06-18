// injecter-6-sub-refiner.js: AI 응답 교정 설정 UI
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = (_w.__LoreEnv && _w.__LoreEnv.kv) || _w.localStorage;
  const R = _w.__LoreRefiner;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subRefinerLoaded) return;
  
  const { C, settings } = _w.__LoreInj;
  const FIELD_STYLE = (C.UI && C.UI.field) || 'width:100%;min-height:34px;border-radius:8px;border:1px solid var(--li-line,#2f3b4f);background:#08111d;color:var(--li-text,#e7edf5);padding:8px 10px;font-size:12px;box-sizing:border-box;';
  const BTN_BASE = 'min-height:32px;padding:7px 10px;font-size:12px;border-radius:8px;background:transparent;border:1px solid var(--li-line,#2f3b4f);color:var(--li-text-soft,#a9b6c7);cursor:pointer;font-weight:800;';
  const TONE = {
    muted: 'var(--li-muted,#748196)',
    soft: 'var(--li-text-soft,#a9b6c7)',
    text: 'var(--li-text,#e7edf5)',
    accent: 'var(--li-accent,#5aa7ff)',
    ok: '#78d5a8',
    warn: '#e7b56f',
    danger: '#ef6b6b'
  };
  _w.__LoreInj.registerSettingsPage('refiner', '응답 교정', (m) => {
      m.replaceContentPanel(async (panel) => {
        if (!R) { panel.addText('Refiner 라이브러리 없음.'); return; }
        // 수동 검수 버튼
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '수동 검수'; t.style.cssText = 'font-size:15px;color:var(--li-text,#e7edf5);font-weight:900;margin-bottom:4px;'; nd.appendChild(t);
          const d = document.createElement('div'); d.textContent = '마지막 AI 응답을 즉시 재검수함. 이미 처리된 응답도 다시 돌릴 수 있음.'; d.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:10px;line-height:1.5;'; nd.appendChild(d);
          const btnBox = document.createElement('div'); btnBox.style.cssText = 'position:relative;';
          const btn = document.createElement('button'); btn.textContent = '최근 AI 응답 재검수'; btn.style.cssText = BTN_BASE + 'width:100%;min-height:38px;color:#fff;background:var(--li-accent,#5aa7ff);border-color:transparent;';
          const statusLine = document.createElement('div'); statusLine.style.cssText = 'font-size:11px;margin-top:8px;text-align:center;line-height:1.5;min-height:18px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--li-muted,#748196);';
          btnBox.appendChild(btn); btnBox.appendChild(statusLine); nd.appendChild(btnBox);
          if (!_w.__loreRefinerPulseCss) {
            _w.__loreRefinerPulseCss = true;
            const st = document.createElement('style');
            st.textContent = '@keyframes lore-refiner-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
            document.head.appendChild(st);
          }
          const makeDot = () => { const d = document.createElement('span'); d.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:' + TONE.ok + ';animation:lore-refiner-pulse 1s infinite;'; return d; };
          btn.onclick = async () => {
            if (!R.manualRefine) { alert('Refiner 버전 낮음. Tampermonkey에서 스크립트 수동 업데이트 필요.'); return; }
            const cid = C.getCurrentChatId();
            if (!cid) { alert('채팅방 감지 실패.'); return; }
            btn.disabled = true;
            const orig = btn.textContent;
            btn.textContent = '검수 실행 중';
            statusLine.innerHTML = '';
            statusLine.appendChild(makeDot());
            const txt = document.createElement('span'); txt.textContent = '대상 탐색'; statusLine.appendChild(txt);
            statusLine.style.color = TONE.ok;
            const start = Date.now();
            const phases = ['대상 탐색', '로어 수집', '메모리 수집', 'AI 호출 중', '반영 중'];
            let phaseIdx = 0;
            const tick = setInterval(() => {
              if (phaseIdx < phases.length - 1) phaseIdx++;
              const sec = Math.floor((Date.now() - start) / 1000);
              txt.textContent = `${phases[phaseIdx]} (${sec}초)`;
            }, 1500);
            try {
              const platform = _w.__LorePlatform;
              const lastBot = platform && platform.findLastAssistantMessage
                ? await platform.findLastAssistantMessage(cid)
                : null;
              if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('마지막 AI 응답 없음');
              await R.manualRefine(lastBot.content, lastBot.id);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - start) / 1000);
              statusLine.innerHTML = ''; statusLine.textContent = `완료 (${sec}초)`; statusLine.style.color = TONE.ok;
              setTimeout(() => { statusLine.textContent = ''; statusLine.style.color = TONE.muted; }, 3000);
            } catch(e) {
              clearInterval(tick);
              statusLine.innerHTML = ''; statusLine.textContent = '실패: ' + String(e.message || e).slice(0, 50);
              statusLine.style.color = TONE.danger;
            } finally {
              btn.textContent = orig;
              btn.disabled = false;
            }
          };
        }});
        // 설정
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('응답 교정 켜기', 'AI 응답 시 로어 기반 자동 검수.', settings.config.refinerEnabled, (v) => { settings.config.refinerEnabled = v; settings.save(); if(v && R.setNeedsWarmup) R.setNeedsWarmup(); }));
          nd.appendChild(C.createToggleRow('자동 반영 (팝업 없음)', '검수 결과를 팝업 없이 즉시 적용.', settings.config.refinerAutoMode, (v) => { settings.config.refinerAutoMode = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('상태 배지 표시', '진행 상태를 화면 우측에 띄움. 모바일에서 겹치면 끄기.', settings.config.statusBadgeEnabled !== false, (v) => { settings.config.statusBadgeEnabled = v; settings.save(); if (!v && C.hideStatusBadge) C.hideStatusBadge(); }));

          const live = document.createElement('div');
          live.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin:8px 0 12px;padding:9px 10px;border:1px solid var(--li-line,#2f3b4f);border-radius:9px;background:rgba(7,13,23,.62);line-height:1.5;';
          const renderLive = () => {
            const st = R.getRefinerState ? R.getRefinerState() : null;
            if (!st) { live.textContent = '상태: 대기'; return; }
            const age = st.at ? Math.max(0, Math.floor((Date.now() - st.at) / 1000)) : 0;
            const raw = (st.state || 'idle') + (st.detail ? ' · ' + st.detail : '') + ' · ' + (age === 0 ? '0초 전' : age + '초 전');
            live.textContent = '상태: ' + (C.humanizeStatusText ? C.humanizeStatusText(raw) : raw);
          };
          renderLive();
          try { if (R.__refinerStatusUiTimer) clearInterval(R.__refinerStatusUiTimer); } catch(_) {}
          R.__refinerStatusUiTimer = setInterval(renderLive, 1000);
          nd.appendChild(live);
  
          const S = FIELD_STYLE + 'margin-bottom:8px;';
  
          const modeWrap = document.createElement('div'); modeWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const modeLbl = document.createElement('div'); modeLbl.textContent = '로어 검색 모드'; modeLbl.style.cssText = 'font-size:13px;color:var(--li-text-soft,#a9b6c7);font-weight:900;';
          const modeSel = document.createElement('select'); modeSel.style.cssText = FIELD_STYLE + 'width:170px;padding:6px 8px;';
          [{v:'matchedOnly', l:'키워드 매칭만'}, {v:'semantic', l:'임베딩 (의미 검색)'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; modeSel.appendChild(opt); });
          modeSel.value = settings.config.refinerLoreMode || 'matchedOnly';
          modeSel.onchange = () => { settings.config.refinerLoreMode = modeSel.value; settings.save(); };
          modeWrap.appendChild(modeLbl); modeWrap.appendChild(modeSel); nd.appendChild(modeWrap);
  
          const tplWrap = document.createElement('div'); tplWrap.style.cssText = 'margin-bottom:10px;padding-top:10px;border-top:1px dashed var(--li-line,#2f3b4f);';
          const tplLbl = document.createElement('div'); tplLbl.textContent = '검수 템플릿 선택'; tplLbl.style.cssText = 'font-size:13px;color:var(--li-text-soft,#a9b6c7);font-weight:900;margin-bottom:4px;';
          const tplSel = document.createElement('select'); tplSel.style.cssText = S;
          const tplDesc = document.createElement('div'); tplDesc.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:8px;line-height:1.5;';
  
          const customOpt = document.createElement('option'); customOpt.value = 'custom'; customOpt.textContent = '직접 입력 (커스텀)'; tplSel.appendChild(customOpt);
          if (R.TEMPLATES) {
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { const opt = document.createElement('option'); opt.value = k; opt.textContent = t.name; tplSel.appendChild(opt); });
          }
          if (R.TOPICS) {
            const dynOpt = document.createElement('option'); dynOpt.value = 'dynamic'; dynOpt.textContent = '주제별 선택 (체크박스)'; tplSel.appendChild(dynOpt);
          }
          tplWrap.appendChild(tplLbl); tplWrap.appendChild(tplSel); tplWrap.appendChild(tplDesc); nd.appendChild(tplWrap);
  
          const topicsWrap = document.createElement('div');
          topicsWrap.style.cssText = 'display:none;margin-bottom:12px;padding:10px;background:rgba(7,13,23,.62);border:1px solid var(--li-line,#2f3b4f);border-radius:9px;';
          const topicsHdr = document.createElement('div'); topicsHdr.textContent = '검수 주제 선택 - 호칭은 최신 안정 상태 기준으로만 검사'; topicsHdr.style.cssText = 'font-size:12px;color:' + TONE.ok + ';font-weight:900;margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed var(--li-line,#2f3b4f);';
          topicsWrap.appendChild(topicsHdr);
          const topicsBody = document.createElement('div'); topicsWrap.appendChild(topicsBody);
          nd.appendChild(topicsWrap);
          const rebuildDynamicPrompt = () => {
            const built = R.buildDynamicPrompt(settings.config.refinerTopics || {});
            settings.config.refinerCustomPrompt = built;
            ta.value = built;
            settings.save();
          };
          const renderTopics = () => {
            if (!settings.config.refinerTopics) {
              const def = {}; Object.keys(R.TOPICS || {}).forEach(k => def[k] = true);
              settings.config.refinerTopics = def;
            }
            topicsBody.innerHTML = '';
            let curGroup = null;
            Object.entries(R.TOPICS || {}).forEach(([k, meta]) => {
              if (meta.group !== curGroup) {
                curGroup = meta.group;
                const gh = document.createElement('div');
                gh.textContent = curGroup === 'logic' ? '모순 검수' : '끊김 복구';
                gh.style.cssText = 'font-size:10px;color:var(--li-muted,#748196);margin:6px 0 4px;font-weight:900;';
                topicsBody.appendChild(gh);
              }
              const row = document.createElement('label');
              row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:5px 0;cursor:pointer;';
              const cb = document.createElement('input'); cb.type = 'checkbox';
              cb.checked = !!settings.config.refinerTopics[k];
              cb.style.cssText = 'margin-top:3px;flex-shrink:0;accent-color:#78d5a8;';
              const txt = document.createElement('div'); txt.style.flex = '1';
              const lbl = document.createElement('div'); lbl.textContent = meta.label; lbl.style.cssText = 'font-size:12px;color:var(--li-text,#e7edf5);font-weight:800;';
              const dsc = document.createElement('div'); dsc.textContent = meta.desc; dsc.style.cssText = 'font-size:10px;color:var(--li-muted,#748196);line-height:1.45;';
              txt.appendChild(lbl); txt.appendChild(dsc);
              cb.onchange = () => {
                settings.config.refinerTopics[k] = cb.checked;
                rebuildDynamicPrompt();
              };
              row.appendChild(cb); row.appendChild(txt); topicsBody.appendChild(row);
            });
          };
  
          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:12px;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const t = document.createElement('div'); t.textContent = '참조 대화 턴 수'; t.style.cssText = 'font-size:13px;color:var(--li-text-soft,#a9b6c7);font-weight:900;'; left.appendChild(t);
          const right = document.createElement('div');
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1; inp.min = 0; inp.max = 20;
          inp.style.cssText = FIELD_STYLE + 'width:70px;text-align:center;';
          inp.onchange = () => { settings.config.refinerContextTurns = parseInt(inp.value) || 0; settings.save(); };
          right.appendChild(inp); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);
  
          const tLbl2 = document.createElement('div'); tLbl2.textContent = '프롬프트 미리보기'; tLbl2.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:4px;font-weight:800;'; nd.appendChild(tLbl2);
          const ta = document.createElement('textarea'); ta.value = settings.config.refinerCustomPrompt; ta.style.cssText = S + 'height:200px;font-family:monospace;resize:vertical;';
          ta.readOnly = true;
          nd.appendChild(ta);
  
          if (R.TEMPLATES) {
            tplSel.onchange = () => {
              const val = tplSel.value;
              if (val === 'dynamic') {
                settings.config.refinerUseDynamic = true;
                topicsWrap.style.display = 'block';
                renderTopics();
                rebuildDynamicPrompt();
                tplDesc.textContent = '체크한 검수 주제만 AI 프롬프트에 들어감.';
              } else if (val !== 'custom' && R.TEMPLATES[val]) {
                settings.config.refinerUseDynamic = false;
                topicsWrap.style.display = 'none';
                const tpl = R.TEMPLATES[val];
                ta.value = tpl.prompt; settings.config.refinerCustomPrompt = tpl.prompt;
                inp.value = tpl.turnHint; settings.config.refinerContextTurns = tpl.turnHint;
                tplDesc.textContent = tpl.desc;
                settings.save();
              } else {
                settings.config.refinerUseDynamic = false;
                topicsWrap.style.display = 'none';
                tplDesc.textContent = '직접 작성한 프롬프트 사용 중. 내용 수정은 프롬프트 관리에서 함.';
                settings.save();
              }
            };
            const normalize = (s) => (s||'').trim().replace(/\s+/g, ' ');
            let matched = 'custom';
            const curNorm = normalize(settings.config.refinerCustomPrompt);
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { if (normalize(t.prompt) === curNorm) matched = k; });
  
            if (matched === 'custom' && !settings.config.refinerCustomPrompt && R.TOPICS && R.buildDynamicPrompt) {
              matched = 'dynamic';
              settings.config.refinerUseDynamic = true;
              const def = {}; Object.keys(R.TOPICS).forEach(k => def[k] = true);
              settings.config.refinerTopics = def;
              settings.config.refinerCustomPrompt = R.buildDynamicPrompt(def);
              settings.config.refinerContextTurns = 1;
              ta.value = settings.config.refinerCustomPrompt;
              inp.value = 1;
              settings.save();
            }
  
            if (settings.config.refinerUseDynamic && R.TOPICS) matched = 'dynamic';
            tplSel.value = matched;
            if (matched === 'dynamic') {
              topicsWrap.style.display = 'block';
              renderTopics();
              tplDesc.textContent = '체크한 검수 주제만 AI 프롬프트에 들어감.';
            } else if (matched !== 'custom') tplDesc.textContent = R.TEMPLATES[matched].desc;
            else tplDesc.textContent = '직접 작성한 프롬프트 사용 중. 내용 수정은 프롬프트 관리에서 함.';
          }
  
          const clearFpBtn = document.createElement('button'); clearFpBtn.textContent = '처리 기록 큐 초기화'; clearFpBtn.style.cssText = BTN_BASE + 'width:100%;margin-top:12px;color:' + TONE.warn + ';border-color:rgba(231,181,111,.45);background:rgba(231,181,111,.12);';
          clearFpBtn.onclick = () => { R.clearProcessed(); alert('기록 삭제됨'); }; nd.appendChild(clearFpBtn);
        }});
      }, '응답 교정');
  });
  
  _w.__LoreInj.__subRefinerLoaded = true;
})();
