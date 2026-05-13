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
  "text": "[핵심 기능]\n1.임베딩 + 키워드 시스템을 동시사용, 스코어링 시스템을 통해서 주입될 기억을 추려냄\n2.[new]시간축 요약본이 추가되어 특정 구간의 사건을 집중적으로 요약/주입함\n\n[용어 설명]\n로어)요약본/기억\n임베딩)요약본/기억을 좌표화 시켜서 유사한 의미도 유추하게함"
};
  const HELP_ITEMS = [
  {
    "title": "로어 설정",
    "sections": [
      {
        "label": "[빠른 설정]",
        "text": "빠르게 설정하라고 만듬\n기본 추천만으로 충분하지만, AI 응답 교정을 원하는 경우에는 별도로 ON시켜야함"
      },
      {
        "label": "[로어 인젝션 활성화/적응형 로어 압축]",
        "text": "[로어 인젝션 활성화]\n로어 인젝션 ON/OFF 스위치 (권장: ON)\n\n[적응형 로어 압축]\n유저 입력 2천자 내로 삽입하기 위해 요약본의 축약 레벨을 지정 가능\n\n자동/권장)중요도를 기준으로 각 로어마다 축약레벨을 다르게해서 주입\n전체)무조건 축약이 거의 안된 요약본 사용\n요약)축약을 한 요약본 사용\n최소)극단적으로 축약된 요약본 사용 "
      },
      {
        "label": "[검색 & 감지]",
        "text": "[임베딩 검색]\n임베딩 사용 유무\n\n[임베딩 모델]\n기본적으로 embedding-001 모델 쓰면 됨\n\n[자동 임베딩 생성]\n로어 추출/생성 시에 자동으로 임베딩도 같이 만듬\n\n[시간 감쇠]\n현재 맥락과 상관이 없더라도 과거 기억을 지속적으로 남는 공간에 집어넣음\n\n[LLM 재정렬]\n현재 주입 가능성이 높은 8개의 로어를 재평가하여 좀 더 정확한 로어를 주입함\nON - 로어 주입 정확도 증가, 채팅 딜레이 대폭 증가\nOFF - 로어 주입 정확도 감소, 채팅 딜레이 증가 없음"
      },
      {
        "label": "[주입 위치]",
        "text": "로어가 주입될 때, 유저 입력 앞에 들어갈지, 뒤에 들어갈지 선택함"
      },
      {
        "label": "[출력 포맷]",
        "text": "로어가 주입될 때 접두사/접미사를 무엇으로 할 것인가"
      }
    ]
  },
  {
    "title": "로어 관리(목록)",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "추출된 로어에서 일부 요약본을 비활성화 시킬 수 있음"
      },
      {
        "label": "[추가 기능]",
        "text": "임베딩 마크\n해당 요약본이 임베딩이 된 경우에 표기됨\n\n임베딩 버튼\n수동으로 임베딩함\n\n복사\n해당 요약본을 복사\n\n이력\n해당 요약본의 과거 버전으로 되돌릴 수 있음\n\n앵커\n앵커 활성화시 해당 요약본을 갱신하지않고 계속 동일한 텍스트를 유지함\n\n수정\n편집창 활성화\n\n삭제\n해당 기억 삭제"
      }
    ]
  },
  {
    "title": "로어 병합(중복 정리)",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "현재 활성화된 로어팩에서 유사한 요약본 내용이 있을 경우에 내용을 통폐합 시킴\n\n아직 로직 자체가 완벽하지 않으므로, 로어팩에서 요약본을 줄이고 싶을 때 사용을 권장"
      },
      {
        "label": "[기능 설명]",
        "text": "유사도 임계값\n얼마나 유사한 의미를 가졌는지 임베딩을 기준으로 판단함\n\n최대 글자수\n통폐합 시에 글자수 최대치를 제한시킴\n\n가장 긴 항목 유지 + 키워드 합집합\nAPI를 쓰지않고, 키워드를 기준으로 로어를 병합함\n\nLLM 요약 병합\nGemini로 요약본을 통폐합 시킴"
      }
    ]
  },
  {
    "title": "로어 스냅샷 (백업)",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "자동 추출/수동 추출된 로어팩의 백업본\n현재 추출된 게 마음에 안 드는 경우에 백업용으로 사용"
      }
    ]
  },
  {
    "title": "로어 관리 (파일)",
    "sections": [
      {
        "label": "로어 가져오기",
        "text": "백업해둔 로어(json)을 가져오면 다른 곳에서 플레이한 요약본도 가져올 수 있음"
      },
      {
        "label": "토글 버튼",
        "text": "지금까지 해당 기기에서 추출한 요약본들을 ON/OFF 시킴\n\n주입되길 원하는 로어팩을 여기서 활성화 시켜야함\n\n솔직히 위치가 이상한 건 알고 있음.."
      }
    ]
  },
  {
    "title": "추출/변환 설정",
    "sections": [
      {
        "label": "[자동 추출]",
        "text": "자동으로 특정 턴마다 대화방의 요약본을 만듬\n\n자동 대화 추출(권장:ON)\nON으로 설정 시 자동으로 요약본을 갱신함\n\n기존 로어 전송(권장:ON)\n기존에 만들어진 로어도 함께 전송하여 갱신함\nOFF시에는 중복되는 요약본이 생길 수 있음\n\n페르소나 정보 전송\n현재 설정된 페르소나 프롬프트도 함께 요약본과 보냄\n\n시간축 이벤트 추출(권장:ON)\n특정 시간/사건을 집중적으로 요약한 요약본을 생성\n\n===\n여기서 1턴은 유저입력 + AI 출력을 한 세트로 봄\n\n주기\nn턴마다 자동 추출함\n\n범위(턴)\n몇 턴 분량의 채팅을 가져올 것인가?\n너무 많이 가져오는 건 추천하지 않음. 어차피 이전 요약본 만들 때 이전 대화를 전부 분석한 상태\n\n오프셋\n최근 n턴을 스킵하고 범위에서 설정한 채팅만큼 가져옴\n크랙의 AI가 최근 대화는 어느정도 기억하기에 굳이 요약을 할 이유가 없기 때문\n예: 범위5, 오프셋3 -> 최근 3턴의 대화를 건너뛰고 4~8턴 전 대화부터 요약함\n\n저장될 로어명\n로어팩 이름 설정\n\n\n\n"
      },
      {
        "label": "[수동 추출]",
        "text": "자동 추출에서 설정한 값을 기준으로 수동 추출함"
      },
      {
        "label": "[시간축 회상 판정 (Judge AI)]",
        "text": "시간축 요약본이 있는 경우, 해당 요약본이 현재 맥락과 일치하는 경우에 최우선적으로 넣을 수 있도록 AI가 판단함\n\n말 그대로 맥락만 빠르게 판단하는 목적이기에 좋은 AI모델이 필요한 건 아님 (빠른 응답을 위해서 기본 설정은 3.1 flash lite 사용)\n또한 AI가 유저가 입력하고 엔터칠 때마다 호출되는지라 API비용이 좀 더 높아짐\n\n단, 출력 토큰을 진짜 극한으로 낮춰서 입력 토큰 비용만 높고, 응답도 빠른 편\n\n\n후보 수\n시간축 요약본을 몇 개까지 판정에 올릴지 정함"
      },
      {
        "label": "[전체 로그 일괄 추출]",
        "text": "수동 추출을 쪼개서 추출하는 방식.\n기본에 플레이하던 채팅이 턴수가 많은 경우엔 해당 방식을 쓰는 게 좋음\n\n배치 크기(턴)\nn턴 단위로 쪼갬 (예: 100턴 플레이 채팅, 20턴 설정 -> 20턴씩 나눠서 5번 요약함)\n\n오버랩(턴)\n나눠서 요약본을 만드는 경우엔 중복되거나 흐름이 끊기는 요약본이 나올 수 있음\n그래서 일부 턴을 중복시켜서 요약본을 만듬\n\n예: 배치크기 20턴, 오버랩 5턴, 총 대화턴수 40 -> 0~20턴 요약, 15~35턴 요약, 35~40턴 요약\n\n재시도\n잦은 API호출 혹은 서버 문제로 인해서 실패하는 경우에 재시도하는 횟수"
      }
    ]
  },
  {
    "title": "AI 응답 교정 (Refiner)",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "AI의 최근 대화에서 요약본과 일치하지 않거나, 단어가 누락되거나, 상태창이 누락되는 등의 문제를 교정함\n\n현재 버그: 새로고침 안하면 교정본이 제대로 안보이는 버그"
      },
      {
        "label": "[수동 검수]",
        "text": "가장 최근 대화를 수동으로 교정"
      },
      {
        "label": "[설정]",
        "text": "응답 교정 켜기\nAI 응답 교정 ON/OFF\n\n자동 반영 (팝업 없음)\nOFF - 문제가 있는 경우 어떤 내용이 문제인지 알려주고 교정할지 물어봄\nON - 그냥 무조건 뒤에서 교정시켜버림\n\n로어 검색 모드 (권장:임베딩)\n키워드 매칭만) 요약본의 키워드와 일치하는 요약본을 교정 참고용으로 사용\n임베딩(의미 검색)) 요약본의 임베딩+키워드 스코어링에 근거로하여 특정 요약본을 교정 참고용으로 사용\n\n검수 템플릿 선택 (권장: 체크박스)\n이건 설정 창 보는 게 더 빠름.."
      }
    ]
  },
  {
    "title": "실행 로그",
    "sections": [
      {
        "label": "핵심 기능",
        "text": "해당 확프가 동작한 로그를 출력함\n\n주입 기록\n어떤 로어가 주입되었는가?\n\n추출 기록\n어떤 로어가 추출되었는가?\n\n교정 기록\n어떤 이유로 교정되었고, 그것이 승인되었는가?\n\n모순 기록\n교정 기록과 동일하지만, 모순이 이유인 경우 해당 기록에 들어감"
      }
    ]
  },
  {
    "title": "현재 세션 상태",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "매 턴마다 로어가 삽입되고, 내부적으로 점수나 재주입 쿨다운을 관리하는데, 해당 점수와 쿨다운을 상태를 확인하거나 초기화 시킬 때 사용함"
      }
    ]
  },
  {
    "title": "API 설정",
    "sections": [
      {
        "label": "[핵심 기능]",
        "text": "API 및 사용 모델, 추론 레벨을 설정함"
      },
      {
        "label": "[API KEY]",
        "text": "Google AI Studio에서 발급하는 API키\n발급이 매우 쉬움\n\n참고로 VERTEX API키도 호환됨\nAI모델 응답 속도가 제일 느린 게 단점 (구글의 꼼수)\n\n주의: 쌀먹용 계정으로 유료API로 발급받으면 크레딧 차감 안됨"
      },
      {
        "label": "[Vertex AI (JSON)]",
        "text": "Vertex에서 발급한 JSON형태의 원본 API키 방식을 사용함\n발급 방식이 조금 어렵지만, 응답이 좀 더 빠른 편"
      },
      {
        "label": "[Firebase]",
        "text": "캐즘/이그나이터에서 사용하는 API키 방식과 동일함\n\n임베딩용 API키는 Google AI Studio에서 무료API키 하나를 발급 받아서 넣으면 됨\n*굳이 유료 쓸 이유가 없음. 무료API도 제한량 엄청나게 높고, 응답 빠름"
      },
      {
        "label": "[모델에 대하여]",
        "text": "기본 LLM 모델\n기본값: 3.0 flash\n퀄리티 우선: 3.1 PRO\n\n재정렬(Reranker) 프롬프트\n모르면 냅두자\n\n교정(Refiner) 모델\n교정에 사용할 모델. 3.1 PRO써도 좋지만, API비용이 많이 들 수 있으므로 주의\n\n추론(Reasoning) 레벨\n모델 추론 레벨 설정. 추론이 높다고 반드시 좋은 건 아님\nBudget은 추론 토큰수를 직접 지정하는건대, 2.x버전 Gemini만 해당 방식 사용"
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
