// injecter / sub-main — 메인 설정 패널
// 역할: 빠른 설정, 인젝션 토글, 검색/감지, 주입 위치, 출력 포맷
// 의존: injecter-3 (settings, db, C, OOC_FORMATS)
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-main] settings 미로드'); return; }
  if (_w.__LoreInj.__subMainLoaded) return;

  const { C, db, _ls, settings, OOC_FORMATS } = _w.__LoreInj;

  _w.__LoreInj.registerMenu = _w.__LoreInj.registerMenu || function() {};

  _w.__LoreInj.registerMenu('main', function(modal) {
    modal.createMenu('로어 설정', (m) => {
      m.replaceContentPanel(async (panel) => {
        const PRESETS = {
          beginner: { name: '기본 추천', desc: '임베딩 검색 + 8턴 주기 자동 추출. 일반 RP.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 4, cooldownTurns: 8, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
          minimal: { name: '수동 검색', desc: '자동 추출 OFF. 수동 추출만 사용. API 호출 최소.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true, scanOffset: 2, maxEntries: 3, cooldownTurns: 6, loreBudgetChars: 250, loreBudgetMax: 400, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
          advanced: { name: '정밀 (리랭커)', desc: '자동 추출 5턴 + 재정렬 + 의미 기반 교정까지. 장문 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 5, cooldownTurns: 8, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 10, aiMemoryTurns: 4, pendingPromiseBoost: true, rerankEnabled: true, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true, refinerEnabled: true, refinerLoreMode: 'semantic' } }
        };
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '빠른 설정'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;display:flex;align-items:center;gap:6px;';
          const h = C.createHelpIcon((e) => C.showHelpPopup('저장된 설정 묶음을 한 번에 적용합니다.<br>기존 설정은 기본값으로 초기화된 뒤 프리셋 값으로 덮어씁니다.<br><br>예시: [기본 추천] 선택 시 임베딩 검색 ON + 8턴 주기 자동 추출이 함께 켜집니다.<br>적용 후 페이지 새로고침이 필요합니다.', e.currentTarget));
          t.appendChild(h);
          nd.appendChild(t);
          const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
          for (const [key, preset] of Object.entries(PRESETS)) {
            const btn = document.createElement('button'); btn.style.cssText = 'padding:10px 14px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid #333;background:#1a1a1a;color:#ccc;display:flex;flex-direction:column;gap:4px;text-align:left;flex:1;min-width:110px;';
            const nm = document.createElement('div'); nm.textContent = preset.name; nm.style.cssText = 'font-weight:bold;color:#4a9;font-size:13px;';
            const ds = document.createElement('div'); ds.textContent = preset.desc; ds.style.cssText = 'font-size:10px;color:#888;';
            btn.appendChild(nm); btn.appendChild(ds);
            btn.onclick = () => {
              if (!confirm('[' + preset.name + '] 프리셋 적용?')) return;
              settings.config = JSON.parse(JSON.stringify(_w.__LoreInj.defaultSettings)); Object.assign(settings.config, preset.config); settings.save();
              m.replaceContentPanel((p) => p.addText('새로고침 필요함.'), '설정 갱신 필요');
            };
            row.appendChild(btn);
          }
          nd.appendChild(row);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const toggle1 = C.createToggleRow('로어 인젝션 활성화', '대화에 설정 정보를 자동 삽입함.', settings.config.enabled, (v) => { settings.config.enabled = v; settings.save(); });
          const h1 = C.createHelpIcon((e) => C.showHelpPopup('전체 로어 주입 기능의 메인 스위치입니다.<br>켜면 대화에서 키워드가 감지될 때 저장된 로어 정보가 AI 프롬프트에 자동 삽입됩니다.<br><br>예시: 로어에 "Alice=사과 싫어함"을 저장해두면 대화에 "사과"가 나올 때 해당 정보가 프롬프트에 포함됩니다.<br>꺼두면 모든 로어 주입이 정지됩니다 (로어 DB 자체는 삭제되지 않음).', e.currentTarget));
          toggle1.querySelector('div > div').appendChild(h1);
          nd.appendChild(toggle1);

          const toggle2 = C.createToggleRow('적응형 로어 압축', '주입 공간 부족 시 텍스트를 자동으로 짧게 줄임.', settings.config.useCompressedFormat !== false, (v) => { settings.config.useCompressedFormat = v; settings.save(); });
          const h2 = C.createHelpIcon((e) => C.showHelpPopup('주입할 로어 분량이 많을 때 텍스트를 자동으로 축약합니다.<br>로어 항목의 summary에 full/compact/micro 3단계 요약이 저장되어 있으면, 예산에 맞춰 자동 선택합니다.<br><br>예시: 10개 로어가 동시에 주입되면 full → compact → micro 순으로 줄여 프롬프트 공간을 확보합니다.<br>꺼두면 항상 원본(full) 텍스트가 주입됩니다.', e.currentTarget));
          toggle2.querySelector('div > div').appendChild(h2);
          nd.appendChild(toggle2);
          const cmpWrap = document.createElement('div'); cmpWrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding-left:10px;';
          const cmpLbl = document.createElement('div'); cmpLbl.textContent = '압축 모드'; cmpLbl.style.cssText = 'font-size:12px;color:#aaa;';
          const h3 = C.createHelpIcon((e) => C.showHelpPopup('압축할 때 어떤 수준의 요약을 쓸지 정합니다.<br><br>자동: 예산(주입 공간)에 맞춰 full/compact/micro 중 자동 선택<br>전체 표시 (Full): 원본 요약 전체 사용 (분량 많음)<br>요약 (Compact): 핵심 관계/상태만 남김<br>최소 (Micro): 이름 + 현재 상태만 (분량 최소)<br><br>예시: "요약 (Compact)"을 선택하면 모든 로어가 중간 길이로 주입됩니다.', e.currentTarget));
          cmpLbl.appendChild(h3);
          const cmpSel = document.createElement('select'); cmpSel.style.cssText = 'width:120px;padding:4px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:11px;';
          [{v:'auto', l:'자동 (예산 맞춤)'}, {v:'full', l:'전체 표시 (Full)'}, {v:'compact', l:'요약 (Compact)'}, {v:'micro', l:'최소 (Micro)'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; cmpSel.appendChild(opt); });
          cmpSel.value = settings.config.compressionMode || 'auto';
          cmpSel.onchange = () => { settings.config.compressionMode = cmpSel.value; settings.save(); };
          cmpWrap.appendChild(cmpLbl); cmpWrap.appendChild(cmpSel); nd.appendChild(cmpWrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '검색 & 감지'; t.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(t);
          const t1 = C.createToggleRow('임베딩 검색', '의미 기반 검색. API 필요.', settings.config.embeddingEnabled, (v) => { settings.config.embeddingEnabled = v; settings.save(); });
          const h4 = C.createHelpIcon((e) => C.showHelpPopup('키워드 정확 매칭 대신, 뜻이 비슷한 로어도 찾아냅니다.<br>대화 문장을 벡터로 변환해 저장된 로어 벡터와 비교합니다.<br><br>예시: 대화에 "강아지"가 나오면 "개"라는 이름의 로어도 검색 결과에 포함됩니다.<br>API 호출이 필요하므로 꺼두면 키워드 매칭만 동작합니다 (속도는 빠름).', e.currentTarget));
          t1.querySelector('div > div').appendChild(h4);
          nd.appendChild(t1);
          const emRow = document.createElement('div'); emRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;margin-bottom:8px;';
          const emL = document.createElement('div'); emL.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const eml1 = document.createElement('div'); eml1.textContent = '임베딩 모델'; eml1.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const h5 = C.createHelpIcon((e) => C.showHelpPopup('텍스트를 벡터로 변환하는 모델을 선택합니다.<br><br>gemini-embedding-001: 안정적이며 추천<br>gemini-embedding-2-preview: 최신 모델 (품질 차이 미미)<br><br>주의: 모델을 변경하면 기존 임베딩이 무효화되어 재생성해야 합니다. 파일 탭에서 팩 단위 임베딩 버튼을 누르세요.', e.currentTarget));
          eml1.appendChild(h5);
          emL.appendChild(eml1);
          const emSel = document.createElement('select'); emSel.style.cssText = 'width:200px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          [{v:'gemini-embedding-001',l:'gemini-embedding-001'},{v:'gemini-embedding-2-preview',l:'gemini-embedding-2-preview'}].forEach(o => { const opt = document.createElement('option'); opt.value = o.v; opt.textContent = o.l; emSel.appendChild(opt); });
          emSel.value = settings.config.embeddingModel || 'gemini-embedding-001';
          emSel.onchange = () => { settings.config.embeddingModel = emSel.value; settings.save(); alert('모델 변경됨. 기존 임베딩 재생성 필요.'); };
          emRow.appendChild(emL); emRow.appendChild(emSel); nd.appendChild(emRow);

          const t2 = C.createToggleRow('자동 임베딩 생성', '대화 추출 후 임베딩 갱신.', settings.config.autoEmbedOnExtract !== false, (v) => { settings.config.autoEmbedOnExtract = v; settings.save(); });
          const h6 = C.createHelpIcon((e) => C.showHelpPopup('자동 대화 추출로 새 로어가 생성될 때, 바로 임베딩 벡터를 만들어줍니다.<br>꺼두면 수동으로 파일 탭에서 임베딩 버튼을 눌러야 검색에 반영됩니다.<br><br>예시: 켜두면 추출 실행 → 새 로어 생성 → 임베딩 자동 생성이 한 번에 완료됩니다.<br>API 호출이 추가로 발생하므로 비용이 늘어납니다.', e.currentTarget));
          t2.querySelector('div > div').appendChild(h6);
          nd.appendChild(t2);
          const t3 = C.createToggleRow('시간 감쇠', '오래된 로어 재주입. 쿨다운 무시.', settings.config.decayEnabled, (v) => { settings.config.decayEnabled = v; settings.save(); });
          const h7 = C.createHelpIcon((e) => C.showHelpPopup('오래 등장하지 않은 로어의 재주입 우선도를 점차 올립니다.<br>AI가 잊을 무렵 다시 떠올리게 하는 기능입니다.<br><br>예시: 특정 캐릭터 설정이 10턴 넘게 언급 안 되면 재주입 점수가 올라 다음 주입 후보가 됩니다.<br>쿨다운 중이어도 점수가 충분히 높으면 재주입됩니다.', e.currentTarget));
          t3.querySelector('div > div').appendChild(h7);
          nd.appendChild(t3);
          const t4 = C.createToggleRow('LLM 재정렬 (Reranker)', 'Gemini로 검색 결과 재정렬.', settings.config.rerankEnabled || false, (v) => { settings.config.rerankEnabled = v; settings.save(); });
          const h8 = C.createHelpIcon((e) => C.showHelpPopup('임베딩 검색으로 찾은 후보들을 LLM이 현재 장면에 맞게 다시 정렬합니다.<br>관련도가 낮은 로어가 걸러지고, 중요한 항목이 상위로 올라옵니다.<br><br>예시: 검색 결과가 10개라면 재정렬이 현재 씬과 가장 관련 있는 5개만 상위로 올립니다.<br>API 호출이 추가로 발생하므로 비용이 늘어납니다. 정밀 프리셋에서 기본 ON.', e.currentTarget));
          t4.querySelector('div > div').appendChild(h8);
          nd.appendChild(t4);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;justify-content:space-between;align-items:center;width:100%;';
          const left = document.createElement('div'); left.style.cssText = 'display:flex;flex-direction:column;gap:4px;flex:1;';
          const tt = document.createElement('div'); tt.textContent = '주입 위치'; tt.style.cssText = 'font-size:13px;color:#ccc;font-weight:bold;';
          const h9 = C.createHelpIcon((e) => C.showHelpPopup('로어 정보가 삽입되는 위치를 정합니다.<br><br>메시지 앞: 유저 메시지 직전에 로어 삽입 (AI가 다음 응답 시 참조)<br>메시지 뒤: AI 응답 직후에 로어 삽입 (다음 턴부터 참조)<br><br>예시: "메시지 앞"으로 두면 유저가 "사과 줘"라고 입력할 때, "Alice는 사과를 싫어함" 정보가 그 직후에 삽입되어 AI 응답에 반영됩니다.<br>대부분 "메시지 앞"이 안정적입니다.', e.currentTarget));
          tt.appendChild(h9);
          const d = document.createElement('div'); d.textContent = '메시지 기준 로어 삽입 위치.'; d.style.cssText = 'font-size:11px;color:#888;';
          left.appendChild(tt); left.appendChild(d);
          const right = document.createElement('div'); right.style.cssText = 'display:flex;gap:6px;';
          const b1 = document.createElement('button'), b2 = document.createElement('button');
          const updateBtns = () => { const isB = settings.config.position === 'before'; b1.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${isB ? '#285' : '#444'};background:${isB ? '#285' : 'transparent'};color:${isB ? '#fff' : '#ccc'};`; b2.style.cssText = `padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;border:1px solid ${!isB ? '#285' : '#444'};background:${!isB ? '#285' : 'transparent'};color:${!isB ? '#fff' : '#ccc'};`; };
          b1.textContent = '메시지 앞'; b1.onclick = () => { settings.config.position = 'before'; settings.save(); updateBtns(); };
          b2.textContent = '메시지 뒤'; b2.onclick = () => { settings.config.position = 'after'; settings.save(); updateBtns(); };
          updateBtns(); right.appendChild(b1); right.appendChild(b2); wrap.appendChild(left); wrap.appendChild(right); nd.appendChild(wrap);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const tr = document.createElement('div'); tr.textContent = '추가 정보 주입'; tr.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;'; nd.appendChild(tr);
          const t5 = C.createToggleRow('호칭 매트릭스', '캐릭터 간 호칭 정보를 압축하여 전달.', settings.config.honorificMatrixEnabled !== false, (v) => { settings.config.honorificMatrixEnabled = v; settings.save(); });
          const h10 = C.createHelpIcon((e) => C.showHelpPopup('캐릭터끼리 서로를 어떻게 부르는지(너/씨/오빠 등)를 관계 항목에 기록해 AI에게 전달합니다.<br><br>예시: A→B는 "자기", B→A는 "오빠"로 저장돼 있으면 AI가 일관되게 그 호칭을 사용합니다.<br>호칭은 자동 추출이 대화에서 탐지한 것을 로어 항목에 기록합니다. 필요 시 로어 관리에서 직접 수정하세요.', e.currentTarget));
          t5.querySelector('div > div').appendChild(h10);
          nd.appendChild(t5);
          const t6 = C.createToggleRow('서사 연속성 기능', '첫 만남 블록/재회 태그/호칭 변화 힌트/lastSeen 갱신 등을 일괄 관리.', settings.config.firstEncounterWarning !== false, (v) => { settings.config.firstEncounterWarning = v; settings.save(); });
          const h11 = C.createHelpIcon((e) => C.showHelpPopup('처음 만난 사이인지 이미 아는 사이인지를 구분해 엉뚱한 대사를 줄입니다.<br><br>예시: 이미 만난 캐릭터가 재등장하면 자동으로 재회 태그가 붙어, "처음 뵙겠습니다" 같은 대사가 나오지 않습니다.<br>lastSeen(마지막 등장 턴)을 추적하여 서사 흐름을 유지합니다.', e.currentTarget));
          t6.querySelector('div > div').appendChild(h11);
          nd.appendChild(t6);
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t1 = document.createElement('div'); t1.textContent = '출력 포맷'; t1.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #333;display:flex;align-items:center;gap:6px;';
          const h12 = C.createHelpIcon((e) => C.showHelpPopup('AI에게 "이건 배경지식"이라고 알리는 방식을 정합니다.<br><br>OOC: 중괄호나 대괄호로 감싸 AI에게 시스템 정보임을 명시 (권장)<br>System 태그: 시스템 프롬프트 형식<br>내레이터: 내레이션 스타일로 자연스럽게 섞음<br>최소: 태그 없이 원본 텍스트만<br><br>예시: OOC 선택 시 로어가 [lore: Alice는 사과를 싫어함] 형태로 주입됩니다.<br>커스텀을 선택하면 접두사/접미사를 직접 입력할 수 있습니다.', e.currentTarget));
          t1.appendChild(h12);
          nd.appendChild(t1);
          const oocSel = document.createElement('select'); oocSel.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
          for (const [k, v] of Object.entries(OOC_FORMATS)) { const opt = document.createElement('option'); opt.value = k; opt.textContent = v.name + ' — ' + v.desc; oocSel.appendChild(opt); }
          oocSel.value = settings.config.oocFormat || 'custom';
          const pInp = document.createElement('input'); pInp.value = settings.config.prefix || ''; pInp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:12px;';
          pInp.onchange = () => { settings.config.prefix = pInp.value; settings.save(); };
          const sInp = document.createElement('input'); sInp.value = settings.config.suffix || ''; sInp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:20px;';
          sInp.onchange = () => { settings.config.suffix = sInp.value; settings.save(); };
          oocSel.onchange = () => {
            const fmt = OOC_FORMATS[oocSel.value];
            if (fmt && oocSel.value !== 'custom') { pInp.value = fmt.prefix; sInp.value = fmt.suffix; settings.config.prefix = fmt.prefix; settings.config.suffix = fmt.suffix; }
            settings.config.oocFormat = oocSel.value; settings.save();
            pInp.disabled = oocSel.value !== 'custom'; sInp.disabled = oocSel.value !== 'custom';
            pInp.style.opacity = oocSel.value !== 'custom' ? '0.6' : '1'; sInp.style.opacity = oocSel.value !== 'custom' ? '0.6' : '1';
          };
          nd.appendChild(oocSel); nd.appendChild(pInp); nd.appendChild(sInp);
          const isCustom = (settings.config.oocFormat || 'custom') === 'custom';
          pInp.disabled = !isCustom; sInp.disabled = !isCustom; pInp.style.opacity = isCustom ? '1' : '0.6'; sInp.style.opacity = isCustom ? '1' : '0.6';
        }});

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const resetBtn = document.createElement('button'); resetBtn.textContent = '모든 설정 초기화 (DB 유지)'; resetBtn.style.cssText = 'width:100%;padding:10px;margin-top:20px;background:#833;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;';
          resetBtn.onclick = () => {
            if (!confirm('설정 초기화? API 설정값과 DB/로어 팩 활성화는 유지됩니다.')) return;
            if (_w.__LoreInj.resetSettingsKeepApi) _w.__LoreInj.resetSettingsKeepApi();
            else {
              const keep = {
                autoExtApiType: settings.config.autoExtApiType,
                autoExtKey: settings.config.autoExtKey,
                autoExtVertexJson: settings.config.autoExtVertexJson,
                autoExtVertexLocation: settings.config.autoExtVertexLocation,
                autoExtVertexProjectId: settings.config.autoExtVertexProjectId,
                autoExtFirebaseScript: settings.config.autoExtFirebaseScript,
                autoExtFirebaseEmbedKey: settings.config.autoExtFirebaseEmbedKey,
                embeddingModel: settings.config.embeddingModel
              };
              _ls.removeItem('lore-injector-v5');
              Object.assign(settings.config, keep);
              settings.save();
            }
            location.reload();
          }; nd.appendChild(resetBtn);
        }});
      }, '메인 설정');
    });
  });

  _w.__LoreInj.__subMainLoaded = true;
})();
