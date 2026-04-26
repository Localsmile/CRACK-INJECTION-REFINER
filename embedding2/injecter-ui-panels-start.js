// == 인젝터 UI 패널 — Start Here ==
// 역할: 신규 모듈형 UI 첫 화면
// 의존: injecter-ui-utils.js
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:start] UI utils not loaded');
    return;
  }
  if (UI.__startPanelLoaded) return;

  function getRuntime() {
    return _w.__LoreInj || {};
  }

  UI.registerPanel({
    id: 'start',
    label: '시작',
    title: '시작',
    order: 10,
    render: function(panel) {
      const L = getRuntime();

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '로어 인젝터',
          '크랙 채팅에서 로어 팩, 자동 추출, 응답 교정을 한곳에서 조정'
        ));

        if (UI.createSummaryGrid) {
          const required = ['__interceptorLoaded','__constLoaded','__settingsLoaded','__extractLoaded','__injectLoaded'];
          const missing = required.filter(k => !L[k]);
          nd.appendChild(UI.createSummaryGrid([
            { label: '버전', value: L.VER || '?' },
            { label: '로드 상태', value: missing.length ? '확인 필요' : '정상' },
            { label: '다음 행동', value: missing.length ? '새로고침' : 'API 설정 확인' }
          ]));
        }

        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(160px,100%),1fr));gap:10px;margin-top:10px;';
        [
          ['API 설정', '키와 모델 확인'],
          ['설정', '기본값과 검색 방식'],
          ['파일', '현재 채팅 팩 선택'],
          ['추출', '대화에서 로어 저장']
        ].forEach(function(item) {
          const card = document.createElement('div');
          card.className = 'lore-card';
          card.style.cssText = 'padding:12px 13px;border:1px solid #2d3a35;border-radius:12px;background:linear-gradient(180deg,#111916,#0d1211);box-shadow:inset 0 1px 0 rgba(255,255,255,.04);';
          const title = document.createElement('div');
          title.textContent = item[0];
          title.style.cssText = 'font-size:13px;color:#9fd;font-weight:700;margin-bottom:4px;';
          const desc = document.createElement('div');
          desc.textContent = item[1];
          desc.style.cssText = 'font-size:11px;color:#aaa;line-height:1.45;';
          card.appendChild(title);
          card.appendChild(desc);
          grid.appendChild(card);
        });
        nd.appendChild(grid);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '추천 순서',
          '처음 설정은 위에서 아래로, 이후에는 필요한 메뉴만'
        ));

        const list = document.createElement('ol');
        list.style.cssText = 'font-size:12px;color:#ccc;line-height:1.75;margin:0;padding-left:20px;';
        [
          'API 설정: Gemini 또는 Vertex 연결 확인',
          '설정: 기본 / 가벼움 / 정밀 중 선택',
          '파일: 크랙 채팅에 맞는 로어 팩만 켜기',
          '추출: 자동 추출 주기와 프롬프트 템플릿 조정',
          '응답 교정: 로어 누락이나 호칭 오류가 있을 때 사용'
        ].forEach(text => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });
        nd.appendChild(list);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('현재 상태', '문제가 있을 때만 아래 정보를 확인하세요.'));

        const required = [
          '__interceptorLoaded',
          '__constLoaded',
          '__settingsLoaded',
          '__extractLoaded',
          '__injectLoaded'
        ];
        const missing = required.filter(k => !L[k]);
        const rows = [
          '버전: ' + (L.VER || '?'),
          '상태: ' + (missing.length ? '확인이 필요한 모듈 있음' : '정상 로드됨'),
          '사용 가능한 메뉴: ' + UI.getPanels().map(p => p.label || p.id).join(', ')
        ];

        nd.appendChild(UI.createNotice(rows.join('\n'), missing.length ? 'warn' : 'info'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
        btnRow.appendChild(UI.createButton('새로고침', {
          kind: 'primary',
          onClick: function() { location.reload(); }
        }));
        nd.appendChild(btnRow);
      });
    }
  });

  UI.__startPanelLoaded = true;
  console.log('[LoreInj:UI] start panel loaded');
})();