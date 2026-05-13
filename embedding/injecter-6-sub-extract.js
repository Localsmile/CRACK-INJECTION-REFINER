// injecter-6-sub-extract.js: 자동 대화 추출 + 배치 추출 + 템플릿 + URL/텍스트 변환
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subExtractLoaded) return;
  
  const { C, db, settings, getAutoExtPackForUrl, setAutoExtPackForUrl, setPackEnabled } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  function buildGenerationApiOpts(overrides = {}, costContext = null) {
    const cfg = settings.config || {};
    const model = cfg.autoExtModel === '_custom'
      ? cfg.autoExtCustomModel
      : cfg.autoExtModel;
    const opts = {
      apiType: cfg.autoExtApiType || 'key',
      key: cfg.autoExtKey,
      vertexJson: cfg.autoExtVertexJson,
      vertexLocation: cfg.autoExtVertexLocation || 'global',
      vertexProjectId: cfg.autoExtVertexProjectId,
      firebaseScript: cfg.autoExtFirebaseScript,
      firebaseEmbedKey: cfg.autoExtFirebaseEmbedKey,
      model: model || 'gemini-3-flash-preview',
      maxRetries: cfg.autoExtMaxRetries || 1,
      responseMimeType: 'application/json',
      costContext,
      ...overrides
    };
    const reasoning = cfg.autoExtReasoning || 'medium';
    if (String(opts.model || '').includes('gemini-3') && reasoning && reasoning !== 'off' && reasoning !== 'budget') {
      opts.thinkingConfig = { thinkingLevel: reasoning };
    }
    if (String(opts.model || '').includes('pro') && opts.thinkingConfig?.thinkingLevel === 'minimal') {
      opts.thinkingConfig.thinkingLevel = 'low';
    }
    return opts;
  }
  
  _w.__LoreInj.registerSubMenu('extract', function(modal) {
    modal.createSubMenu('추출/변환 설정', (m) => {
      m.replaceContentPanel((panel) => {
        // === 자동 대화 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          nd.appendChild(C.createToggleRow('자동 대화 정리', '정해진 턴마다 대화를 로어에 추가함.', settings.config.autoExtEnabled, (v) => { settings.config.autoExtEnabled = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('기존 로어 참고', '저장된 로어를 같이 참고해 중복 저장 줄임.', settings.config.autoExtIncludeDb, (v) => { settings.config.autoExtIncludeDb = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('변경분만 저장', '기존 로어 전체 대신 바뀐 부분만 받아 출력 토큰 줄임.', settings.config.autoExtPatchMode !== false, (v) => { settings.config.autoExtPatchMode = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('페르소나 정보 전송', '추출 시 페르소나 이름을 같이 보내 정확도 올림.', settings.config.autoExtIncludePersona, (v) => { settings.config.autoExtIncludePersona = v; settings.save(); }));
          nd.appendChild(C.createToggleRow('중요 장면 기억하기', '중요 사건/약속을 나중에 떠올릴 수 있게 별도 정리함.', settings.config.temporalExtractEnabled !== false, (v) => { settings.config.temporalExtractEnabled = v; settings.save(); }));
  
          const row1 = document.createElement('div'); row1.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;align-items:center;';
          const makeInput = (label, key, defaultVal) => {
            const f = document.createElement('div'); f.style.flex = '1';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            const saveNum = () => { const v = parseInt(i.value); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } };
            i.oninput = saveNum; i.onchange = saveNum;
            f.appendChild(l); f.appendChild(i); return f;
          };
          row1.appendChild(makeInput('자동 정리 주기', 'autoExtTurns', 8)); row1.appendChild(makeInput('읽을 최근 대화', 'autoExtScanRange', 6)); row1.appendChild(makeInput('최근 제외', 'autoExtOffset', 5)); row1.appendChild(makeInput('중요 장면 최대', 'temporalMaxEventsPerPass', 5));
          nd.appendChild(row1);
  
          const row2 = document.createElement('div'); row2.style.cssText = 'display:flex;gap:12px;margin-bottom:12px;align-items:center;';
          const f3 = document.createElement('div'); f3.style.flex = '1';
          const l3 = document.createElement('div'); l3.textContent = '저장할 로어팩'; l3.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
          const inputWrap = document.createElement('div'); inputWrap.style.cssText = 'display:flex;gap:6px;';
          const i3 = document.createElement('input'); i3.type = 'text';
          getAutoExtPackForUrl(C.getCurUrl()).then(name => i3.value = name);
          i3.style.cssText = 'flex:1;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
          const savePackName = () => { const val = i3.value || '자동추출'; settings.config.autoExtPack = val; setAutoExtPackForUrl(C.getCurUrl(), val); };
          i3.oninput = savePackName; i3.onchange = savePackName;
          const s3 = document.createElement('select'); s3.style.cssText = 'width:100px;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;';
          db.packs.toArray().then(packs => { const opt = document.createElement('option'); opt.value = ''; opt.textContent = '기존 선택'; s3.appendChild(opt); packs.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; s3.appendChild(o); }); });
          s3.onchange = () => { if (s3.value) { i3.value = s3.value; settings.config.autoExtPack = s3.value; setAutoExtPackForUrl(C.getCurUrl(), s3.value); s3.value = ''; } };
          inputWrap.appendChild(i3); inputWrap.appendChild(s3); f3.appendChild(l3); f3.appendChild(inputWrap);
          row2.appendChild(f3); nd.appendChild(row2);
  
          const btnRun = document.createElement('button'); btnRun.textContent = '수동 추출 실행';
          btnRun.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;width:100%;margin-top:10px;';
          const btnStatus = document.createElement('div'); btnStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.4;'; btnStatus.textContent = '';
          btnRun.onclick = async () => {
            if (!confirm('수동 추출 시작?')) return;
            settings.save();
            btnRun.disabled = true;
            const origText = btnRun.textContent;
            const startMs = Date.now();
            btnRun.textContent = '에리가 추출 중...';
            btnStatus.textContent = '에리가 대화 분석 중';
            btnStatus.style.color = '#4a9';
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              btnStatus.textContent = `에리가 대화 분석 중 (${sec}초)`;
            }, 1000);
            try {
              await _w.__LoreInj.runAutoExtract(true);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - startMs) / 1000);
              btnStatus.textContent = `에리: 완료 (${sec}초)`;
              btnStatus.style.color = '#4a9';
              setTimeout(() => { btnStatus.textContent = ''; }, 4000);
            } catch(e) {
              clearInterval(tick);
              btnStatus.textContent = '에리: 실패 — ' + (e.message || e).slice(0, 50);
              btnStatus.style.color = '#d66';
            } finally {
              btnRun.textContent = origText;
              btnRun.disabled = false;
            }
          };
          nd.appendChild(btnRun);
          nd.appendChild(btnStatus);
        }});
  
        // === 과거 장면 불러오기 판단 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const jt = document.createElement('div'); jt.textContent = '과거 장면 불러오기 판단'; jt.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:6px;'; nd.appendChild(jt);
          const jd = document.createElement('div'); jd.textContent = '사용 여부와 호출 범위만 여기서 조절함. 모델/생각 깊이는 API 설정에서 관리함.'; jd.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(jd);
          nd.appendChild(C.createToggleRow('AI로 참고 장면 고르기', '규칙 판단 뒤 AI가 필요한 과거 장면 한 번 더 고름.', settings.config.temporalRecallJudgeEnabled, (v) => { settings.config.temporalRecallJudgeEnabled = v; settings.save(); }));
          const jrow = document.createElement('div'); jrow.style.cssText = 'display:flex;gap:12px;margin-top:10px;';
          const jmkNum = (label, key, defaultVal, min, max) => { const f = document.createElement('div'); f.style.flex = '1'; const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:11px;color:#999;margin-bottom:4px;'; const i = document.createElement('input'); i.type = 'number'; i.value = settings.config[key] !== undefined ? settings.config[key] : defaultVal; if (min !== undefined) i.min = min; if (max !== undefined) i.max = max; i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;'; const save = () => { const v = parseInt(i.value); if (!isNaN(v)) { settings.config[key] = v; settings.save(); } }; i.oninput = save; i.onchange = save; f.appendChild(l); f.appendChild(i); return f; };
          jrow.appendChild(jmkNum('응답 제한 시간(ms)', 'temporalRecallJudgeTimeoutMs', 2500, 500, 30000));
          jrow.appendChild(jmkNum('검토할 장면 수', 'temporalRecallJudgeCandidateLimit', 6, 1, 30));
          nd.appendChild(jrow);
        }});
  
        // === 전체 로그 일괄 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const bTitle = document.createElement('div'); bTitle.textContent = '전체 로그 일괄 추출'; bTitle.style.cssText = 'font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;'; nd.appendChild(bTitle);
          const bDesc = document.createElement('div'); bDesc.textContent = '긴 대화를 배치로 나눠 정리함. API 비용 큼. 초기 정리용.'; bDesc.style.cssText = 'font-size:11px;color:#888;margin-bottom:10px;line-height:1.4;'; nd.appendChild(bDesc);
  
          const bRow = document.createElement('div'); bRow.style.cssText = 'display:flex;gap:12px;margin-bottom:8px;align-items:center;';
          const mkNum = (label, getter, setter, defaultVal) => {
            const f = document.createElement('div'); f.style.flex = '1';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:#888;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; const cur = getter(); i.value = (cur !== undefined && cur !== null) ? cur : defaultVal;
            i.style.cssText = 'width:100%;padding:6px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;';
            const save = () => { const v = parseInt(i.value); if (!isNaN(v)) { setter(v); settings.save(); } };
            i.oninput = save; i.onchange = save;
            f.appendChild(l); f.appendChild(i); return f;
          };
          bRow.appendChild(mkNum('배치 크기(턴)', () => settings.config.batchExtTurnsPerBatch, v => settings.config.batchExtTurnsPerBatch = v, 50));
          bRow.appendChild(mkNum('오버랩(턴)', () => settings.config.batchExtOverlap, v => settings.config.batchExtOverlap = v, 5));
          bRow.appendChild(mkNum('재시도', () => settings.config.batchExtMaxAttempts, v => settings.config.batchExtMaxAttempts = v, 3));
          nd.appendChild(bRow);
  
          const bBtn = document.createElement('button'); bBtn.textContent = '전체 일괄 추출 실행';
          bBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#258;color:#fff;border:none;font-weight:bold;width:100%;margin-top:6px;';
          const bStatus = document.createElement('div'); bStatus.style.cssText = 'font-size:11px;color:#888;margin-top:6px;text-align:center;line-height:1.5;';
          bBtn.onclick = async () => {
            if (!confirm('전체 로그를 배치로 분석함. API 비용 큼. 계속?')) return;
            settings.save();
            bBtn.disabled = true; const orig = bBtn.textContent; bBtn.textContent = '실행 중...';
            bStatus.textContent = '전체 로그 가져오는 중'; bStatus.style.color = '#4a9';
            const start = Date.now();
            try {
              const report = await _w.__LoreInj.runBatchExtract({
                turnsPerBatch: settings.config.batchExtTurnsPerBatch || 50,
                overlap: settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5,
                maxAttempts: settings.config.batchExtMaxAttempts || 3,
                onProgress: (ev) => {
                  const sec = Math.floor((Date.now() - start) / 1000);
                  if (ev.phase === 'batch') bStatus.textContent = '배치 ' + ev.index + '/' + ev.total + ' 처리 중 (' + sec + '초)';
                }
              });
              const sec = Math.floor((Date.now() - start) / 1000);
              let msg = '완료 (' + sec + '초) — ' + report.totalBatches + '개 배치 / 성공 ' + report.ok + ' / 빈 ' + report.empty + ' / 실패 ' + report.failed + ' / 병합 ' + report.entriesAdded + '건';
              if (report.failed > 0) { msg += ' ⚠️ 실패 상세는 로그 탭'; bStatus.style.color = '#da8'; }
              else { bStatus.style.color = '#4a9'; }
              bStatus.textContent = msg;
            } catch(e) {
              bStatus.textContent = '실패 — ' + (e.message || String(e)).slice(0, 80);
              bStatus.style.color = '#d66';
            } finally {
              bBtn.textContent = orig; bBtn.disabled = false;
            }
          };
          nd.appendChild(bBtn);
          nd.appendChild(bStatus);
        }});
  
        // === 지식 변환 (URL/텍스트 → 로어) ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const S = 'width:100%;padding:6px 8px;border:1px solid #333;border-radius:4px;background:#0a0a0a;color:#ccc;font-size:12px;box-sizing:border-box;margin-bottom:8px;';
          nd.innerHTML = '<div style="font-size:14px;color:#4a9;font-weight:bold;margin-bottom:8px;">지식 변환 (URL/텍스트 → 로어)</div>';
          const urlInp = document.createElement('input'); urlInp.type = 'text'; urlInp.placeholder = 'URL 입력'; urlInp.style.cssText = S; nd.appendChild(urlInp);
          const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = '팩 이름'; nameInp.style.cssText = S; nd.appendChild(nameInp);
          const rDiv = document.createElement('div'); rDiv.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const urlBtn = document.createElement('button'); urlBtn.textContent = 'URL 변환'; urlBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          urlBtn.onclick = async () => {
            if (!urlInp.value.trim() || !nameInp.value.trim()) { alert('URL과 팩이름 필요.'); return; }
            urlBtn.disabled = true; urlBtn.textContent = '변환중...';
            const startMs = Date.now();
            let phaseMsg = '에리가 URL 본문 가져오는 중';
            const setBusy = (msg, color = '#4a9') => {
              phaseMsg = msg;
              rDiv.textContent = msg;
              rDiv.style.color = color;
              try { C.showStatusBadge(msg); } catch (_) {}
            };
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              setBusy(phaseMsg.replace(/\s*\(\d+초\)$/, '') + ` (${sec}초)`);
            }, 1000);
            setBusy(phaseMsg + ' (0초)');
            try {
              const cnt = await C.importFromUrl(urlInp.value.trim(), nameInp.value.trim(), buildGenerationApiOpts({}, { feature: 'urlImport', chatKey: (C.getCurrentChatId && C.getCurrentChatId()) || 'global' }), {
                onProgress: (ev) => {
                  if (!ev) return;
                  switch (ev.phase) {
                    case 'fetch:start':
                      setBusy('에리가 URL 본문 가져오는 중');
                      break;
                    case 'fetch:try': {
                      const methodLabel = ({ 'gm-direct': 'GM 직접 요청', 'fetch': '브라우저 fetch', 'proxy': '공용 프록시' })[ev.method] || ev.method;
                      const suffix = ev.method === 'proxy' ? ` #${ev.attempt}/${ev.total}` : '';
                      const sec = Math.max(1, Math.floor((ev.timeoutMs || 15000) / 1000));
                      setBusy(`에리가 URL 가져오는 중 · ${methodLabel}${suffix} (최대 ${sec}초)`);
                      break;
                    }
                    case 'fetch:done':
                      setBusy(`에리가 URL 본문 받음 · ${((ev.bytes || 0) / 1024).toFixed(1)}KB`);
                      break;
                    case 'parse':
                      setBusy('에리가 HTML 정리 중');
                      break;
                    case 'fetch:fail':
                      setBusy('URL 가져오기 실패 — 모든 경로 컷', '#d66');
                      break;
                    case 'chunk':
                      setBusy(`에리가 URL 내용을 로어로 변환 중: 청크 ${ev.chunk}/${ev.total} · 시도 ${ev.attempt}/${ev.maxAttempts}`);
                      break;
                  }
                }
              });
              const rpt = C.__lastImportReport;
              let msg = '✅ ' + cnt + '개 생성';
              if (rpt) {
                if (rpt.failed > 0) {
                  const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || '';
                  msg += ' ⚠️ 청크 ' + rpt.failed + '/' + rpt.chunks + ' 실패: ' + firstErr.slice(0, 80);
                } else if (cnt === 0 && rpt.empty === rpt.chunks) {
                  msg = '⚠️ 0개 — 모든 청크(' + rpt.chunks + '개)에서 AI가 추출 가능한 내용 없다고 판단';
                }
              }
              rDiv.textContent = msg;
              rDiv.style.color = cnt > 0 ? '#4a9' : '#da8';
              if (cnt > 0) await setPackEnabled(nameInp.value.trim(), true);
            } catch (e) {
              rDiv.textContent = '❌ ' + (e.message || String(e));
              rDiv.style.color = '#d66';
            } finally {
              clearInterval(tick);
              try { C.hideStatusBadge(); } catch (_) {}
              urlBtn.textContent = 'URL 변환'; urlBtn.disabled = false;
            }
          };
          nd.appendChild(urlBtn); nd.appendChild(rDiv);
          const t2 = document.createElement('div'); t2.innerHTML = '<div style="font-size:13px;color:#ccc;font-weight:bold;margin-top:16px;margin-bottom:8px;">텍스트 → 로어 팩</div>'; nd.appendChild(t2);
          const ta = document.createElement('textarea'); ta.placeholder = '설정, 소설 텍스트 등'; ta.style.cssText = S + 'height:100px;resize:vertical;'; nd.appendChild(ta);
          const nameInp2 = document.createElement('input'); nameInp2.type = 'text'; nameInp2.placeholder = '팩 이름'; nameInp2.style.cssText = S; nd.appendChild(nameInp2);
          const rDiv2 = document.createElement('div'); rDiv2.style.cssText = 'font-size:12px;color:#888;margin-top:8px;';
          const tBtn = document.createElement('button'); tBtn.textContent = '텍스트 변환'; tBtn.style.cssText = 'padding:8px 16px;font-size:12px;border-radius:4px;cursor:pointer;background:#285;color:#fff;border:none;font-weight:bold;';
          tBtn.onclick = async () => {
            if (!ta.value.trim() || !nameInp2.value.trim()) { alert('입력값 필요.'); return; }
            tBtn.disabled = true; tBtn.textContent = '변환중...';
            const startMs = Date.now();
            let phaseMsg = '에리가 텍스트를 로어로 변환 중';
            const setBusy = (msg, color = '#4a9') => {
              phaseMsg = msg;
              rDiv2.textContent = msg;
              rDiv2.style.color = color;
              try { C.showStatusBadge(msg); } catch (_) {}
            };
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              setBusy(phaseMsg.replace(/\s*\(\d+초\)$/, '') + ` (${sec}초)`);
            }, 1000);
            setBusy(phaseMsg + ' (0초)');
            try {
              const cnt = await C.importFromText(ta.value.trim(), nameInp2.value.trim(), buildGenerationApiOpts({}, { feature: 'textImport', chatKey: (C.getCurrentChatId && C.getCurrentChatId()) || 'global' }), {
                onProgress: (ev) => {
                  if (ev && ev.phase === 'chunk') {
                    setBusy(`에리가 텍스트를 로어로 변환 중: 청크 ${ev.chunk}/${ev.total} · 시도 ${ev.attempt}/${ev.maxAttempts}`);
                  }
                }
              });
              const rpt = C.__lastImportReport;
              let msg = '✅ ' + cnt + '개 생성';
              if (rpt) {
                if (rpt.failed > 0) {
                  const firstErr = (rpt.chunkResults.find(r => r.status === 'failed') || {}).error || '';
                  msg += ' ⚠️ 청크 ' + rpt.failed + '/' + rpt.chunks + ' 실패: ' + firstErr.slice(0, 80);
                } else if (cnt === 0 && rpt.empty === rpt.chunks) {
                  msg = '⚠️ 0개 — 모든 청크(' + rpt.chunks + '개)에서 AI가 추출 가능한 내용 없다고 판단';
                }
              }
              rDiv2.textContent = msg;
              rDiv2.style.color = cnt > 0 ? '#4a9' : '#da8';
              if (cnt > 0) await setPackEnabled(nameInp2.value.trim(), true);
            } catch (e) {
              rDiv2.textContent = '❌ ' + (e.message || String(e));
              rDiv2.style.color = '#d66';
            } finally {
              clearInterval(tick);
              try { C.hideStatusBadge(); } catch (_) {}
              tBtn.textContent = '텍스트 변환'; tBtn.disabled = false;
            }
          };
          nd.appendChild(tBtn); nd.appendChild(rDiv2);
        }});
      }, '추출/변환 설정');
    });
  });
  
  _w.__LoreInj.__subExtractLoaded = true;
})();
