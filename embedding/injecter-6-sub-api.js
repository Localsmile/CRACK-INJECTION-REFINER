// injecter-6-sub-api.js: API 설정
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subApiLoaded) return;
  
  const { C, settings } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  
  _w.__LoreInj.registerSubMenu('api', function(modal) {
    modal.createSubMenu('API 설정', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = 'Gemini / Vertex AI API'; t.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;margin-bottom:8px;display:flex;align-items:center;gap:6px;';
          const h_a1 = C.createHelpIcon((e) => C.showHelpPopup('Gemini 키 또는 Vertex AI JSON을 등록해 자동 추출·임베딩·재정렬·지식 변환·응답 교정에 공통으로 사용합니다.<br><br>API Key: 구글 AI 스튜디오에서 발급 (가장 쉬움)<br>Vertex AI: GCP 서비스 계정 JSON 사용<br>Firebase: Firebase SDK + 별도 임베딩용 Gemini 키<br><br>API 키 테스트 버튼으로 연결을 확인하세요.', e.currentTarget));
          t.appendChild(h_a1);
          nd.appendChild(t);
          C.createApiInput(settings.config, 'autoExt', nd, () => settings.save());

          const testRow = document.createElement('div'); testRow.style.cssText = 'margin:12px 0 16px;display:flex;gap:8px;align-items:center;';
          const testBtn = document.createElement('button'); testBtn.textContent = 'API 키 테스트';
          testBtn.style.cssText = 'padding:6px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:1px solid #258;font-weight:bold;';
          const h_a2 = C.createHelpIcon((e) => C.showHelpPopup('등록된 API 설정으로 실제 Gemini 호출을 시도합니다.<br>성공하면 "OK" 응답이 표시됩니다.<br><br>실패 시: 키가 올바른지, 요금제가 활성화된지 확인하세요.<br>Firebase 모드면 임베딩용 Gemini 키도 별도 입력 필요.', e.currentTarget));
          testRow.appendChild(h_a2);
          const testResult = document.createElement('span'); testResult.style.cssText = 'font-size:12px;color:#888;word-break:break-all;';
          testBtn.onclick = async () => {
            const apiType = settings.config.autoExtApiType || 'key';
            const missing = apiType === 'vertex' ? !settings.config.autoExtVertexJson : apiType === 'firebase' ? !settings.config.autoExtFirebaseScript : !settings.config.autoExtKey;
            if (missing) { alert(apiType === 'vertex' ? 'Vertex JSON 필요.' : apiType === 'firebase' ? 'Firebase 설정 필요.' : 'API 키 필요.'); return; }
            testBtn.disabled = true; testResult.textContent = '테스트 중...';
            try {
              const r = await C.callGeminiApi('Say "OK" in one word.', { apiType: settings.config.autoExtApiType, key: settings.config.autoExtKey, vertexJson: settings.config.autoExtVertexJson, vertexLocation: settings.config.autoExtVertexLocation, vertexProjectId: settings.config.autoExtVertexProjectId, firebaseScript: settings.config.autoExtFirebaseScript, model: settings.config.autoExtModel, maxRetries: 0 });
              testResult.textContent = r.text ? '✅ 성공: ' + r.text.trim().slice(0, 50) : '❌ 실패: ' + r.error; testResult.style.color = r.text ? '#4a9' : '#d66';
            } catch(e) { testResult.textContent = '❌ 오류: ' + e.message; testResult.style.color = '#d66'; }
            testBtn.disabled = false;
          };
          testRow.appendChild(testBtn); testRow.appendChild(testResult); nd.appendChild(testRow);
  
          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
  
          const ml = document.createElement('div'); ml.textContent = '기본 LLM 모델'; ml.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;display:flex;align-items:center;gap:4px;';
          const h_a3 = C.createHelpIcon((e) => C.showHelpPopup('자동 추출·지식 변환에 쓸 주요 LLM 모델을 선택합니다.<br><br>3.0 Flash: 속도와 품질 균형 (권장)<br>3.1 Pro: 품질 최우선 (비용↑)<br>2.5 Pro: 이전 세대 고성능<br>직접 입력: 목록에 없는 모델명 수동 입력<br><br>예시: 3.0 Flash로 두면 대부분의 RP 추출에 충분합니다.', e.currentTarget));
          ml.appendChild(h_a3);
          nd.appendChild(ml);
          const ms = document.createElement('select'); ms.style.cssText = S;
          [['Gemini 3.x', [['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]], ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); ms.appendChild(og); });
          ms.value = settings.config.autoExtModel || 'gemini-3-flash-preview';
          const ci = document.createElement('input'); ci.value = settings.config.autoExtCustomModel || ''; ci.style.cssText = S + 'margin-top:6px;' + (ms.value === '_custom' ? '' : 'display:none;');
          ci.onchange = () => { settings.config.autoExtCustomModel = ci.value; settings.save(); };
          ms.onchange = () => { settings.config.autoExtModel = ms.value; settings.save(); ci.style.display = ms.value === '_custom' ? '' : 'none'; };
          nd.appendChild(ms); nd.appendChild(ci);
  
          const rml = document.createElement('div'); rml.textContent = '재정렬(Reranker) 모델'; rml.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;display:flex;align-items:center;gap:4px;';
          const h_a4 = C.createHelpIcon((e) => C.showHelpPopup('임베딩 검색 결과 재정렬에 쓸 모델을 선택합니다.<br>기본 LLM과 분리해서 지정할 수 있습니다.<br><br>3.1 Flash Lite (추천): 속도가 빠르고 비용이 낮음<br>3.0 Flash: 안정적<br><br>예시: 기본 LLM은 3.0 Flash, Reranker는 3.1 Flash Lite로 두면 속도와 품질을 함께 확보합니다.', e.currentTarget));
          rml.appendChild(h_a4);
          nd.appendChild(rml);
          const rms = document.createElement('select'); rms.style.cssText = S;
          [['Gemini', [['3.1 Flash Lite (추천)', 'gemini-3.1-flash-lite-preview'], ['3.0 Flash', 'gemini-3-flash-preview'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); rms.appendChild(og); });
          rms.value = settings.config.rerankModel || 'gemini-3-flash-preview';
          rms.onchange = () => { settings.config.rerankModel = rms.value; settings.save(); };
          nd.appendChild(rms);
  
          const rplWrap = document.createElement('div'); rplWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px;';
          const rpl = document.createElement('div'); rpl.textContent = '재정렬(Reranker) 프롬프트'; rpl.style.cssText = 'font-size:11px;color:#999;';
          const rplBtn = document.createElement('button'); rplBtn.textContent = '기본값 복구'; rplBtn.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:3px;background:transparent;border:1px solid #446;color:#88c;cursor:pointer;';
          rplWrap.appendChild(rpl); rplWrap.appendChild(rplBtn); nd.appendChild(rplWrap);
  
          const rpta = document.createElement('textarea'); rpta.value = settings.config.rerankPrompt || C.DEFAULTS.rerankPrompt; rpta.style.cssText = S + 'height:100px;font-family:monospace;resize:vertical;';
          rpta.onchange = () => { settings.config.rerankPrompt = rpta.value; settings.save(); }; nd.appendChild(rpta);
          rplBtn.onclick = () => { if(confirm('Reranker 프롬프트를 기본값으로 되돌리시겠습니까?')) { settings.config.rerankPrompt = C.DEFAULTS.rerankPrompt; settings.save(); rpta.value = C.DEFAULTS.rerankPrompt; } };
  
          const rfl = document.createElement('div'); rfl.textContent = '교정(Refiner) 모델'; rfl.style.cssText = 'font-size:11px;color:#999;margin:14px 0 4px;display:flex;align-items:center;gap:4px;';
          const h_a5 = C.createHelpIcon((e) => C.showHelpPopup('AI 응답 교정(Refiner)에 쓸 모델을 선택합니다.<br>기본 LLM과 동일을 선택하면 기본 LLM 모델이 공유됩니다.<br><br>별도 모델을 지정하면 교정 전용 API 호출이 발생합니다.<br>예시: 기본 LLM은 3.0 Flash, 교정은 2.5 Flash Lite로 두면 교정 비용을 줄일 수 있습니다.', e.currentTarget));
          rfl.appendChild(h_a5);
          nd.appendChild(rfl);
          const rfs = document.createElement('select'); rfs.style.cssText = S;
          [['기본 LLM과 동일', [['(기본 LLM 사용)', '']]], ['Gemini 3.x', [['3.0 Flash', 'gemini-3-flash-preview'], ['3.1 Flash Lite', 'gemini-3.1-flash-lite-preview'], ['3.1 Pro', 'gemini-3.1-pro-preview']]], ['Gemini 2.x', [['2.5 Pro', 'gemini-2.5-pro'], ['2.5 Flash', 'gemini-2.5-flash'], ['2.5 Flash Lite', 'gemini-2.5-flash-lite'], ['2.0 Flash', 'gemini-2.0-flash']]], ['기타', [['직접 입력', '_custom']]]].forEach(([g, opts]) => { const og = document.createElement('optgroup'); og.label = g; opts.forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; og.appendChild(o); }); rfs.appendChild(og); });
          rfs.value = settings.config.refinerModel !== undefined ? settings.config.refinerModel : '';
          const rfci = document.createElement('input'); rfci.value = settings.config.refinerCustomModel || ''; rfci.placeholder = '모델명 직접 입력'; rfci.style.cssText = S + 'margin-top:6px;' + (rfs.value === '_custom' ? '' : 'display:none;');
          rfci.onchange = () => { settings.config.refinerCustomModel = rfci.value; settings.save(); };
          rfs.onchange = () => { settings.config.refinerModel = rfs.value; settings.save(); rfci.style.display = rfs.value === '_custom' ? '' : 'none'; };
          nd.appendChild(rfs); nd.appendChild(rfci);
  
          const rl = document.createElement('div'); rl.textContent = '추론(Reasoning) 레벨'; rl.style.cssText = 'font-size:11px;color:#999;margin:10px 0 4px;display:flex;align-items:center;gap:4px;';
          const h_a6 = C.createHelpIcon((e) => C.showHelpPopup('AI의 추론(생각 과정)에 할당할 토큰 수를 정합니다.<br>높을수록 복잡한 분석이 가능하지만 속도가 느려지고 비용이 늘어납니다.<br><br>Off: 추론 비활성화<br>Minimal (256): 최소 추론<br>Low (1024): 가벼운 추론<br>Medium (2048): 중간 (권장, 대부분 RP에 충분)<br>High (4096): 최대 추론<br>Budget: 직접 토큰 수 입력<br><br>예시: Medium(2048)으로 두면 자동 추출 시 복잡한 관계 분석도 잘 처리합니다.', e.currentTarget));
          rl.appendChild(h_a6);
          nd.appendChild(rl);
          const rs = document.createElement('select'); rs.style.cssText = S;
          [['Off', 'off'], ['Minimal (256)', 'minimal'], ['Low (1024)', 'low'], ['Medium (2048)', 'medium'], ['High (4096)', 'high'], ['Budget (사용자 지정)', 'budget']].forEach(([l, v]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; rs.appendChild(o); });
          rs.value = settings.config.autoExtReasoning || 'medium'; nd.appendChild(rs);
          const bl = document.createElement('div'); bl.textContent = '추론 예산 설정'; bl.style.cssText = 'font-size:11px;color:#666;margin-bottom:4px;margin-top:8px;' + (rs.value === 'budget' ? '' : 'display:none;');
          const bi = document.createElement('input'); bi.type = 'number'; bi.value = settings.config.autoExtBudget || 2048; bi.style.cssText = S + (rs.value === 'budget' ? '' : 'display:none;');
          bi.onchange = () => { settings.config.autoExtBudget = parseInt(bi.value) || 2048; settings.save(); };
          rs.onchange = () => { settings.config.autoExtReasoning = rs.value; settings.save(); const isB = rs.value === 'budget'; bl.style.display = isB ? '' : 'none'; bi.style.display = isB ? '' : 'none'; };
          nd.appendChild(bl); nd.appendChild(bi);
        }});
      }, 'API 설정');
    });
  });
  
  _w.__LoreInj.__subApiLoaded = true;
})();
