// crack-lore-core / ui-help 모듈
// 역할: 도움말 데이터 정의
// 의존: 없음
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const C = _w.__LoreCore = _w.__LoreCore || {};
  if (C.__uiHelpLoaded) return;

  const LORE_HELP_SECTIONS = [
    {
      title: '빠른 시작',
      sections: [
        { label: '순서', text: 'API 설정에서 키를 입력하고, 기본 추천 프리셋을 적용한 뒤, 사용할 로어 팩을 켠다.' },
        { label: '권장', text: '처음에는 기본 추천을 사용한다. 자동 반영과 정밀 재정렬은 나중에 켠다.' }
      ]
    },
    {
      title: '로어 주입',
      sections: [
        { label: '기능', text: '대화에 필요한 설정을 메시지 앞이나 뒤에 자동으로 붙인다.' },
        { label: '예시', text: '캐릭터 이름이 나오면 해당 캐릭터의 상태, 관계, 호칭을 함께 전달한다.' },
        { label: '설정', text: '로어 인젝션 활성화, 주입 위치, 출력 포맷을 조정한다.' }
      ]
    },
    {
      title: '자동 대화 추출',
      sections: [
        { label: '기능', text: '최근 대화에서 새 설정, 관계 변화, 약속, 사건을 로어 DB에 저장한다.' },
        { label: '권장', text: '일반 RP는 8턴, 설정 변화가 많은 장면은 5턴을 사용한다.' }
      ]
    },
    {
      title: '임베딩 검색',
      sections: [
        { label: '기능', text: '키워드가 정확히 일치하지 않아도 의미가 비슷한 로어를 찾는다.' },
        { label: '주의', text: '모델을 바꾸면 기존 임베딩을 다시 생성해야 검색 결과가 안정적이다.' }
      ]
    },
    {
      title: '앵커',
      sections: [
        { label: '기능', text: '사용자가 확정한 핵심 설정을 자동 추출이 덮어쓰지 못하게 보호한다.' },
        { label: '주의', text: '핵심 정체성, 고정 관계, 세계관 규칙에만 사용한다.' }
      ]
    }
  ];

  Object.assign(C, {
    LORE_HELP_SECTIONS,
    __uiHelpLoaded: true
  });
  console.log('[LoreCore:ui-help] loaded');
})();