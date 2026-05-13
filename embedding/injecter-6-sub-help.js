// injecter-6-sub-help.js: 도움말
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subHelpLoaded) return;

  const { C } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};

  const HELP_QUICK_START = {
  "title": "제작자: 로컬AI",
  "text": "[핵심 기능]\n1. 현재 장면에 맞는 로어를 찾아 대화에 자동 삽입함.\n2. 대화를 주기적으로 읽어 로어팩에 기억을 추가함.\n3. 중요한 사건/약속은 별도 장면 기억으로 저장해 나중에 다시 불러옴.\n\n[로드 방식]\n메인화면에서는 무거운 모듈 로드 안 함. 채팅/에피소드 주소로 들어가거나 메인에서 자연스럽게 이동하면 그때 UI 로드함.\n\n[용어]\n로어: 요약본/기억\n의미 검색: 단어가 달라도 비슷한 의미의 로어를 찾는 기능\n변경분만 저장: 기존 로어 전체 대신 바뀐 부분만 받아 출력 토큰 줄이는 기능"
};
  const HELP_ITEMS = [
  {
    "title": "로어 설정",
    "sections": [
      {
        "label": "[빠른 설정]",
        "text": "처음 쓰면 기본 추천 권장.\n수동 검색은 API 호출 최소화용.\n정밀은 후보 재정렬/응답 교정까지 쓰는 장문 RP용."
      },
      {
        "label": "[인젝션/압축]",
        "text": "로어 인젝션 활성화\n대화에 로어 자동 삽입함. 보통 ON 권장.\n\n적응형 로어 압축\n삽입 공간이 부족하면 로어 길이를 자동으로 줄임.\n자동: 남은 공간에 맞춤\n길게: 자세히 넣음\n짧게: 핵심만 넣음\n아주 짧게: 최소 정보만 넣음"
      },
      {
        "label": "[검색 & 감지]",
        "text": "의미로 찾기\n단어가 달라도 관련 로어 찾음. API/검색 준비 필요.\n\n의미 검색 모델\n모델을 바꾸면 기존 로어 검색 준비 재실행 권장.\n\n추출 후 검색 준비\n새 로어를 의미 검색용으로 자동 준비함.\n\n오래된 기억 다시 챙기기\n오래 안 나온 중요 로어도 필요하면 다시 넣음.\n\nAI로 후보 다시 고르기\n검색 후보를 현재 장면 기준으로 다시 정렬함. 정확도는 오르지만 지연/API 비용 증가."
      },
      {
        "label": "[추가 정보/출력]",
        "text": "호칭 정보\n캐릭터 간 호칭 정보 함께 전달함.\n\n첫 만남/재회 관리\n처음 만나는지, 오랜만에 다시 만나는지 자동 전달함.\n\n출력 포맷\n로어를 어떤 접두사/접미사로 감쌀지 정함."
      }
    ]
  },
  {
    "title": "추출/변환 설정",
    "sections": [
      {
        "label": "[자동/수동 추출]",
        "text": "자동 대화 정리\n정해진 턴마다 대화를 읽어 로어팩에 저장함.\n\n수동 추출 실행\n자동 추출 설정값 그대로 즉시 실행함. 일반 로어 추출, 검색 준비, 중요 장면 추출까지 끝난 뒤 완료 표시함.\n\n저장할 로어팩\n현재 채팅에서 추출 결과가 들어갈 로어팩 이름."
      },
      {
        "label": "[변경분만 저장]",
        "text": "ON/OFF 모두 같은 대화와 기존 로어 요약을 입력으로 보냄.\nON: 바뀐 부분만 받아 기존 로어에 반영함. 변화 없으면 저장/검색 준비 건너뜀.\nOFF: 갱신된 전체 로어를 받아 병합함.\n\n즉, 입력 토큰은 거의 같아야 하고 출력 토큰만 달라지는 구조."
      },
      {
        "label": "[중요 장면 기억하기]",
        "text": "일반 로어 추출과 별도 API 호출로 실행함.\n사건, 약속, 관계 변화처럼 나중에 다시 참고할 장면을 저장함.\n변경분만 저장 ON이면 중요 장면도 바뀐 부분만 받아 반영함."
      },
      {
        "label": "[과거 장면 불러오기 판단]",
        "text": "저장된 중요 장면 중 지금 대화에 맞는 것을 고름.\n이 화면에서는 ON/OFF, 제한 시간, 검토할 장면 수만 조절함.\n모델과 생각 깊이는 API 설정에서 관리함."
      },
      {
        "label": "[전체 로그 일괄 추출]",
        "text": "이미 긴 채팅을 처음 정리할 때 쓰는 기능.\n대화를 배치로 나눠 여러 번 요약함.\n배치 크기: 한 번에 읽을 턴 수\n오버랩: 흐름 끊김 방지용 중복 턴 수\n재시도: API 실패 시 다시 시도할 횟수"
      },
      {
        "label": "[지식 변환]",
        "text": "URL/텍스트를 로어팩으로 변환함.\nAPI 설정의 추출/정리용 모델 사용함.\n생성된 로어팩은 자동 활성화함."
      }
    ]
  },
  {
    "title": "API 설정",
    "sections": [
      {
        "label": "[API 연결]",
        "text": "지원 방식은 3종.\nAPI Key: 가장 단순함. 처음 설정 권장.\nVertex JSON: 서비스 계정 JSON 사용함.\nFirebase: Firebase 설정 스크립트 사용함. 의미 검색 준비는 별도 Gemini API Key 필요."
      },
      {
        "label": "[모델 선택]",
        "text": "API를 쓰는 모델 선택은 여기서 관리함.\n\n추출/정리용 모델\n자동 추출, 수동 추출, 지식 변환, 중요 장면 추출에 사용함.\n\n후보 재정렬 모델\n검색된 로어 후보를 다시 고를 때 사용함.\n\n과거 장면 판단 모델\n저장된 중요 장면 중 지금 대화에 맞는 것을 고를 때 사용함.\n\n응답 교정 모델\nAI 응답을 검수/수정할 때 사용함. 비워두면 기본 LLM 사용."
      },
      {
        "label": "[비용 표시]",
        "text": "API 응답에 usageMetadata가 있으면 실제 토큰 사용량 기준으로 계산함.\n없으면 글자 수 기반 추정값 사용함.\n표시 비용은 디버그/비교용이며, 실제 청구액은 Google 계정의 청구 정책/환율/세금에 따라 달라질 수 있음."
      },
      {
        "label": "[고급 지시문]",
        "text": "프롬프트 입력 공간은 프롬프트 관리 메뉴로 모음.\n추출 템플릿, 후보 재정렬 지시문, 응답 교정 지시문을 한 곳에서 수정함.\nAPI 설정은 모델/연결 중심으로 유지함."
      }
    ]
  },
  {
    "title": "로어 관리",
    "sections": [
      {
        "label": "[목록]",
        "text": "로어를 켜고 끄거나 수정/삭제함.\n임베딩 마크는 의미 검색 준비 여부.\n앵커는 자동 갱신에서 보호하는 고정 로어."
      },
      {
        "label": "[파일]",
        "text": "로어팩 가져오기/내보내기용.\n활성화한 로어팩만 대화에 주입됨.\n0개가 된 팩은 정리 대상."
      },
      {
        "label": "[병합]",
        "text": "활성 로어팩 안의 유사한 로어를 통합함.\n키워드 병합은 API 없음.\nLLM 요약 병합은 API 비용 발생."
      },
      {
        "label": "[스냅샷]",
        "text": "자동/수동 추출 전후 백업본.\n추출 결과가 마음에 안 들 때 복구용으로 사용함."
      }
    ]
  },
  {
    "title": "AI 응답 교정",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "AI 답변이 로어와 어긋나거나 상태/호칭/설정이 누락된 경우 교정함.\n수동 검수는 최근 답변만 즉시 확인함."
      },
      {
        "label": "[설정]",
        "text": "자동 반영 ON: 교정 결과를 바로 적용함.\n자동 반영 OFF: 교정 전 확인창 표시함.\n로어 검색 모드는 키워드 또는 의미 검색 중 선택함.\n검수 템플릿은 체크한 항목만 프롬프트에 넣을 수 있음."
      }
    ]
  },
  {
    "title": "실행 로그/세션",
    "sections": [
      {
        "label": "[실행 로그]",
        "text": "주입, 추출, 교정, 모순 기록 확인용.\nAPI 비용도 모델/기능/채팅별로 볼 수 있음.\n비용은 비교용으로 보고, 실제 청구 확인은 Google 결제 내역 기준."
      },
      {
        "label": "[현재 세션 상태]",
        "text": "현재 채팅에서 어떤 로어가 점수를 받았는지, 재주입 쿨다운이 어떻게 걸렸는지 확인/초기화함."
      }
    ]
  }
];

  _w.__LoreInj.registerSubMenu('help', function(modal) {
    modal.createSubMenu('도움말', (m) => {
      m.replaceContentPanel((panel) => {
        const addHelp = (title, sections) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);

            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;';

            const arrow = document.createElement('span');
            arrow.textContent = '▶';
            arrow.style.cssText = 'font-size:11px;color:#888;width:10px;';

            const tt = document.createElement('div');
            tt.textContent = title || '도움말';
            tt.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;flex:1;';

            head.appendChild(arrow);
            head.appendChild(tt);

            const body = document.createElement('div');
            body.style.cssText = 'display:none;padding:10px 2px 4px 2px;border-top:1px dashed #333;margin-top:6px;width:100%;box-sizing:border-box;';

            (sections || []).forEach(s => {
              const lbl = document.createElement('div');
              lbl.textContent = s.label || '내용';
              lbl.style.cssText = 'font-size:11px;color:#888;font-weight:bold;margin-top:10px;margin-bottom:3px;letter-spacing:.5px;';

              const txt = document.createElement('div');
              txt.textContent = s.text || '';
              txt.style.cssText = 'font-size:12px;color:#ccc;line-height:1.75;word-break:keep-all;white-space:pre-line;';

              body.appendChild(lbl);
              body.appendChild(txt);
            });

            head.onclick = () => {
              const open = body.style.display !== 'none';
              body.style.display = open ? 'none' : 'block';
              arrow.textContent = open ? '▶' : '▼';
            };

            nd.appendChild(head);
            nd.appendChild(body);
          }});
        };

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);

          const t = document.createElement('div');
          t.textContent = HELP_QUICK_START.title || '빠른 시작';
          t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:6px;';

          const d = document.createElement('div');
          d.textContent = HELP_QUICK_START.text || '';
          d.style.cssText = 'font-size:12px;color:#ccc;line-height:1.8;word-break:keep-all;white-space:pre-line;';

          nd.appendChild(t);
          nd.appendChild(d);
        }});

        HELP_ITEMS.forEach(item => addHelp(item.title, item.sections || []));
      }, '기능 안내');
    });
  });

  _w.__LoreInj.__subHelpLoaded = true;
})();
