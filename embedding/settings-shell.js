// lore settings shell
(function () {
  'use strict';
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const L = _w.__LoreInj = _w.__LoreInj || {};
  if (L.__settingsShellLoaded) return;

  const SHELL_ID = 'lore-settings-shell';
  const STYLE_MARK = 'data-lore-settings-shell-style';
  const LAST_SECTION_KEY = 'lore-ui-last-section';
  const BRAND_IMAGE_URL = 'https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260612/embedding/assets/lore-brand-character.jpg';

  const API_HELP_LABELS = new Set([
    '자동 대화 정리', '변경분만 저장', '기존 로어 참고', '페르소나 정보 전송',
    '중요 장면 기억', '추출 후 임베딩', '추출 재시도', '배치 크기',
    '배치 오버랩', '배치 재시도', '수동 추출 실행', '전체 일괄 추출 실행',
    'URL 변환', '텍스트 변환', '최근 AI 응답 재검수', '응답 교정 켜기',
    '다음 턴 후보 준비', 'AI로 참고 장면 고르기', 'API 키 테스트',
    '추출/정리용 모델', '후보 준비 모델', '과거 장면 판단 모델', '응답 교정 모델',
    '임베딩', '임베딩 일괄 생성', 'LLM 요약 병합', 'DeepSeek 추출 프롬프트',
    '새 로어 추출 전체 프롬프트', '기존 로어 참고 전체 프롬프트', '지식 변환 전체 프롬프트'
  ]);

  const HELP_TEXTS = {
    '자동 대화 정리': '지정한 유저 턴 간격마다 최근 대화를 API로 정리해 로어팩을 갱신함. 예: 8이면 유저가 8번 말할 때마다 자동 정리.',
    '변경분만 저장': '기존 로어가 있으면 바뀐 부분만 받아 기존 로어에 반영함. 입력 대화는 동일하고 출력 토큰 절감 목적.',
    '기존 로어 참고': '추출할 때 현재 로어 요약을 함께 보내 중복 생성과 무작정 증가를 줄임.',
    '페르소나 정보 전송': '현재 대화 프로필/페르소나 이름을 추출 프롬프트에 포함해 화자 구분 정확도를 높임.',
    '중요 장면 기억': '사건, 약속, 관계 변화처럼 나중에 다시 불러올 장면을 별도 기억으로 저장함.',
    '추출 후 임베딩': '추출된 로어를 의미 검색에 바로 쓸 수 있도록 검색 벡터를 생성함.',
    '추출 상태 배지': '추출, 배치, 임베딩 진행 상태를 화면에 표시함. 모바일에서 입력 버튼과 겹치면 끌 수 있음.',
    '자동 정리 주기': '자동 정리를 실행할 유저 턴 간격. 낮을수록 기억 갱신은 빠르지만 API 비용이 증가함. 예: 8.',
    '읽을 최근 대화': '추출 시 참고할 최근 대화 범위. 너무 낮으면 맥락 누락, 너무 높으면 비용 증가. 예: 5~12.',
    '최근 제외': '아직 AI 응답/후속 흐름이 안정되지 않은 최신 턴을 추출 대상에서 제외함. 예: 2~3.',
    '추출 재시도': 'API 오류, JSON 파싱 실패, 일시적 타임아웃 때 자동으로 다시 시도할 횟수.',
    '중요 장면 최대': '한 번의 추출에서 저장할 중요 장면 최대 개수. 장면이 많으면 비용과 삽입량이 늘어남.',
    '기존 로어 참고 수': '변경분 저장 시 함께 참고할 기존 로어 요약 개수. 중복 방지용이며 너무 높으면 입력 비용 증가.',
    '배치 크기': '전체 로그 일괄 추출에서 한 번에 읽을 턴 수. 예: 30은 30턴씩 나눠 처리.',
    '배치 오버랩': '배치 사이 맥락이 끊기지 않도록 앞 배치 끝부분을 다음 배치에도 조금 포함함.',
    '배치 재시도': '일괄 추출의 각 배치가 실패했을 때 다시 시도할 횟수.',
    '저장할 로어팩': '수동/일괄 추출 결과를 넣을 로어팩 이름. 기존 팩 선택 시 해당 팩에 병합됨.',
    'URL': '변환할 웹 문서 주소. 접근 가능한 텍스트 페이지일수록 안정적임.',
    '원문': '로어팩으로 바꿀 긴 설정, 소설, 캐릭터 문서, 세계관 텍스트.',
    '팩 이름': '생성하거나 갱신할 로어팩 이름. 이미 같은 이름이 있으면 해당 팩 기준으로 저장함.',
    'URL 변환': '입력한 URL 내용을 읽어 로어팩으로 변환함. API 호출과 비용이 발생할 수 있음.',
    '텍스트 변환': '붙여넣은 원문을 로어팩으로 변환함. 긴 텍스트는 나눠 처리될 수 있음.',
    '의미 검색': '키워드가 직접 일치하지 않아도 의미가 가까운 로어를 찾음. 임베딩 준비 필요.',
    '의미 검색 비중': '키워드 매칭 대비 의미 검색 점수 영향도. 0.3~0.5 권장.',
    '정확한 단어 우선': '트리거와 정확히 맞는 단어를 우선함. 오탐이 많으면 켜는 편이 안전함.',
    '비슷한 단어 허용': '철자가 조금 다른 트리거도 후보로 봄. 이름 변형이 많은 캐릭터에 유용함.',
    '활성 인물 감지': '최근 대화에 등장한 인물을 분석해 관련 로어를 우선 고려함.',
    '활성 인물 가중': '현재 장면 인물과 관련된 로어 점수를 더 높임.',
    '오래된 정보도 가끔 넣기': '직접 관련이 약해도 오래된 핵심 정보를 주기적으로 넣음. 끄면 현재 맥락 관련 로어 위주.',
    '삽입 쿨타임': '같은 로어가 너무 자주 반복 삽입되지 않도록 제한함.',
    '쿨타임 턴 수': '같은 로어를 다시 넣기 전 기다릴 유저 턴 수. 예: 8.',
    '로어 삽입': '대화 전송 전에 선택된 로어팩에서 관련 로어를 찾아 자동 삽입함.',
    '삽입 위치': '로어를 유저 입력 앞/뒤 어디에 붙일지 정함. 사이트 반응에 따라 조정.',
    '한 번에 넣을 로어': '한 입력에 포함할 로어 최대 개수. 예: 4.',
    '기본 삽입 문자 수': '평상시 목표 삽입량. 너무 높으면 채팅창이 지저분해지고 비용 증가 가능.',
    '최대 삽입 문자 수': '강하게 관련된 로어가 많을 때 허용할 최대 삽입량.',
    '장면 상태 문자 수': '현재 장소, 등장 인물, 미해결 상태를 담는 별도 장면 상태 블록의 크기.',
    '삽입 흔적 자동 정리': '일정 분량이 지나면 이전에 삽입한 로어 부분만 원문 메시지에서 제거함.',
    '정리 기준 문자 수': '삽입 이후 이 정도 문자 수가 지나면 로어 삽입 흔적을 지움. 예: 7000.',
    '다음 턴 후보 준비': '현재 대화를 보고 다음 턴에 쓸 후보 로어를 미리 준비함. API 비용 발생 가능.',
    'AI로 참고 장면 고르기': '저장된 과거 장면 중 지금 대화에 필요한 장면을 AI가 한 번 더 판단함.',
    '참고 장면 제한 시간': '과거 장면 판단 API 호출의 제한 시간. 네트워크가 느리면 늘림.',
    '검토할 장면 수': '과거 장면 판단에 넘길 후보 장면 개수. 많을수록 비용과 시간이 늘어남.',
    '응답 교정 켜기': 'AI 응답이 로어와 어긋나는지 검사하고 필요하면 수정함.',
    '자동 반영 (팝업 없음)': '교정 결과를 확인창 없이 바로 반영함. 테스트 중에는 끄는 편이 안전함.',
    '상태 배지 표시': '교정/추출 진행 상태 배지를 화면에 표시함.',
    '로어 검색 모드': '응답 교정 때 참고할 로어를 키워드만으로 찾을지 의미 검색까지 쓸지 정함.',
    '검수 템플릿 선택': '응답 교정 프롬프트 구성을 선택함. 주제별 선택은 필요한 검사만 켤 수 있음.',
    '참조 대화 턴 수': '응답 교정 시 최근 대화 몇 턴을 같이 볼지 정함. 높을수록 비용 증가.',
    'API 종류': '추출/변환/교정 호출에 사용할 API 공급자를 고름.',
    'DeepSeek API 키': 'DeepSeek API 호출용 키. 의미 검색/임베딩에는 별도 Gemini 키가 필요함.',
    'DeepSeek 추론 사용': 'DeepSeek V4 추론 모드를 사용함. 품질은 좋아질 수 있으나 응답이 느려질 수 있음.',
    'DeepSeek 추론 강도': 'DeepSeek 추론 강도. 높을수록 느리고 비용/출력 지연 가능성이 커짐.',
    '임베딩용 Gemini API 키': 'DeepSeek 사용 시에도 의미 검색 벡터 생성은 Gemini Embedding API를 사용함.',
    '추출/정리용 모델': '자동 추출, 수동 추출, 전체 로그 추출, 지식 변환에 사용할 생성 모델.',
    '후보 준비 모델': '다음 삽입 후보를 미리 고를 때 사용할 가벼운 판단 모델.',
    '과거 장면 판단 모델': '중요 장면 기억 중 지금 대화에 맞는 장면을 고를 때 사용할 모델.',
    '응답 교정 모델': '최근 AI 응답을 검수/수정할 때 사용할 모델. 비우면 기본 모델 사용.',
    '임베딩 모델': '의미 검색 벡터를 만들 모델. 변경하면 기존 임베딩 재생성 권장.',
    'Gemini 추출 프롬프트': 'Gemini API에 보낼 추출 템플릿. 기본 템플릿은 안전하게 보존됨.',
    'DeepSeek 추출 프롬프트': 'DeepSeek API에 보낼 별도 전체 프롬프트. Gemini 템플릿과 독립적으로 저장됨.',
    '템플릿': '사용할 추출 프롬프트 세트. 새 템플릿을 만들면 기존 기본값을 유지한 채 실험 가능함.',
    '출력 형식(JSON)': '모델이 반드시 따라야 하는 JSON 결과 구조. 깨지면 파싱 실패 가능성이 높음.',
    '새 로어 추출 지시문': '새 로어팩을 만들 때 사용할 Gemini 추출 지시문.',
    '기존 로어 참고 지시문': '기존 로어를 참고해 중복을 줄이고 갱신할 때 사용할 Gemini 지시문.',
    '새 로어 추출 전체 프롬프트': 'DeepSeek로 새 로어를 추출할 때 쓰는 전체 프롬프트.',
    '기존 로어 참고 전체 프롬프트': 'DeepSeek로 기존 로어를 참고해 병합/갱신할 때 쓰는 전체 프롬프트.',
    '지식 변환 전체 프롬프트': 'DeepSeek로 URL/텍스트 지식을 로어팩으로 바꿀 때 쓰는 전체 프롬프트.',
    '공통 규칙 블록': '추출, 변환, 교정 프롬프트에 공통으로 붙는 안정화 규칙.',
    '후보 준비 지시문': '다음 턴에 넣을 로어 후보를 미리 고르는 판단 지시문.',
    '응답 교정 지시문': 'AI 응답을 로어와 비교해 수정할 때 쓰는 교정 지시문.',
    '유사도 임계값': '중복 병합 후보로 볼 최소 유사도. 낮추면 후보가 늘지만 오병합 위험 증가.',
    '최대 글자수 (summary)': '병합 후 summary.full의 목표 상한. 긴 항목 유지/LLM 병합 모두 이 값을 참고함.',
    '일괄 병합 방식': '찾은 모든 후보를 한 번에 병합할 때 사용할 방식. LLM 방식은 API 비용 발생.',
    '최근 AI 응답 재검수': '현재 채팅의 마지막 AI 응답을 즉시 다시 검사함. 수동 테스트에 가장 많이 쓰는 버튼.',
    '로어 목록': '현재 채팅에서 활성화된 로어팩과 로어를 확인하고 개별 ON/OFF, 수정, 삭제, 임베딩을 관리함.'
  };

  function kv() {
    return (L.__LoreEnv && L.__LoreEnv.kv) || _w.localStorage;
  }

  function shellHost() {
    let host = document.getElementById(SHELL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = SHELL_ID;
      (document.body || document.documentElement).appendChild(host);
    }
    return host;
  }

  function shellRoot() {
    const host = shellHost();
    return host.shadowRoot || host.attachShadow({ mode: 'open' });
  }

  function shellNode() {
    const host = document.getElementById(SHELL_ID);
    const root = host && host.shadowRoot;
    return root ? root.querySelector('.lore-v2-app') : null;
  }

  function installStyle(root) {
    if (root.querySelector('style[' + STYLE_MARK + ']')) return;
    const css = `
      .lore-v2-app {
        --li-bg: #18181B;
        --li-surface: #232327;
        --li-surface-2: #2B2B31;
        --li-surface-3: #32323A;
        --li-line: #3F3F46;
        --li-line-strong: #52525B;
        --li-text: #FAFAFA;
        --li-text-soft: #A1A1AA;
        --li-muted: #A1A1AA;
        --li-accent: #818CF8;
        --li-accent-strong: #C7D2FE;
        --li-accent-bg: rgba(129,140,248,.14);
        --li-ok: #16A34A;
        --li-warn: #D97706;
        --li-danger: #DC2626;
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        display: none;
        color: var(--li-text);
        font-family: -apple-system, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif;
        font-size: 14px;
        line-height: 1.5;
        letter-spacing: 0;
      }
      .lore-v2-app[data-open="true"] { display: block; }
      .lore-v2-app * { box-sizing: border-box; }
      .lore-v2-app,
      .lore-v2-app button,
      .lore-v2-app label,
      .lore-v2-app summary,
      .lore-v2-section,
      .lore-v2-page,
      .lore-v2-field {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
      }
      .lore-v2-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0,0,0,.58);
      }
      .lore-v2-frame {
        position: absolute;
        top: 50%;
        left: 50%;
        width: min(980px, calc(100vw - 40px));
        height: min(760px, calc(100vh - 56px));
        transform: translate(-50%, -50%);
        display: grid;
        grid-template-columns: 208px minmax(0, 1fr);
        background: var(--li-surface);
        border: 1px solid var(--li-line-strong);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(0,0,0,.48);
      }
      .lore-v2-frame button,
      .lore-v2-frame input,
      .lore-v2-frame textarea,
      .lore-v2-frame select {
        max-width: 100%;
      }
      .lore-v2-sidebar {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr;
        gap: 12px;
        padding: 16px 13px;
        background: var(--li-bg);
        border-right: 1px solid var(--li-line);
      }
      .lore-v2-brand {
        padding: 2px 4px 12px;
        border-bottom: 1px solid var(--li-line);
      }
      .lore-v2-brand-row {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }
      .lore-v2-brand-avatar {
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid var(--li-line);
        background: #fff;
      }
      .lore-v2-brand-title {
        font-size: 16px;
        line-height: 1.2;
        font-weight: 600;
        color: var(--li-text);
      }
      .lore-v2-search {
        -webkit-user-select: text;
        user-select: text;
        -webkit-touch-callout: default;
        width: 100%;
        height: 34px;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: var(--li-bg);
        color: var(--li-text);
        padding: 0 10px;
        font-size: 12px;
        outline: none;
      }
      .lore-v2-search:focus {
        border-color: var(--li-accent);
        box-shadow: 0 0 0 2px rgba(138,180,255,.12);
      }
      .lore-v2-sections {
        min-height: 0;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .lore-v2-section {
        width: 100%;
        min-height: 48px;
        padding: 9px 10px;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--li-text-soft);
        text-align: left;
        cursor: pointer;
      }
      .lore-v2-section:hover { background: var(--li-surface-2); }
      .lore-v2-section[data-active="true"] {
        background: var(--li-accent-bg);
        border-color: rgba(138,180,255,.36);
        color: var(--li-text);
      }
      .lore-v2-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
      }
      .lore-v2-section-desc {
        margin-top: 4px;
        color: var(--li-muted);
        font-size: 10px;
        line-height: 1.35;
        word-break: keep-all;
      }
      .lore-v2-count {
        min-width: 20px;
        padding: 1px 6px;
        border-radius: 999px;
        background: rgba(255,255,255,.07);
        color: var(--li-text-soft);
        font-size: 10px;
        text-align: center;
      }
      .lore-v2-main {
        min-width: 0;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr;
        background: var(--li-surface);
      }
      .lore-v2-header {
        min-height: 54px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px 10px;
        border-bottom: 1px solid var(--li-line);
        background: var(--li-surface);
      }
      .lore-v2-title-wrap { min-width: 0; }
      .lore-v2-title {
        color: var(--li-text);
        font-size: 17px;
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-v2-subtitle {
        margin-top: 4px;
        color: var(--li-muted);
        font-size: 11px;
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-v2-close {
        width: 34px;
        height: 34px;
        flex: 0 0 auto;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: var(--li-surface-2);
        color: var(--li-text-soft);
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
      }
      .lore-v2-close:hover {
        border-color: var(--li-accent);
        color: var(--li-text);
      }
      .lore-v2-pages {
        min-height: 48px;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        scrollbar-width: thin;
        padding: 9px 16px;
        border-bottom: 1px solid var(--li-line);
        background: var(--li-bg);
      }
      .lore-v2-page {
        flex: 0 0 auto;
        min-height: 34px;
        max-width: 240px;
        padding: 8px 12px;
        border: 1px solid var(--li-line);
        border-radius: 8px;
        background: transparent;
        color: var(--li-text-soft);
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lore-v2-page:hover { background: var(--li-surface-2); }
      .lore-v2-page[data-active="true"] {
        border-color: rgba(138,180,255,.42);
        background: var(--li-accent-bg);
        color: var(--li-accent-strong);
      }
      .lore-v2-content {
        min-width: 0;
        min-height: 0;
        overflow: auto;
        overscroll-behavior: contain;
        padding: 22px 24px 34px;
        background: var(--li-surface);
      }
      .lore-v2-empty {
        border: 1px dashed var(--li-line-strong);
        border-radius: 10px;
        padding: 14px;
        color: var(--li-text-soft);
        font-size: 12px;
        line-height: 1.7;
        word-break: keep-all;
      }
      .lore-v2-field {
        width: 100%;
        border: 1px solid var(--li-line);
        border-radius: 10px;
        background: var(--li-surface-2);
        padding: 16px;
        margin: 0 0 16px;
        box-shadow: 0 1px 0 rgba(255,255,255,.03) inset;
      }
      .lore-v2-content input:not([type="checkbox"]):not([type="radio"]),
      .lore-v2-content textarea,
      .lore-v2-content select {
        -webkit-user-select: text;
        user-select: text;
        -webkit-touch-callout: default;
        border-color: var(--li-line) !important;
        background: var(--li-bg) !important;
        color: var(--li-text) !important;
        border-radius: 8px !important;
        min-height: 40px !important;
        padding: 9px 11px !important;
        font-size: 13px !important;
        line-height: 1.45 !important;
        outline: none !important;
      }
      .lore-v2-content input[type="checkbox"],
      .lore-v2-content input[type="radio"] {
        -webkit-user-select: none;
        user-select: none;
        -webkit-touch-callout: none;
        border-color: var(--li-line) !important;
        background: var(--li-bg) !important;
        color: var(--li-text) !important;
        min-height: auto !important;
        padding: initial !important;
      }
      .lore-v2-content input:focus,
      .lore-v2-content textarea:focus,
      .lore-v2-content select:focus {
        border-color: var(--li-accent) !important;
        box-shadow: 0 0 0 2px rgba(138,180,255,.12) !important;
      }
      .lore-v2-content button {
        border-radius: 8px !important;
        letter-spacing: 0 !important;
        min-width: 0 !important;
        min-height: 36px !important;
        padding: 8px 13px !important;
        font-size: 12px !important;
        line-height: 1.25 !important;
        font-weight: 600 !important;
        background: var(--li-surface-3) !important;
        border-color: var(--li-line-strong) !important;
        color: var(--li-text) !important;
      }
      .lore-v2-content button:hover {
        border-color: var(--li-accent) !important;
        background: rgba(129,140,248,.16) !important;
      }
      .lore-v2-content button.lore-v2-button-helped {
        position: relative;
        padding-right: 32px !important;
      }
      .lore-v2-content button.lore-v2-button-helped::after {
        content: attr(data-lore-help-symbol);
        position: absolute;
        right: 8px;
        top: 50%;
        width: 16px;
        height: 16px;
        transform: translateY(-50%);
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        line-height: 1;
        font-weight: 800;
        border: 1px solid rgba(129,140,248,.48);
        background: rgba(129,140,248,.13);
        color: var(--li-accent-strong);
      }
      .lore-v2-content button.lore-v2-button-helped.lore-v2-button-api::after {
        border-color: rgba(217,119,6,.50);
        background: rgba(217,119,6,.13);
        color: #FCD34D;
      }
      .lore-v2-content button.lore-v2-button-helped::before {
        content: attr(data-tip);
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        transform: translateX(-50%);
        width: min(320px, calc(100vw - 40px));
        max-width: 320px;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--li-line-strong);
        background: #111114;
        color: var(--li-text);
        box-shadow: 0 16px 38px rgba(0,0,0,.42);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.55;
        white-space: pre-line;
        text-align: left;
        opacity: 0;
        pointer-events: none;
        transition: opacity .12s ease;
        z-index: 5;
      }
      .lore-v2-content button.lore-v2-button-helped:hover::before,
      .lore-v2-content button.lore-v2-button-helped:focus-visible::before {
        opacity: 1;
      }
      .lore-v2-content textarea {
        min-height: 86px;
      }
      .lore-v2-content > * {
        max-width: 100%;
      }
      .lore-v2-content table {
        width: 100%;
        border-collapse: collapse;
      }
      .lore-v2-content th,
      .lore-v2-content td {
        border-color: var(--li-line) !important;
      }
      .lore-v2-content pre,
      .lore-v2-content code {
        -webkit-user-select: text;
        user-select: text;
        background: var(--li-bg);
        color: var(--li-text-soft);
      }
      .lore-v2-help-wrap {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .lore-v2-help,
      .lore-v2-api-warn {
        width: 18px !important;
        height: 18px !important;
        min-width: 18px !important;
        min-height: 18px !important;
        padding: 0 !important;
        border-radius: 999px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 11px !important;
        line-height: 1 !important;
        font-weight: 700 !important;
        cursor: help !important;
        position: relative;
      }
      .lore-v2-help {
        color: var(--li-accent-strong) !important;
        border: 1px solid rgba(129,140,248,.48) !important;
        background: rgba(129,140,248,.13) !important;
      }
      .lore-v2-api-warn {
        color: #FCD34D !important;
        border: 1px solid rgba(217,119,6,.50) !important;
        background: rgba(217,119,6,.13) !important;
      }
      .lore-v2-help::after,
      .lore-v2-api-warn::after {
        content: attr(data-tip);
        position: absolute;
        left: 50%;
        bottom: calc(100% + 8px);
        transform: translateX(-50%);
        width: min(320px, calc(100vw - 40px));
        max-width: 320px;
        padding: 9px 10px;
        border-radius: 8px;
        border: 1px solid var(--li-line-strong);
        background: #111114;
        color: var(--li-text);
        box-shadow: 0 16px 38px rgba(0,0,0,.42);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.55;
        white-space: pre-line;
        text-align: left;
        opacity: 0;
        pointer-events: none;
        transition: opacity .12s ease;
        z-index: 4;
      }
      .lore-v2-help:hover::after,
      .lore-v2-help:focus-visible::after,
      .lore-v2-api-warn:hover::after,
      .lore-v2-api-warn:focus-visible::after {
        opacity: 1;
      }
      .lore-v2-compact-toggle {
        width: 24px !important;
        min-width: 24px !important;
        height: 24px !important;
        min-height: 24px !important;
        padding: 0 !important;
        border-radius: 6px !important;
      }
      .lore-v2-content ::placeholder {
        color: var(--li-muted);
        opacity: 1;
      }
      .lore-v2-content [style*="#78d5a8"],
      .lore-v2-content [style*="rgb(120, 213, 168)"] {
        color: var(--li-accent-strong) !important;
      }
      .lore-v2-content [style*="rgba(120,213,168"],
      .lore-v2-content [style*="rgba(120, 213, 168"] {
        border-color: rgba(129,140,248,.42) !important;
        background-color: rgba(129,140,248,.12) !important;
      }
      .lore-v2-content [style*="#e7b56f"],
      .lore-v2-content [style*="rgb(231, 181, 111)"] {
        color: var(--li-warn) !important;
      }
      .lore-v2-content [style*="#ef6b6b"],
      .lore-v2-content [style*="rgb(239, 107, 107)"] {
        color: var(--li-danger) !important;
      }
      .lore-v2-content label {
        min-width: 0;
      }
      .lore-v2-content [style*="display:flex"],
      .lore-v2-content [style*="display: flex"] {
        min-width: 0;
      }
      .lore-v2-content [style*="font-weight:800"],
      .lore-v2-content [style*="font-weight: 800"],
      .lore-v2-content [style*="font-weight:900"],
      .lore-v2-content [style*="font-weight: 900"] {
        font-weight: 600 !important;
      }
      .lore-v2-content [style*="border-radius:9px"],
      .lore-v2-content [style*="border-radius: 9px"],
      .lore-v2-content [style*="border-radius:10px"],
      .lore-v2-content [style*="border-radius: 10px"] {
        border-radius: 8px !important;
      }
      @media (max-width: 639px) {
        .lore-v2-frame {
          inset: 0;
          top: auto;
          left: auto;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          transform: none;
          grid-template-columns: 1fr;
          grid-template-rows: auto 1fr;
          border: 0;
          border-radius: 0;
        }
        .lore-v2-sidebar {
          grid-template-rows: auto auto;
          gap: 8px;
          padding: calc(10px + env(safe-area-inset-top, 0px)) 10px 8px;
          border-right: 0;
          border-bottom: 1px solid var(--li-line);
        }
        .lore-v2-brand {
          padding: 0;
          border-bottom: 0;
        }
        .lore-v2-brand-title { font-size: 14px; }
        .lore-v2-brand-avatar { width: 28px; height: 28px; border-radius: 7px; }
        .lore-v2-sections {
          flex-direction: row;
          overflow-x: auto;
          overscroll-behavior-x: contain;
          scrollbar-width: thin;
          padding-bottom: 1px;
        }
        .lore-v2-section {
          width: auto;
          min-width: 124px;
          flex: 0 0 auto;
        }
        .lore-v2-section-desc { display: none; }
        .lore-v2-main { grid-template-rows: auto auto 1fr; }
        .lore-v2-header { min-height: 52px; padding: 9px 12px; }
        .lore-v2-title {
          font-size: 15px;
        }
        .lore-v2-subtitle {
          white-space: normal;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .lore-v2-pages { padding: 8px 10px; }
        .lore-v2-page {
          max-width: 190px;
        }
        .lore-v2-content {
          padding: 14px 12px calc(24px + env(safe-area-inset-bottom, 0px));
          overflow-x: hidden;
        }
        .lore-v2-field { padding: 13px; margin-bottom: 12px; }
        .lore-v2-help::after,
        .lore-v2-api-warn::after,
        .lore-v2-content button.lore-v2-button-helped::before {
          display: none !important;
        }
        .lore-v2-content [style*="grid-template-columns: 1fr 1fr"],
        .lore-v2-content [style*="grid-template-columns:1fr 1fr"],
        .lore-v2-content [style*="grid-template-columns: repeat(2"],
        .lore-v2-content [style*="grid-template-columns:repeat(2"] {
          grid-template-columns: 1fr !important;
        }
        .lore-v2-content [style*="display:flex"],
        .lore-v2-content [style*="display: flex"] {
          flex-wrap: wrap;
        }
      }
      @media (max-height: 560px) and (min-width: 640px) {
        .lore-v2-frame {
          width: min(820px, calc(100vw - 28px));
          height: calc(100vh - 28px);
        }
        .lore-v2-section-desc {
          display: none;
        }
        .lore-v2-section {
          min-height: 34px;
          padding: 6px 8px;
        }
      }
    `;
    const style = document.createElement('style');
    style.setAttribute(STYLE_MARK, '');
    style.textContent = css;
    root.appendChild(style);
  }

  const state = {
    rootOrder: [],
    roots: new Map(),
    pages: new Map(),
    activeRoot: '',
    activePage: '',
    query: ''
  };

  function normalizeText(text) {
    return String(text || '').toLowerCase();
  }

  function saveLastSection(rootId) {
    try { kv().setItem(LAST_SECTION_KEY, rootId || ''); } catch (_) {}
  }

  function loadLastSection() {
    try { return kv().getItem(LAST_SECTION_KEY) || ''; } catch (_) { return ''; }
  }

  function pageMatches(root, page) {
    const q = normalizeText(state.query).trim();
    if (!q) return true;
    return normalizeText(root.label + ' ' + root.desc + ' ' + page.label).includes(q);
  }

  function ensureRoot(id, label, desc, order) {
    if (!state.roots.has(id)) {
      state.roots.set(id, { id, label: label || id, desc: desc || '', order: order || 1000, pages: [] });
      state.rootOrder.push(id);
      state.rootOrder.sort((a, b) => {
        const ra = state.roots.get(a);
        const rb = state.roots.get(b);
        const ao = ra ? ra.order : 1000;
        const bo = rb ? rb.order : 1000;
        if (ao !== bo) return ao - bo;
        return a < b ? -1 : a > b ? 1 : 0;
      });
    } else {
      const root = state.roots.get(id);
      if (label) root.label = label;
      if (desc) root.desc = desc;
      if (order) root.order = order;
    }
    return state.roots.get(id);
  }

  function makePanelAdapter(content) {
    return {
      addBoxedField: function (_label, _value, opts) {
        const box = document.createElement('div');
        box.className = 'lore-v2-field';
        content.appendChild(box);
        if (opts && typeof opts.onInit === 'function') opts.onInit(box);
        return box;
      },
      addText: function (text) {
        const p = document.createElement('div');
        p.textContent = text || '';
        p.className = 'lore-v2-empty';
        content.appendChild(p);
        return p;
      }
    };
  }

  function textKeyOf(node) {
    const raw = Array.from(node.childNodes || [])
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent || '')
      .join(' ')
      .trim();
    return raw.replace(/\s+/g, ' ');
  }

  function showHelpDialog(label, body, api) {
    const text = label + '\n\n' + body + (api ? '\n\nAPI 호출 또는 비용이 발생할 수 있음.' : '');
    alert(text.slice(0, 1200));
  }

  function makeHelpIcon(label, body, isApi) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = isApi ? 'lore-v2-api-warn' : 'lore-v2-help';
    btn.textContent = isApi ? '!' : '?';
    btn.setAttribute('aria-label', (isApi ? 'API 비용 안내: ' : '도움말: ') + label);
    btn.dataset.tip = (isApi ? 'API 호출/비용 발생 가능\n' : '') + body;
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      showHelpDialog(label, body, isApi);
    };
    return btn;
  }

  function decorateHelp(content) {
    if (!content) return;
    const candidates = Array.from(content.querySelectorAll('div, span, label, summary, button'))
      .filter(el => !el.closest('.lore-v2-help-wrap') && !el.classList.contains('lore-v2-help') && !el.classList.contains('lore-v2-api-warn'));
    candidates.forEach((el) => {
      if (el.matches('input, textarea, select')) return;
      const key = textKeyOf(el);
      if (!key || !HELP_TEXTS[key]) return;
      if (el.tagName === 'BUTTON') {
        const isApi = API_HELP_LABELS.has(key);
        el.classList.add('lore-v2-button-helped');
        if (isApi) el.classList.add('lore-v2-button-api');
        el.dataset.loreHelpSymbol = isApi ? '!' : '?';
        el.dataset.tip = (isApi ? 'API 호출/비용 발생 가능\n' : '') + HELP_TEXTS[key];
        el.title = HELP_TEXTS[key] + (isApi ? '\nAPI 호출 또는 비용이 발생할 수 있음.' : '');
        return;
      }
      if (el.querySelector && el.querySelector('.lore-v2-help-wrap')) return;
      const wrap = document.createElement('span');
      wrap.className = 'lore-v2-help-wrap';
      wrap.appendChild(makeHelpIcon(key, HELP_TEXTS[key], false));
      if (API_HELP_LABELS.has(key)) wrap.appendChild(makeHelpIcon(key, HELP_TEXTS[key], true));
      el.appendChild(wrap);
    });
  }

  function sortRootPages(root) {
    if (!root) return;
    root.pages.sort((a, b) => {
      const pa = state.pages.get(a);
      const pb = state.pages.get(b);
      const ao = pa ? pa.order : 1000;
      const bo = pb ? pb.order : 1000;
      if (ao !== bo) return ao - bo;
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  function addPage(rootId, label, action, key, order) {
    const root = state.roots.get(rootId) || ensureRoot(rootId, rootId, '', 1000);
    const id = rootId + ':' + (key || label);
    if (!state.pages.has(id)) {
      state.pages.set(id, { id, key: key || label, rootId, label, action, order: order || 1000 });
      root.pages.push(id);
      sortRootPages(root);
    } else {
      const page = state.pages.get(id);
      page.label = label;
      page.action = action;
      page.order = order || page.order || 1000;
      sortRootPages(root);
    }
    return state.pages.get(id);
  }

  function registerPage(spec) {
    if (!spec || !spec.key || typeof spec.render !== 'function') return;
    const root = ensureRoot(spec.rootId || spec.key, spec.rootLabel || spec.rootId || spec.key, spec.rootDesc || '', spec.rootOrder || 1000);
    addPage(root.id, spec.label || spec.key, spec.render, spec.key, spec.order || 1000);
    if (!state.activeRoot) {
      const restored = findRestoredRoot();
      if (restored) {
        const first = firstVisiblePage(restored);
        state.activeRoot = restored.id;
        state.activePage = first ? first.id : '';
      }
    }
    if (shellNode()) {
      renderShellNav();
      const active = state.pages.get(state.activePage);
      if (active) renderPage(active);
    }
  }

  function renderPage(page) {
    const shell = shellNode();
    if (!shell || !page) return;
    const content = shell.querySelector('.lore-v2-content');
    const title = shell.querySelector('.lore-v2-title');
    const subtitle = shell.querySelector('.lore-v2-subtitle');
    const root = state.roots.get(page.rootId);
    content.scrollTop = 0;
    content.innerHTML = '';
    title.textContent = page.label;
    subtitle.textContent = root && root.desc ? root.desc : '필요한 설정과 작업을 이 화면에서 처리함';
    const menuApi = {
      replaceContentPanel: function (renderer, titleOverride) {
        if (titleOverride) title.textContent = titleOverride;
        content.scrollTop = 0;
        content.innerHTML = '';
        const panel = makePanelAdapter(content);
        if (typeof renderer === 'function') renderer(panel);
        requestAnimationFrame(() => {
          decorateHelp(content);
          content.scrollTop = 0;
        });
      },
      openPage
    };
    try {
      page.action(menuApi);
    } catch (e) {
      const err = document.createElement('div');
      err.className = 'lore-v2-empty';
      err.textContent = '화면 렌더링 실패: ' + (e && e.message ? e.message : String(e));
      content.appendChild(err);
      console.error('[LoreShell] render failed:', page.id, e);
    }
    requestAnimationFrame(() => {
      decorateHelp(content);
      content.scrollTop = 0;
    });
  }

  function firstVisiblePage(root) {
    if (!root) return null;
    for (const pageId of root.pages) {
      const page = state.pages.get(pageId);
      if (page && pageMatches(root, page)) return page;
    }
    return null;
  }

  function firstVisibleRoot() {
    for (const rootId of state.rootOrder) {
      const root = state.roots.get(rootId);
      if (firstVisiblePage(root)) return root;
    }
    return null;
  }

  function findPageByKey(key) {
    for (const page of state.pages.values()) {
      if (page.key === key) return page;
    }
    return null;
  }

  function openPage(key) {
    const page = findPageByKey(key);
    if (!page) return false;
    setActive(page.rootId, page.id);
    const shell = shellNode();
    if (shell) shell.dataset.open = 'true';
    return true;
  }

  function findRestoredRoot() {
    return firstVisibleRoot();
  }

  function setActive(rootId, pageId) {
    const root = state.roots.get(rootId);
    if (!root) return;
    const page = pageId ? state.pages.get(pageId) : firstVisiblePage(root);
    if (!page) return;
    state.activeRoot = rootId;
    state.activePage = page.id;
    saveLastSection(rootId);
    renderShellNav();
    renderPage(page);
  }

  function makeSectionButton(root, visiblePages) {
    const btn = document.createElement('button');
    btn.className = 'lore-v2-section';
    btn.dataset.active = String(root.id === state.activeRoot);
    btn.innerHTML = `
      <span class="lore-v2-section-title"><span></span><span class="lore-v2-count"></span></span>
      <span class="lore-v2-section-desc"></span>
    `;
    btn.querySelector('.lore-v2-section-title span:first-child').textContent = root.label;
    btn.querySelector('.lore-v2-count').textContent = String(visiblePages.length);
    btn.querySelector('.lore-v2-section-desc').textContent = root.desc;
    btn.onclick = () => setActive(root.id);
    return btn;
  }

  function renderShellNav() {
    const shell = shellNode();
    if (!shell) return;
    const nav = shell.querySelector('.lore-v2-sections');
    const pages = shell.querySelector('.lore-v2-pages');
    nav.innerHTML = '';
    pages.innerHTML = '';
    const root = state.roots.get(state.activeRoot);
    const activePage = state.pages.get(state.activePage);
    const activeStillVisible = root && activePage && pageMatches(root, activePage);
    if (!activeStillVisible) {
      const nextRoot = findRestoredRoot();
      if (nextRoot) {
        const nextPage = firstVisiblePage(nextRoot);
        state.activeRoot = nextRoot.id;
        state.activePage = nextPage ? nextPage.id : '';
      }
    }
    let visibleRoots = 0;
    state.rootOrder.forEach((rootId) => {
      const section = state.roots.get(rootId);
      if (!section) return;
      const visiblePages = section.pages.map(id => state.pages.get(id)).filter(page => page && pageMatches(section, page));
      if (!visiblePages.length) return;
      visibleRoots += 1;
      nav.appendChild(makeSectionButton(section, visiblePages));
    });
    const currentRoot = state.roots.get(state.activeRoot);
    if (currentRoot) {
      currentRoot.pages.forEach((pageId) => {
        const page = state.pages.get(pageId);
        if (!page || !pageMatches(currentRoot, page)) return;
        const btn = document.createElement('button');
        btn.className = 'lore-v2-page';
        btn.textContent = page.label;
        btn.dataset.active = String(pageId === state.activePage);
        btn.onclick = () => setActive(currentRoot.id, pageId);
        pages.appendChild(btn);
      });
    }
  }

  function ensureShell() {
    const root = shellRoot();
    installStyle(root);
    let shell = shellNode();
    if (shell) return shell;
    shell = document.createElement('div');
    shell.className = 'lore-v2-app';
    shell.innerHTML = `
      <div class="lore-v2-backdrop"></div>
      <div class="lore-v2-frame" role="dialog" aria-modal="true" aria-label="로어 인젝터 설정">
        <aside class="lore-v2-sidebar">
          <div class="lore-v2-brand">
            <div class="lore-v2-brand-row">
              <img class="lore-v2-brand-avatar" src="${BRAND_IMAGE_URL}" alt="">
              <div class="lore-v2-brand-title">로어 인젝터</div>
            </div>
          </div>
          <input class="lore-v2-search" type="search" placeholder="검색" aria-label="설정 검색">
          <div class="lore-v2-sections" role="tablist" aria-label="설정 섹션"></div>
        </aside>
        <main class="lore-v2-main">
          <header class="lore-v2-header">
            <div class="lore-v2-title-wrap">
              <div class="lore-v2-title">설정</div>
              <div class="lore-v2-subtitle">작업 흐름 선택</div>
            </div>
            <button class="lore-v2-close" type="button" title="닫기" aria-label="닫기">X</button>
          </header>
          <nav class="lore-v2-pages" aria-label="현재 섹션 화면"></nav>
          <section class="lore-v2-content"></section>
        </main>
      </div>
    `;
    shell.querySelector('.lore-v2-backdrop').onclick = close;
    shell.querySelector('.lore-v2-close').onclick = close;
    const search = shell.querySelector('.lore-v2-search');
    search.oninput = () => {
      state.query = search.value || '';
      renderShellNav();
      const page = state.pages.get(state.activePage);
      if (page && pageMatches(state.roots.get(page.rootId), page)) renderPage(page);
    };
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && shell.dataset.open === 'true') close();
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k' && shell.dataset.open === 'true') {
        ev.preventDefault();
        search.focus();
      }
    });
    root.appendChild(shell);
    return shell;
  }

  function open() {
    const shell = ensureShell();
    const root = firstVisibleRoot();
    if (root) setActive(root.id);
    else renderShellNav();
    shell.dataset.open = 'true';
  }

  function close() {
    const shell = shellNode();
    if (shell) shell.dataset.open = 'false';
  }

  function resetRegistry() {
    state.rootOrder.length = 0;
    state.roots.clear();
    state.pages.clear();
    state.activeRoot = '';
    state.activePage = '';
  }

  L.__LoreSettingsShell = { registerPage, open, close, ensureShell, resetRegistry, openPage };
  L.__settingsShellLoaded = true;
  if (typeof L.setupSettingsPages === 'function') L.setupSettingsPages();
  console.log('[LoreShell] loaded');
})();
