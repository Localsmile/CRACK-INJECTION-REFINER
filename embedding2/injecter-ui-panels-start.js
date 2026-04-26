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
          '현재 채팅에서 사용할 로어 팩, 자동 추출, 응답 교정을 빠르게 설정합니다.'
        ));

        nd.appendChild(UI.createNotice(
          '처음 쓰는 순서:\n' +
          '1. API 설정에서 키를 입력하고 연결을 확인합니다.\n' +
          '2. 설정에서 빠른 프리셋을 고릅니다.\n' +
          '3. 파일에서 현재 채팅에 사용할 팩을 켭니다.\n' +
          '4. 추출에서 자동/수동 캡처를 설정합니다.\n' +
          '5. 로어와 기록에서 실제 적용 상태를 확인합니다.',
          'info'
        ));
      });

      UI.addBox(panel, function(nd) {
        nd.appendChild(UI.createSection(
          '추천 작업 순서',
          '일반 사용자가 자주 쓰는 기능을 앞쪽 메뉴에 배치했습니다.'
        ));

        const list = document.createElement('ol');
        list.style.cssText = 'font-size:12px;color:#ccc;line-height:1.8;margin:0;padding-left:20px;';
        [
          'API 설정: Gemini/Vertex/Firebase 연결과 모델을 먼저 확인합니다.',
          '설정: 기본/가벼움/정밀 프리셋 중 하나를 고릅니다.',
          '파일: 현재 채팅에 필요한 로어 팩만 켭니다.',
          '추출: 자동 캡처 주기와 프롬프트 템플릿을 조정합니다.',
          '응답 교정: 로어 누락이나 말투 오류가 있을 때만 켭니다.'
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