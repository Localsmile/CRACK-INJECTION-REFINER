// injecter / sub-main — status and presets
(async function(){
  'use strict';
  if(document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded)) { console.error('[LoreInj:sub-main] settings 미로드'); return; }
  if (_w.__LoreInj.__subMainLoaded) return;

  const { C, db, _ls, settings } = _w.__LoreInj;
  const R = _w.__LoreRefiner;

  const PRESETS = {
    beginner: { name: '기본 추천', desc: '의미 검색 + 8턴마다 대화 정리. 일반 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: true, autoExtTurns: 8, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 4, cooldownTurns: 8, injectionCleanupEnabled: true, windowExitChars: 7000, loreBudgetChars: 300, loreBudgetMax: 500, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 12, aiMemoryTurns: 4, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
    minimal: { name: '수동 검색', desc: '자동 추출 OFF. 수동 추출만 사용. API 호출 최소.', config: { embeddingEnabled: true, embeddingWeight: 0.35, autoExtEnabled: false, autoEmbedOnExtract: true, scanOffset: 2, maxEntries: 3, cooldownTurns: 6, injectionCleanupEnabled: true, windowExitChars: 7000, loreBudgetChars: 250, loreBudgetMax: 400, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: false, importanceGating: true, importanceThreshold: 12, rerankEnabled: false, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true } },
    advanced: { name: '정밀', desc: '5턴마다 대화 정리 + 다음 턴 후보 준비 + 응답 교정. 장문 RP용.', config: { embeddingEnabled: true, embeddingWeight: 0.4, autoExtEnabled: true, autoExtTurns: 5, autoExtIncludeDb: true, autoExtIncludePersona: true, autoEmbedOnExtract: true, scanOffset: 3, maxEntries: 5, cooldownTurns: 8, injectionCleanupEnabled: true, windowExitChars: 7000, loreBudgetChars: 400, loreBudgetMax: 700, decayEnabled: true, activeCharDetection: true, activeCharBoostEnabled: true, honorificMatrixEnabled: true, firstEncounterWarning: true, importanceGating: true, importanceThreshold: 10, aiMemoryTurns: 4, rerankEnabled: true, useCompressedFormat: true, compressionMode: 'auto', strictMatch: true, similarityMatch: true, refinerEnabled: true, refinerLoreMode: 'semantic' } }
  };

  function apiReady(cfg) {
    const apiType = cfg.autoExtApiType || 'key';
    if (apiType === 'deepseek') return !!cfg.autoExtDeepSeekKey;
    if (apiType === 'vertex') return !!cfg.autoExtVertexJson;
    if (apiType === 'firebase') return !!cfg.autoExtFirebaseScript;
    return !!cfg.autoExtKey;
  }

  function appendStatus(panel) {
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      nd.appendChild(C.createSectionTitle('현재 상태'));
      const cfg = settings.config || {};
      const activePacks = _w.__LoreInj.getActivePacksForUrl ? _w.__LoreInj.getActivePacksForUrl(C.getCurUrl()) : ((cfg.urlPacks && cfg.urlPacks[C.getCurUrl()]) || []);
      const storageHealth = _w.__LoreInj.getSettingsStorageHealth ? _w.__LoreInj.getSettingsStorageHealth() : { ok: true, configBytes: 0 };
      const platformCaps = (_w.__LorePlatform && _w.__LorePlatform.capabilities) ? _w.__LorePlatform.capabilities() : {};
      const platformDiag = platformCaps.diagnostics || {};
      const platformOk = platformCaps.canReadLogs && platformCaps.canPatch && platformDiag.messageShapeOk !== false;
      const metrics = C.createMetricGrid([
        { key: 'api', label: 'API', value: apiReady(cfg) ? '설정됨' : '미설정', ok: apiReady(cfg) },
        { key: 'pack', label: '활성 로어팩', value: activePacks.length ? activePacks.length + '개' : '없음', ok: activePacks.length > 0 },
        { key: 'entry', label: '사용 가능한 로어', value: '확인 중', ok: true },
        { key: 'save', label: '설정 저장', value: settings._lastSaveOk === false ? '실패' : '정상', ok: settings._lastSaveOk !== false },
        { key: 'platform', label: '사이트 연결', value: platformOk ? '정상' : '제한됨', ok: platformOk },
        { key: 'storage', label: '저장 공간', value: storageHealth.ok ? Math.ceil((storageHealth.configBytes || 0) / 1024) + 'KB' : '확인 실패', ok: storageHealth.ok },
        { key: 'extract', label: '자동 대화 정리', value: cfg.autoExtEnabled ? (cfg.autoExtTurns || 8) + '턴마다' : '꺼짐', ok: !!cfg.autoExtEnabled },
        { key: 'semantic', label: '의미 검색', value: cfg.embeddingEnabled ? (cfg.autoEmbedOnExtract !== false ? '켜짐' : '수동 준비') : '꺼짐', ok: !!cfg.embeddingEnabled }
      ]);
      nd.appendChild(metrics.grid);
      db.entries.toArray().then(entries => {
        const active = new Set(activePacks);
        const usable = active.size ? entries.filter(e => active.has(e.packName)).length : 0;
        metrics.nodes.entry.textContent = usable + '개';
        metrics.nodes.entry.style.color = usable ? 'var(--li-accent,#5aa7ff)' : '#e7b56f';
        if (activePacks.length) metrics.nodes.pack.textContent = activePacks.join(', ');
      }).catch(() => { metrics.nodes.entry.textContent = '확인 실패'; metrics.nodes.entry.style.color = '#ef6b6b'; });
    }});
  }

  function appendQuickRefiner(panel) {
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      nd.appendChild(C.createSectionTitle('교정 실행'));
      const btn = C.createActionButton('최근 AI 응답 재검수', 'primary');
      btn.style.width = '100%';
      btn.style.minHeight = '42px';
      const status = document.createElement('div');
      status.style.cssText = 'margin-top:8px;min-height:18px;text-align:center;font-size:11px;color:var(--li-muted,#748196);line-height:1.5;';
      btn.onclick = async () => {
        if (!R || !R.manualRefine) { alert('응답 교정 모듈을 찾을 수 없음. 스크립트 업데이트 또는 새로고침 필요.'); return; }
        const cid = C.getCurrentChatId && C.getCurrentChatId();
        if (!cid) { alert('현재 채팅방을 찾지 못함.'); return; }
        btn.disabled = true;
        const orig = btn.textContent;
        const start = Date.now();
        btn.textContent = '검수 중';
        status.textContent = '최근 응답 찾는 중';
        status.style.color = 'var(--li-accent-strong,#c7d2fe)';
        const tick = setInterval(() => {
          status.textContent = '검수 중 (' + Math.floor((Date.now() - start) / 1000) + '초)';
        }, 1000);
        try {
          const platform = _w.__LorePlatform;
          const lastBot = platform && platform.findLastAssistantMessage ? await platform.findLastAssistantMessage(cid) : null;
          if (!lastBot || lastBot instanceof Error || !lastBot.content) throw new Error('마지막 AI 응답 없음');
          await R.manualRefine(lastBot.content, lastBot.id);
          status.textContent = '완료';
          status.style.color = 'var(--li-accent-strong,#c7d2fe)';
          setTimeout(() => { status.textContent = ''; }, 2500);
        } catch (e) {
          status.textContent = '실패: ' + String(e.message || e).slice(0, 80);
          status.style.color = 'var(--li-danger,#dc2626)';
        } finally {
          clearInterval(tick);
          btn.textContent = orig;
          btn.disabled = false;
        }
      };
      nd.appendChild(btn);
      nd.appendChild(status);
    }});
  }

  function appendPresets(panel, menuApi) {
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      nd.appendChild(C.createSectionTitle('빠른 설정'));
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;';
      if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) row.style.gridTemplateColumns = '1fr';
      for (const preset of Object.values(PRESETS)) {
        const btn = document.createElement('button');
        btn.style.cssText = 'min-height:88px;padding:12px 13px;font-size:12px;border-radius:8px;cursor:pointer;border:1px solid var(--li-line,#3f3f46);background:var(--li-surface-2,#2b2b31);color:var(--li-text-soft,#a1a1aa);display:flex;flex-direction:column;gap:7px;text-align:left;min-width:0;';
        const nm = document.createElement('div');
        nm.textContent = preset.name;
        nm.style.cssText = 'font-weight:800;color:var(--li-text,#e7edf5);font-size:13px;';
        const ds = document.createElement('div');
        ds.textContent = preset.desc;
        ds.style.cssText = 'font-size:11px;color:var(--li-text-soft,#a9b6c7);line-height:1.45;word-break:keep-all;';
        btn.appendChild(nm);
        btn.appendChild(ds);
        btn.onclick = () => {
          if (!confirm('[' + preset.name + '] 프리셋 적용?')) return;
          if (_w.__LoreInj.applyPresetKeepState) _w.__LoreInj.applyPresetKeepState(preset.config);
          else { settings.config = JSON.parse(JSON.stringify(_w.__LoreInj.defaultSettings)); Object.assign(settings.config, preset.config); settings.save(); }
          menuApi.replaceContentPanel((p) => p.addText('설정 갱신 완료. 필요한 경우 새로고침.'), '설정 갱신');
        };
        row.appendChild(btn);
      }
      nd.appendChild(row);
    }});
  }

  function appendReset(panel) {
    panel.addBoxedField('', '', { onInit: (nd) => {
      C.setFullWidth(nd);
      const resetBtn = C.createActionButton('모든 설정 초기화 (DB 유지)', 'danger');
      resetBtn.style.width = '100%';
      resetBtn.style.marginTop = '6px';
      resetBtn.style.padding = '10px';
      resetBtn.onclick = () => {
        if (!confirm('설정 초기화? API 설정값과 DB/로어팩 활성화는 유지됨.')) return;
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
      };
      nd.appendChild(resetBtn);
    }});
  }

  function appendQuickLore(panel, menuApi) {
    if (_w.__LoreInj.renderLoreListPanel) {
      _w.__LoreInj.renderLoreListPanel(panel, menuApi);
      return;
    }
    panel.addText('로어 목록 모듈 로딩 중. 잠시 뒤 다시 열어주세요.');
  }

  _w.__LoreInj.registerSettingsPage('main', '빠른 설정', (m) => {
      m.replaceContentPanel(async (panel) => {
        appendQuickRefiner(panel);
        appendStatus(panel);
        appendPresets(panel, m);
        appendQuickLore(panel, m);
        appendReset(panel);
      }, '빠른 설정');
  });

  _w.__LoreInj.__subMainLoaded = true;
})();
