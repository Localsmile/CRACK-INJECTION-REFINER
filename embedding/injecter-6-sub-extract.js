// injecter-6-sub-extract.js: 자동 대화 추출 + 배치 추출 + 템플릿 + URL/텍스트 변환
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const _ls = (_w.__LoreEnv && _w.__LoreEnv.kv) || _w.localStorage;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subExtractLoaded) return;
  
  const { C, db, settings, getAutoExtPackForUrl, setAutoExtPackForUrl, setPackEnabled } = _w.__LoreInj;
  const FIELD_STYLE = (C.UI && C.UI.field) || 'width:100%;min-height:40px;border-radius:8px;border:1px solid var(--li-line,#2f3b4f);background:#08111d;color:var(--li-text,#e7edf5);padding:9px 11px;font-size:13px;box-sizing:border-box;';
  const BTN_BASE = 'min-height:36px;padding:8px 13px;font-size:12px;border-radius:8px;background:var(--li-surface-3,#272a2f);border:1px solid var(--li-line,#2f3b4f);color:var(--li-text,#e7edf5);cursor:pointer;font-weight:600;';
  const TONE = { muted: 'var(--li-muted,#748196)', soft: 'var(--li-text-soft,#a9b6c7)', text: 'var(--li-text,#e7edf5)', ok: 'var(--li-accent-strong,#c7d2fe)', warn: 'var(--li-warn,#d97706)', danger: 'var(--li-danger,#dc2626)' };

  function requireGenerationApiOpts(overrides = {}, costContext = null) {
    if (typeof _w.__LoreInj.buildGenerationApiOpts === 'function') {
      return _w.__LoreInj.buildGenerationApiOpts(overrides, costContext);
    }
    throw new Error('API 설정 모듈 미로드. 페이지 새로고침 후 다시 시도해야 함.');
  }

  function estimateTextTokens(text) {
    const s = String(text || '');
    const cjk = (s.match(/[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
    const other = Math.max(0, s.length - cjk);
    return Math.max(0, Math.ceil(cjk / 1.5 + other / 4));
  }

  async function estimateBatchRunCost(turnsPerBatch, overlap) {
    const logs = C.fetchLogs ? await C.fetchLogs(99999) : [];
    const arr = Array.isArray(logs) ? logs : [];
    const step = Math.max(1, Number(turnsPerBatch) || 50);
    const ov = Math.max(0, Number(overlap) || 0);
    let inputTokens = 0;
    let batches = 0;
    for (let i = 0; i < arr.length; i += step) {
      const start = Math.max(0, i - ov);
      const part = arr.slice(start, i + step);
      if (!part.length) continue;
      batches++;
      inputTokens += estimateTextTokens(JSON.stringify(part));
    }
    const cfg = settings.config || {};
    const model = cfg.autoExtApiType === 'deepseek'
      ? (cfg.deepSeekExtractModel || cfg.deepSeekRefineModel || cfg.autoExtModel || 'deepseek-v4-flash')
      : (cfg.autoExtModel === '_custom' ? cfg.autoExtCustomModel : (cfg.autoExtModel || 'gemini-3-flash-preview'));
    const expectedOutputTokens = Math.max(1024, Math.ceil(inputTokens * 0.25));
    let usd = null;
    try {
      const core = _w.__LoreCore;
      if (core && typeof core.computeCost === 'function') usd = core.computeCost(model, inputTokens, expectedOutputTokens, inputTokens);
    } catch (_) {}
    return { logs: arr.length, batches, inputTokens, expectedOutputTokens, model, usd };
  }

  function appendExtractionOptions(nd) {
    const box = document.createElement('div');
    box.style.cssText = 'border:1px solid var(--li-line,#2f3b4f);border-radius:8px;background:var(--li-surface-2,#2b2b31);padding:14px;margin:0 0 16px;';
    const head = document.createElement('div');
    head.textContent = '추출 설정';
    head.style.cssText = 'font-size:15px;color:var(--li-text,#e7edf5);font-weight:900;margin-bottom:4px;';
    box.appendChild(head);
    const desc = document.createElement('div');
    desc.textContent = '자동 정리, 변경분 저장, 중요 장면, 임베딩, 배치 기본값을 한 곳에서 조정함.';
    desc.style.cssText = 'font-size:11px;color:' + TONE.muted + ';line-height:1.5;margin-bottom:10px;word-break:keep-all;';
    box.appendChild(desc);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;';
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) grid.style.gridTemplateColumns = '1fr';
    const addToggle = (label, desc, key, defaultOn) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:11px;border:1px solid var(--li-line,#2f3b4f);border-radius:8px;background:var(--li-bg,#18181b);cursor:pointer;min-width:0;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = settings.config[key] !== undefined ? settings.config[key] !== false : defaultOn !== false;
      cb.style.cssText = 'margin-top:2px;accent-color:' + TONE.ok + ';flex:0 0 auto;';
      const meta = document.createElement('div');
      meta.style.cssText = 'min-width:0;';
      const title = document.createElement('div');
      title.textContent = label;
      title.style.cssText = 'font-size:12px;color:' + TONE.text + ';font-weight:700;';
      const help = document.createElement('div');
      help.textContent = desc;
      help.style.cssText = 'font-size:11px;color:' + TONE.muted + ';line-height:1.45;margin-top:2px;word-break:keep-all;';
      meta.appendChild(title); meta.appendChild(help);
      cb.onchange = () => { settings.config[key] = cb.checked; settings.save(); };
      row.appendChild(cb); row.appendChild(meta); grid.appendChild(row);
    };
    addToggle('자동 대화 정리', '정해진 턴마다 대화를 읽어 로어를 갱신함.', 'autoExtEnabled', true);
    addToggle('변경분만 저장', '기존 로어가 있으면 바뀐 내용만 받아 출력 비용을 줄임.', 'autoExtPatchMode', true);
    addToggle('기존 로어 참고', '중복 저장을 줄이기 위해 현재 로어 요약을 함께 보냄.', 'autoExtIncludeDb', true);
    addToggle('페르소나 정보 전송', '추출 시 현재 페르소나 이름을 같이 보내 정확도를 높임.', 'autoExtIncludePersona', true);
    addToggle('중요 장면 기억', '사건, 약속, 관계 변화 같은 장면 기억을 함께 저장함.', 'temporalExtractEnabled', true);
    addToggle('추출 후 임베딩', '새 로어를 의미 검색에 바로 사용할 수 있게 준비함.', 'autoEmbedOnExtract', true);
    addToggle('추출 상태 배지', '추출/배치/임베딩 진행 상태를 화면에 표시함.', 'extractStatusBadgeEnabled', true);
    box.appendChild(grid);

    const numbers = document.createElement('div');
    numbers.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;';
    if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) numbers.style.gridTemplateColumns = '1fr 1fr';
    const addNumber = (label, key, fallback, min, max, step) => {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-width:0;';
      const title = document.createElement('span');
      title.textContent = label;
      title.style.cssText = 'font-size:11px;color:' + TONE.muted + ';font-weight:800;';
      const input = document.createElement('input');
      input.type = 'number';
      input.value = settings.config[key] !== undefined ? settings.config[key] : fallback;
      if (min != null) input.min = String(min);
      if (max != null) input.max = String(max);
      if (step != null) input.step = String(step);
      input.style.cssText = FIELD_STYLE;
      const save = () => {
        const value = parseInt(input.value, 10);
        if (!Number.isNaN(value)) {
          settings.config[key] = value;
          settings.save();
        }
      };
      input.oninput = save;
      input.onchange = save;
      wrap.appendChild(title);
      wrap.appendChild(input);
      numbers.appendChild(wrap);
    };
    addNumber('자동 정리 주기', 'autoExtTurns', 8, 2, 100, 1);
    addNumber('읽을 최근 대화', 'autoExtScanRange', 6, 1, 80, 1);
    addNumber('최근 제외', 'autoExtOffset', 3, 0, 30, 1);
    addNumber('추출 재시도', 'autoExtMaxRetries', 2, 0, 10, 1);
    addNumber('중요 장면 최대', 'temporalMaxEventsPerPass', 5, 1, 30, 1);
    addNumber('기존 로어 참고 수', 'autoExtDbDigestLimit', 40, 0, 200, 5);
    box.appendChild(numbers);
    nd.appendChild(box);
  }
  
  _w.__LoreInj.registerSettingsPage('extract', '추출 실행', (m) => {
      m.replaceContentPanel((panel) => {
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          appendExtractionOptions(nd);
        }});

        // === manual extraction ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const title = document.createElement('div');
          title.textContent = '수동 추출';
          title.style.cssText = 'font-size:15px;color:var(--li-text,#e7edf5);font-weight:900;margin-bottom:6px;';
          const desc = document.createElement('div');
          desc.textContent = '최근 대화 또는 전체 로그를 로어로 정리함. 자주 쓰는 추출 옵션은 여기서 바로 바꿀 수 있음.';
          desc.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:12px;line-height:1.55;word-break:keep-all;';
          nd.appendChild(title);
          nd.appendChild(desc);

          const row2 = document.createElement('div'); row2.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-bottom:12px;align-items:center;';
          const f3 = document.createElement('div'); f3.style.flex = '1';
          const l3 = document.createElement('div'); l3.textContent = '저장할 로어팩'; l3.style.cssText = 'font-size:12px;color:var(--li-muted,#748196);font-weight:800;margin-bottom:4px;';
          const inputWrap = document.createElement('div'); inputWrap.style.cssText = 'display:flex;gap:6px;';
          const i3 = document.createElement('input'); i3.type = 'text';
          getAutoExtPackForUrl(C.getCurUrl()).then(name => i3.value = name);
          i3.style.cssText = 'flex:1;' + FIELD_STYLE;
          const savePackName = () => { const val = i3.value || '자동추출'; settings.config.autoExtPack = val; setAutoExtPackForUrl(C.getCurUrl(), val); };
          i3.oninput = savePackName; i3.onchange = savePackName;
          const s3 = document.createElement('select'); s3.style.cssText = FIELD_STYLE + 'width:110px;';
          db.packs.toArray().then(packs => { const opt = document.createElement('option'); opt.value = ''; opt.textContent = '기존 선택'; s3.appendChild(opt); packs.forEach(p => { const o = document.createElement('option'); o.value = p.name; o.textContent = p.name; s3.appendChild(o); }); });
          s3.onchange = () => { if (s3.value) { i3.value = s3.value; settings.config.autoExtPack = s3.value; setAutoExtPackForUrl(C.getCurUrl(), s3.value); s3.value = ''; } };
          inputWrap.appendChild(i3); inputWrap.appendChild(s3); f3.appendChild(l3); f3.appendChild(inputWrap);
          row2.appendChild(f3); nd.appendChild(row2);
  
          const btnRun = document.createElement('button'); btnRun.textContent = '수동 추출 실행';
          btnRun.style.cssText = BTN_BASE + 'width:100%;margin-top:10px;background:var(--li-accent-bg,rgba(129,140,248,.14));border-color:rgba(129,140,248,.46);';
          const btnStatus = document.createElement('div'); btnStatus.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-top:8px;text-align:center;line-height:1.5;'; btnStatus.textContent = '';
          btnRun.onclick = async () => {
            if (!confirm('수동 추출 시작?')) return;
            settings.save();
            btnRun.disabled = true;
            const origText = btnRun.textContent;
            const startMs = Date.now();
            btnRun.textContent = '에리가 추출 중...';
            btnStatus.textContent = '에리가 대화 분석 중';
            btnStatus.style.color = TONE.ok;
            const tick = setInterval(() => {
              const sec = Math.floor((Date.now() - startMs) / 1000);
              btnStatus.textContent = `에리가 대화 분석 중 (${sec}초)`;
            }, 1000);
            try {
              await _w.__LoreInj.runAutoExtract(true);
              clearInterval(tick);
              const sec = Math.floor((Date.now() - startMs) / 1000);
              btnStatus.textContent = `에리: 완료 (${sec}초)`;
              btnStatus.style.color = TONE.ok;
              setTimeout(() => { btnStatus.textContent = ''; }, 4000);
            } catch(e) {
              clearInterval(tick);
              btnStatus.textContent = '에리: 실패 - ' + (e.message || e).slice(0, 50);
              btnStatus.style.color = TONE.danger;
            } finally {
              btnRun.textContent = origText;
              btnRun.disabled = false;
            }
          };
          nd.appendChild(btnRun);
          nd.appendChild(btnStatus);
        }});
  
        // === 전체 로그 일괄 추출 ===
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const bTitle = document.createElement('div'); bTitle.textContent = '전체 로그 일괄 추출'; bTitle.style.cssText = 'font-size:15px;color:var(--li-text,#e7edf5);font-weight:900;margin-bottom:8px;'; nd.appendChild(bTitle);
          const bDesc = document.createElement('div'); bDesc.textContent = '긴 대화를 배치로 나눠 정리함. API 비용 큼. 초기 정리용.'; bDesc.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-bottom:10px;line-height:1.5;'; nd.appendChild(bDesc);
  
          const bRow = document.createElement('div'); bRow.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px;align-items:end;';
          if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) bRow.style.gridTemplateColumns = '1fr';
          const mkNum = (label, getter, setter, defaultVal) => {
            const f = document.createElement('div'); f.style.cssText = 'min-width:0;';
            const l = document.createElement('div'); l.textContent = label; l.style.cssText = 'font-size:12px;color:var(--li-muted,#748196);font-weight:800;margin-bottom:4px;';
            const i = document.createElement('input'); i.type = 'number'; const cur = getter(); i.value = (cur !== undefined && cur !== null) ? cur : defaultVal;
            i.style.cssText = FIELD_STYLE;
            const save = () => { const v = parseInt(i.value); if (!isNaN(v)) { setter(v); settings.save(); } };
            i.oninput = save; i.onchange = save;
            f.appendChild(l); f.appendChild(i); return f;
          };
          bRow.appendChild(mkNum('배치 크기(턴)', () => settings.config.batchExtTurnsPerBatch, v => settings.config.batchExtTurnsPerBatch = v, 50));
          bRow.appendChild(mkNum('오버랩(턴)', () => settings.config.batchExtOverlap, v => settings.config.batchExtOverlap = v, 5));
          bRow.appendChild(mkNum('재시도', () => settings.config.batchExtMaxAttempts, v => settings.config.batchExtMaxAttempts = v, 3));
          nd.appendChild(bRow);
  
          const bBtn = document.createElement('button'); bBtn.textContent = '전체 일괄 추출 실행';
          bBtn.style.cssText = BTN_BASE + 'width:100%;margin-top:6px;color:#fff;background:var(--li-accent,#818cf8);border-color:transparent;';
          const bStatus = document.createElement('div'); bStatus.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);margin-top:8px;text-align:center;line-height:1.5;';
          bBtn.onclick = async () => {
            settings.save();
            const turnsPerBatch = settings.config.batchExtTurnsPerBatch || 50;
            const overlap = settings.config.batchExtOverlap !== undefined ? settings.config.batchExtOverlap : 5;
            bBtn.disabled = true; const orig = bBtn.textContent; bBtn.textContent = '비용 계산 중...';
            bStatus.textContent = '전체 로그 확인 중'; bStatus.style.color = TONE.ok;
            let resume = false;
            try {
              const est = await estimateBatchRunCost(turnsPerBatch, overlap);
              let resumeText = '';
              if (typeof _w.__LoreInj.getBatchCheckpointInfo === 'function') {
                try {
                  const cp = await _w.__LoreInj.getBatchCheckpointInfo({ turnsPerBatch, overlap });
                  if (cp && cp.valid && cp.nextBatchIndex > 0 && cp.nextBatchIndex < cp.totalBatches) {
                    const when = cp.updatedAt ? new Date(cp.updatedAt).toLocaleString() : '이전 실행';
                    resume = confirm('중단된 배치 작업이 있음.\n\n' + when + '\n진행 위치: ' + cp.nextBatchIndex + '/' + cp.totalBatches + '\n\n이어하기를 선택하면 완료된 배치는 다시 호출하지 않음.\n\n이어하기?');
                    resumeText = resume ? '이어하기: ' + cp.nextBatchIndex + '/' + cp.totalBatches + '부터\n' : '처음부터 다시 실행\n';
                  } else if (cp && cp.exists && !cp.valid) {
                    resumeText = '기존 이어하기 정보는 현재 대화/설정과 달라 사용하지 않음.\n';
                  }
                } catch (_) {}
              }
              const costText = est.usd == null ? '계산 불가' : ('$' + Number(est.usd).toFixed(4) + ' 이상');
              const ok = confirm(
                '전체 로그를 배치로 분석함.\n\n' +
                resumeText +
                '대화 ' + est.logs + '개 / 예상 배치 ' + est.batches + '개\n' +
                '모델: ' + est.model + '\n' +
                '예상 입력 ' + est.inputTokens.toLocaleString() + ' 토큰 / 예상 출력 ' + est.expectedOutputTokens.toLocaleString() + ' 토큰\n' +
                '예상 비용: ' + costText + '\n\n' +
                '실제 비용은 모델 응답 길이와 재시도 횟수에 따라 달라짐. 계속?'
              );
              if (!ok) { bStatus.textContent = '취소됨'; bStatus.style.color = TONE.muted; return; }
            } catch (e) {
              if (!confirm('비용 추정 실패: ' + (e.message || e) + '\n그래도 전체 배치 추출을 실행할까?')) {
                bStatus.textContent = '취소됨'; bStatus.style.color = TONE.muted; return;
              }
            } finally {
              bBtn.textContent = orig;
              bBtn.disabled = false;
            }
            bBtn.disabled = true; bBtn.textContent = '실행 중...';
            bStatus.textContent = '전체 로그 가져오는 중'; bStatus.style.color = TONE.ok;
            const start = Date.now();
            try {
              const report = await _w.__LoreInj.runBatchExtract({
                turnsPerBatch,
                overlap,
                resume,
                maxAttempts: settings.config.batchExtMaxAttempts || 3,
                onProgress: (ev) => {
                  const sec = Math.floor((Date.now() - start) / 1000);
                  if (ev.phase === 'batch') bStatus.textContent = '배치 ' + ev.index + '/' + ev.total + ' 처리 중 (' + sec + '초)';
                }
              });
              const sec = Math.floor((Date.now() - start) / 1000);
              let msg = '완료 (' + sec + '초) - ' + report.totalBatches + '개 배치 / 성공 ' + report.ok + ' / 빈 ' + report.empty + ' / 실패 ' + report.failed + ' / 병합 ' + report.entriesAdded + '건';
              if (report.failed > 0) { msg += ' / 실패 상세는 로그 탭'; bStatus.style.color = TONE.warn; }
              else { bStatus.style.color = TONE.ok; }
              bStatus.textContent = msg;
            } catch(e) {
              bStatus.textContent = '실패 - ' + (e.message || String(e)).slice(0, 80);
              bStatus.style.color = TONE.danger;
            } finally {
              bBtn.textContent = orig; bBtn.disabled = false;
            }
          };
          nd.appendChild(bBtn);
          nd.appendChild(bStatus);
        }});
      }, '추출 실행');
  });

  _w.__LoreInj.registerSettingsPage('knowledge', '지식 변환', (m) => {
    m.replaceContentPanel((panel) => {
      panel.addBoxedField('', '', { onInit: (nd) => {
        C.setFullWidth(nd);
        nd.appendChild(C.createSectionTitle('지식 변환', 'URL이나 긴 텍스트를 별도 로어팩으로 변환함. 추출/정리용 모델을 사용함.'));
        const S = FIELD_STYLE;
        const makeField = (label, node) => {
          const wrap = document.createElement('label');
          wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;min-width:0;';
          const cap = document.createElement('span'); cap.textContent = label; cap.style.cssText = 'font-size:11px;color:var(--li-muted,#748196);font-weight:700;';
          wrap.appendChild(cap); wrap.appendChild(node);
          return wrap;
        };

        const urlGrid = document.createElement('div');
        urlGrid.style.cssText = 'display:grid;grid-template-columns:minmax(0,1.5fr) minmax(160px,.8fr) auto;gap:10px;align-items:end;margin-bottom:10px;';
        if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) urlGrid.style.gridTemplateColumns = '1fr';
        const urlInp = document.createElement('input'); urlInp.type = 'text'; urlInp.placeholder = 'URL 입력'; urlInp.style.cssText = S;
        const nameInp = document.createElement('input'); nameInp.type = 'text'; nameInp.placeholder = '팩 이름'; nameInp.style.cssText = S;
        const urlBtn = document.createElement('button'); urlBtn.textContent = 'URL 변환'; urlBtn.style.cssText = BTN_BASE + 'min-width:96px;background:var(--li-accent-bg,rgba(129,140,248,.14));border-color:rgba(129,140,248,.46);';
        const status = document.createElement('div'); status.style.cssText = 'font-size:12px;color:var(--li-muted,#748196);margin:8px 0 18px;line-height:1.45;';
        urlBtn.onclick = async () => {
          if (!urlInp.value.trim() || !nameInp.value.trim()) { alert('URL과 팩 이름 필요.'); return; }
          urlBtn.disabled = true; const orig = urlBtn.textContent; urlBtn.textContent = '변환 중';
          const startMs = Date.now();
          let phaseMsg = 'URL 본문 가져오는 중';
          const tick = setInterval(() => { status.textContent = phaseMsg + ' (' + Math.floor((Date.now() - startMs) / 1000) + '초)'; }, 1000);
          try {
            const cnt = await C.importFromUrl(urlInp.value.trim(), nameInp.value.trim(), requireGenerationApiOpts({}, { feature: 'urlImport', chatKey: (C.getCurrentChatId && C.getCurrentChatId()) || 'global' }), {
              onProgress: (ev) => {
                if (!ev) return;
                if (ev.phase === 'fetch:start') phaseMsg = 'URL 본문 가져오는 중';
                else if (ev.phase === 'parse') phaseMsg = '본문 정리 중';
                else if (ev.phase === 'chunk') phaseMsg = '로어 변환 중: 청크 ' + ev.chunk + '/' + ev.total;
              }
            });
            status.textContent = '완료: ' + cnt + '개 생성';
            status.style.color = cnt ? TONE.ok : TONE.warn;
            if (cnt > 0) await setPackEnabled(nameInp.value.trim(), true);
          } catch (e) {
            status.textContent = '실패: ' + (e.message || String(e));
            status.style.color = TONE.danger;
          } finally {
            clearInterval(tick);
            urlBtn.textContent = orig;
            urlBtn.disabled = false;
          }
        };
        urlGrid.appendChild(makeField('URL', urlInp));
        urlGrid.appendChild(makeField('팩 이름', nameInp));
        urlGrid.appendChild(urlBtn);
        nd.appendChild(urlGrid);
        nd.appendChild(status);

        const textTitle = document.createElement('div');
        textTitle.textContent = '텍스트 변환';
        textTitle.style.cssText = 'font-size:13px;color:var(--li-text,#e7edf5);font-weight:700;margin:18px 0 8px;';
        nd.appendChild(textTitle);
        const textGrid = document.createElement('div');
        textGrid.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,.35fr) auto;gap:10px;align-items:end;';
        if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) textGrid.style.gridTemplateColumns = '1fr';
        const ta = document.createElement('textarea'); ta.placeholder = '설정, 소설 텍스트 등'; ta.style.cssText = S + ';height:130px;resize:vertical;';
        const nameInp2 = document.createElement('input'); nameInp2.type = 'text'; nameInp2.placeholder = '팩 이름'; nameInp2.style.cssText = S;
        const textBtn = document.createElement('button'); textBtn.textContent = '텍스트 변환'; textBtn.style.cssText = BTN_BASE + 'min-width:96px;background:var(--li-accent-bg,rgba(129,140,248,.14));border-color:rgba(129,140,248,.46);';
        const status2 = document.createElement('div'); status2.style.cssText = 'font-size:12px;color:var(--li-muted,#748196);margin-top:8px;line-height:1.45;';
        textBtn.onclick = async () => {
          if (!ta.value.trim() || !nameInp2.value.trim()) { alert('텍스트와 팩 이름 필요.'); return; }
          textBtn.disabled = true; const orig = textBtn.textContent; textBtn.textContent = '변환 중';
          const startMs = Date.now();
          let phaseMsg = '텍스트를 로어로 변환 중';
          const tick = setInterval(() => { status2.textContent = phaseMsg + ' (' + Math.floor((Date.now() - startMs) / 1000) + '초)'; }, 1000);
          try {
            const cnt = await C.importFromText(ta.value.trim(), nameInp2.value.trim(), requireGenerationApiOpts({}, { feature: 'textImport', chatKey: (C.getCurrentChatId && C.getCurrentChatId()) || 'global' }), {
              onProgress: (ev) => { if (ev && ev.phase === 'chunk') phaseMsg = '로어 변환 중: 청크 ' + ev.chunk + '/' + ev.total; }
            });
            status2.textContent = '완료: ' + cnt + '개 생성';
            status2.style.color = cnt ? TONE.ok : TONE.warn;
            if (cnt > 0) await setPackEnabled(nameInp2.value.trim(), true);
          } catch (e) {
            status2.textContent = '실패: ' + (e.message || String(e));
            status2.style.color = TONE.danger;
          } finally {
            clearInterval(tick);
            textBtn.textContent = orig;
            textBtn.disabled = false;
          }
        };
        textGrid.appendChild(makeField('원문', ta));
        textGrid.appendChild(makeField('팩 이름', nameInp2));
        textGrid.appendChild(textBtn);
        nd.appendChild(textGrid);
        nd.appendChild(status2);
      }});
    }, '지식 변환');
  });
  
  _w.__LoreInj.__subExtractLoaded = true;
})();
