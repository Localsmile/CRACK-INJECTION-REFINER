// == 인젝터 UI 패널 — Start Here ==
(function(){
  'use strict';

  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const UI = _w.__LoreInjUI;
  if (!UI || !UI.__utilsLoaded) {
    console.error('[LoreInj:UI:start] UI utils not loaded');
    return;
  }
  if (UI.__startPanelLoaded) return;

  function getRuntime() { return _w.__LoreInj || {}; }

  UI.registerPanel({
    id: 'dashboard',
    label: '대시보드',
    title: '대시보드',
    order: 10,
    render: function(panel) {
      const L = getRuntime();

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '로어 인젝터',
          '현재 채팅에서 로어 팩, 자동 추출, 응답 교정을 한곳에서 조정'
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

        nd.appendChild(UI.createCardGrid([
          { title: 'API 설정', desc: '키와 모델 확인' },
          { title: '기본 설정', desc: '기본값과 검색 방식' },
          { title: '로어 관리', desc: '현재 채팅 팩과 항목 확인' },
          { title: '추출', desc: '대화에서 로어 저장' }
        ]));
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '추천 순서',
          '처음 설정은 위에서 아래로, 이후에는 필요한 메뉴만',
          '처음 쓰는 경우 API 연결 → 기본 설정 → 로어 관리 → 추출 순서가 가장 안정적. 이미 설정이 끝난 뒤에는 로어 관리와 추출만 자주 확인하면 충분'
        ));

        const list = document.createElement('ol');
        list.style.cssText = 'font-size:12px;color:#dbe5e0;line-height:1.75;margin:0;padding-left:20px;';
        [
          'API 설정: 연결 방식과 모델 확인',
          '기본 설정: 기본 / 가벼움 / 정밀 중 선택',
          '로어 관리: 이번 대화에 쓸 팩과 항목 확인',
          '추출: 저장 팩, 추출 주기, 읽을 턴 수 확인',
          '응답 교정: 로어 누락이나 호칭 오류가 있을 때 사용'
        ].forEach(text => {
          const li = document.createElement('li');
          li.textContent = text;
          list.appendChild(li);
        });
        nd.appendChild(list);
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection('현재 상태', '문제가 있을 때만 아래 정보를 확인'));

        const required = ['__interceptorLoaded','__constLoaded','__settingsLoaded','__extractLoaded','__injectLoaded'];
        const missing = required.filter(k => !L[k]);
        const rows = [
          '버전: ' + (L.VER || '?'),
          '상태: ' + (missing.length ? '확인이 필요한 모듈 있음' : '정상 로드'),
          '사용 가능한 메뉴: ' + UI.getPanels().map(p => p.label || p.id).join(', ')
        ];

        nd.appendChild(UI.createNotice(rows.join('\n'), missing.length ? 'warn' : 'info'));

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;';
        btnRow.appendChild(UI.createButton('새로고침', { kind: 'primary', onClick: function() { location.reload(); } }));
        nd.appendChild(btnRow);
      });
    }
  });

  UI.__startPanelLoaded = true;
  console.log('[LoreInj:UI] start panel loaded');
})();