// injecter-6-sub-refiner.js: AI 응답 교정 (Refiner) 설정 UI
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;
  const R = _w.__LoreRefiner;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subRefinerLoaded) return;
  
  const { C, settings } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  
  _w.__LoreInj.registerSubMenu('refiner', function(modal) {
    modal.createSubMenu('AI 응답 교정 (Refiner)', (m) => {
      m.replaceContentPanel(async (panel) => {
        if (!R) { panel.addText('Refiner 라이브러리 없음.'); return; }
        // 수동 검수 버튼
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '수동 검수'; t.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;margin-bottom:4px;'; nd.appendChild(t);
          const d = document.createElement('div'); d.textContent = '마지막 AI 응답을 지금 즉시 재검수. 이미 처리된 응답도 다시 돌릴 수 있음.'; d.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;'; nd.appendChild(d);
          const btnBox = document.createElement('div'); btnBox.style.cssText = 'position:relative;';
          const btn = document.createElement('button'); btn.textContent = '최근 AI 응답 재검수'; btn.style.cssText = 'width:100%;padding:10px;background:#258;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;';
          const statusLine = document.createElement('div'); statusLine.style.cssText = 'font-size:11px;margin-top:6px;text-align:center;line-height:1.4;min-height:16px;display:flex;align-items:center;justify-content:center;gap:6px;color:#888;';
          btnBox.appendChild(btn); btnBox.appendChild(statusLine); nd.appendChild(btnBox);
          if (!_w.__loreRefinerPulseCss) {
            _w.__loreRefinerPulseCss = true;
            const st = document.createElement('style');
            st.textContent = '@keyframes lore-refiner-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
            document.head.appendChild(st);
          }
          const makeDot = () => { const d = document.createElement('span'); d.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:#4a9;animation:lore-refiner-pulse 1s infinite;'; return d; };
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
            statusLine.style.color = '#4a9';
            const start = Date.now();
            const phases = ['대상 탐색', '로어 수집', '메모리 수집', 'AI 호출 중', '반영 중'];
            let phaseIdx = 0;
            const tick = setInterval(() => {
              if (phaseIdx < phases.length - 1) phaseIdx++;
              const sec = Math.floor((Date.now() - start) / 1000);
              txt.textContent = `${phases[phaseIdx]} (${sec}초)`;
            }, 1500);
            try {
              const lastBot = await CrackUtil.chatRoom().findLastBotMessage(cid);
              if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('마지막 AI 응답 없음');
              await R.manualRefine(lastBot.content, lastBot.id);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - start) / 1000);
              statusLine.innerHTML = ''; statusLine.textContent = `완료 (${sec}초)`; statusLine.style.color = '#4a9';
              setTimeout(() => { statusLine.textContent = ''; statusLine.style.color = '#888'; }, 3000);
            } catch(e) {
              clearInterval(tick);
              statusLine.innerHTML = ''; statusLine.textContent = '실패: ' + String(e.message || e).slice(0, 50);
              statusLine.style.color = '#d66';
            } finally {
              btn.textContent = orig;
              btn.disabled = false;
            }
          };
        }});
        // 설정
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tog1 = C.createToggleRow('응답 교정 켜기', 'AI 응답 시 로어 기반 자동 검수.', settings.config.refinerEnabled, (v) => { settings.config.refinerEnabled = v; settings.save(); if(v && R.setNeedsWarmup) R.setNeedsWarmup(); });
          const h_r1 = C.createHelpIcon((e) => C.showHelpPopup('AI 응답 직후 로어·요약과 모순되는 부분을 찾아 수정안을 만듭니다.<br><br>예시: 로어에 "철수=사망"이 있는데 AI가 "철수가 웃으며 말했다"라고 쓰면 해당 문장을 감지해 대체합니다.<br>자동 반영을 켜 두면 팝업 없이 즉시 교체됩니다.', e.currentTarget));
          tog1.querySelector('div > div').appendChild(h_r1);
          nd.appendChild(tog1);
          const tog2 = C.createToggleRow('자동 반영 (팝업 없음)', '검수 결과를 팝업 없이 즉시 적용.', settings.config.refinerAutoMode, (v) => { settings.config.refinerAutoMode = v; settings.save(); });
          const h_r2 = C.createHelpIcon((e) => C.showHelpPopup('검수 결과를 확인 없이 바로 AI 응답에 적용합니다.<br>꺼두면 수정안을 팝업으로 보여주고 수동 승인해야 합니다.<br><br>예시: 켜두면 "철수가 웃으며 말했다" → "철수는 이미 사망함"이 팝업 없이 즉시 교체됩니다.<br>신뢰도가 낮은 설정이라면 꺼두세요.', e.currentTarget));
          tog2.querySelector('div > div').appendChild(h_r2);
          nd.appendChild(tog2);

          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';

          const modeWrap = document.createElement('div'); modeWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
          const modeLbl = document.createElement('div'); modeLbl.textContent = '로어 검색 모드'; modeLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const h_r3 = C.createHelpIcon((e) => C.showHelpPopup('교정 시 어떤 방식으로 관련 로어를 찾을지 정합니다.<br><br>키워드 매칭만: AI 응답의 키워드와 로어 triggers를 비교 (빠름, API 호출 없음)<br>임베딩 (의미 검색): 의미 기반 검색으로 더 넓은 범위 탐지 (API 비용 증가)<br><br>예시: "의미 검색"으로 두면 "강아지"라는 단어가 없어도 "애완동물" 관련 로어가 검색됩니다.', e.currentTarget));
          modeLbl.appendChild(h_r3);
          const modeSel = document.createElement('select'); modeSel.style.cssText = 'width:160px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'matchedOnly', l:'키워드 매칭만'}, {v:'semantic', l:'임베딩 (의미 검색)'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; modeSel.appendChild(opt); });
          modeSel.value = settings.config.refinerLoreMode || 'matchedOnly';
          modeSel.onchange = () => { settings.config.refinerLoreMode = modeSel.value; settings.save(); };
          modeWrap.appendChild(modeLbl); modeWrap.appendChild(modeSel); nd.appendChild(modeWrap);
  
          const tplWrap = document.createElement('div'); tplWrap.style.cssText = 'margin-bottom:8px;padding-top:8px;border-top:1px dashed #333;';
          const tplLbl = document.createElement('div'); tplLbl.textContent = '검수 템플릿 선택'; tplLbl.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:4px;';
          const tplSel = document.createElement('select'); tplSel.style.cssText = S;
          const tplDesc = document.createElement('div'); tplDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:8px;line-height:1.4;';
  
          const customOpt = document.createElement('option'); customOpt.value = 'custom'; customOpt.textContent = '직접 입력 (커스텀)'; tplSel.appendChild(customOpt);
          if (R.TEMPLATES) {
            Object.entries(R.TEMPLATES).forEach(([k, t]) => { const opt = document.createElement('option'); opt.value = k; opt.textContent = t.name; tplSel.appendChild(opt); });
          }
          if (R.TOPICS) {
            const dynOpt = document.createElement('option'); dynOpt.value = 'dynamic'; dynOpt.textContent = '주제별 선택 (체크박스)'; tplSel.appendChild(dynOpt);
          }
          tplWrap.appendChild(tplLbl); tplWrap.appendChild(tplSel); tplWrap.appendChild(tplDesc); nd.appendChild(tplWrap);
  
          const topicsWrap = document.createElement('div');
          topicsWrap.style.cssText = 'display:none;margin-bottom:12px;padding:10px;background:#111;border:1px solid #333;border-radius:4px;';
          const topicsHdr = document.createElement('div'); topicsHdr.textContent = '검수 주제 선택 — 호칭은 최신 안정 상태 기준으로만 검사'; topicsHdr.style.cssText = 'font-size:12px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px dashed #333;';
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
                gh.textContent = curGroup === 'logic' ? '— 모순 검수 —' : '— 끊김 복구 —';
                gh.style.cssText = 'font-size:10px;color:#888;margin:6px 0 4px;font-weight:bold;';
                topicsBody.appendChild(gh);
              }
              const row = document.createElement('label');
              row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:5px 0;cursor:pointer;';
              const cb = document.createElement('input'); cb.type = 'checkbox';
              cb.checked = !!settings.config.refinerTopics[k];
              cb.style.cssText = 'margin-top:3px;flex-shrink:0;accent-color:#4a9;';
              const txt = document.createElement('div'); txt.style.flex = '1';
              const lbl = document.createElement('div'); lbl.textContent = meta.label; lbl.style.cssText = 'font-size:12px;color:#ccc;font-weight:bold;';
              const dsc = document.createElement('div'); dsc.textContent = meta.desc; dsc.style.cssText = 'font-size:10px;color:#888;line-height:1.4;';
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
          const t = document.createElement('div'); t.textContent = '참조 대화 턴 수'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;display:flex;align-items:center;gap:4px;';
          const h_r4 = C.createHelpIcon((e) => C.showHelpPopup('교정 시 직전 몇 턴의 대화를 함께 읽을지 정합니다.<br>많을수록 문맥 이해도가 올라가지만 API 비용이 늘어납니다.<br><br>예시: 1로 두면 마지막 1턴만 참조합니다. 4로 올리면 직전 4턴까지 확인해 더 정확한 교정이 가능합니다.<br>기본값은 1입니다.', e.currentTarget));
          t.appendChild(h_r4);
          left.appendChild(t);
          const right = document.createElement('div');
          const inp = document.createElement('input'); inp.type = 'number'; inp.value = settings.config.refinerContextTurns !== undefined ? settings.config.refinerContextTurns : 1; inp.min = 0; inp.max = 20;
          inp.style.cssText = 'width:60px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;text-align:center;';
          inp.onchange = () => { settings.config.refinerContextTurns = parseInt(inp.value) || 0; settings.save(); };
          right.appendChild(inp); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);
  
          const tLbl2 = document.createElement('div'); tLbl2.textContent = '프롬프트 ({lore}, {memory}, {context}, {message}, {passWord})'; tLbl2.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; nd.appendChild(tLbl2);
          const ta = document.createElement('textarea'); ta.value = settings.config.refinerCustomPrompt; ta.style.cssText = S + 'height:200px;font-family:monospace;resize:vertical;';
          ta.onchange = () => { settings.config.refinerCustomPrompt = ta.value; settings.save(); tplSel.value = 'custom'; tplDesc.textContent = ''; }; nd.appendChild(ta);
  
          if (R.TEMPLATES) {
            tplSel.onchange = () => {
              const val = tplSel.value;
              if (val === 'dynamic') {
                settings.config.refinerUseDynamic = true;
                topicsWrap.style.display = 'block';
                renderTopics();
                rebuildDynamicPrompt();
                tplDesc.textContent = '아래 체크박스로 검수 주제를 on/off. 체크된 항목만 AI 프롬프트에 들어감.';
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
                tplDesc.textContent = '직접 작성한 프롬프트를 사용합니다.';
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
              tplDesc.textContent = '아래 체크박스로 검수 주제를 on/off. 체크된 항목만 AI 프롬프트에 들어감.';
            } else if (matched !== 'custom') tplDesc.textContent = R.TEMPLATES[matched].desc;
            else tplDesc.textContent = '직접 작성한 프롬프트를 사용합니다.';
          }
  
          const clearFpBtn = document.createElement('button'); clearFpBtn.textContent = '처리 기록 큐 초기화'; clearFpBtn.style.cssText = 'width:100%;padding:8px;margin-top:12px;background:#654;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;';
          clearFpBtn.onclick = () => { R.clearProcessed(); alert('기록 삭제됨'); }; nd.appendChild(clearFpBtn);
        }});
      }, '응답 교정 설정');
    });
  });
  
  _w.__LoreInj.__subRefinerLoaded = true;
})();
