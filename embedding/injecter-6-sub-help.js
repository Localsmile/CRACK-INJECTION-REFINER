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
  "text": "[핵심 기능]\n1. 키워드와 의미 검색을 함께 사용해 지금 장면에 필요한 기억을 고릅니다.\n2. 중요한 장면은 별도로 정리해 나중에 다시 참고할 수 있게 합니다.\n\n[용어 설명]\n로어: 요약본/기억\n의미 검색: 단어가 정확히 같지 않아도 비슷한 의미의 로어를 찾는 기능"
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
        "text": "[로어 인젝션 활성화]\n로어를 대화에 자동으로 넣을지 정합니다. 보통 ON을 권장합니다.\n\n[적응형 로어 압축]\n넣을 공간이 부족할 때 로어 길이를 자동으로 줄입니다.\n\n자동/권장: 중요도와 남은 공간에 맞춰 길이를 자동 조절\n길게: 가능한 자세하게 넣음\n짧게: 핵심만 줄여 넣음\n아주 짧게: 최소 정보만 넣음"
      },
      {
        "label": "[검색 & 감지]",
        "text": "[의미로 찾기]\n단어가 정확히 같지 않아도 관련 로어를 찾습니다.\n\n[의미 검색 모델]\n의미 검색에 사용할 모델입니다. 모델을 바꾸면 기존 로어의 검색 준비를 다시 하는 것이 좋습니다.\n\n[추출 후 검색 준비]\n새로 저장한 로어를 의미 검색에 쓸 수 있게 자동으로 준비합니다.\n\n[오래된 기억 다시 챙기기]\n최근에 언급되지 않았더라도 중요한 로어를 다시 넣을 수 있게 합니다.\n\n[AI로 후보 다시 고르기]\n검색된 후보 중 현재 장면에 더 맞는 로어를 AI가 다시 정렬합니다.\nON - 정확도 상승, 응답 지연과 API 비용 증가\nOFF - 빠르게 동작, 재정렬 없음"
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
        "text": "특정 턴마다 대화를 읽고 로어팩에 요약본을 저장합니다.\n\n자동 대화 정리(권장: ON)\nON이면 주기마다 자동으로 로어를 갱신합니다.\n\n기존 로어 참고(권장: ON)\n이미 저장된 로어를 함께 참고해 중복 저장을 줄입니다.\n\n변경분만 저장(권장: ON)\n기존 로어 전체를 다시 출력하지 않고 바뀐 내용만 받아 출력 토큰을 줄입니다.\n\n페르소나 정보 전송\n현재 페르소나 정보도 함께 보내 추출 정확도를 높입니다.\n\n중요 장면 기억하기(권장: ON)\n나중에 다시 참고할 중요한 사건과 약속을 별도로 정리합니다.\n\n===\n여기서 1턴은 유저 입력 + AI 출력을 한 세트로 봅니다.\n\n자동 정리 주기\n몇 턴마다 자동 정리할지 정합니다.\n\n읽을 최근 대화\n정리할 때 몇 턴 분량을 읽을지 정합니다.\n\n최근 제외\n바로 직전 대화 몇 턴을 건너뛸지 정합니다.\n예: 읽을 최근 대화 5, 최근 제외 3 -> 최근 3턴은 건너뛰고 그 이전 5턴을 정리합니다.\n\n저장할 로어팩\n현재 채팅에서 자동 정리 결과를 저장할 로어팩 이름입니다."
      },
      {
        "label": "[수동 추출]",
        "text": "자동 추출에서 설정한 값을 기준으로 수동 추출함"
      },
      {
        "label": "[과거 장면 불러오기 판단]",
        "text": "중요 장면 기록이 있을 때, 지금 대화에 맞는 장면을 AI가 골라 우선 참고하게 합니다.\n\n맥락만 빠르게 판단하는 목적이라 아주 강한 모델은 필요하지 않습니다. 기본값은 빠른 모델을 사용합니다.\n\n유저가 입력할 때마다 호출될 수 있으므로 API 비용과 지연이 조금 늘어납니다.\n\n검토할 장면 수\nAI에게 후보로 보여줄 과거 장면 개수입니다."
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
        "text": "API 키와 추출/정리, 후보 재정렬, 응답 교정에 사용할 모델을 설정합니다."
      },
      {
        "label": "[API KEY]",
        "text": "Google AI Studio에서 발급하는 API 키를 사용합니다.\n\n가장 단순한 방식이며 처음 설정할 때 권장합니다."
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
        "text": "추출/정리용 모델\n대화를 읽고 로어를 만들 때 사용할 모델입니다. 기본값은 3.0 Flash입니다.\n\n후보 재정렬 지시문\n검색된 로어 후보를 다시 고를 때 쓰는 지시문입니다. 잘 모르면 기본값을 유지하면 됩니다.\n\n응답 교정 모델\nAI 응답을 검수하고 고칠 때 사용할 모델입니다. 강한 모델일수록 비용이 늘 수 있습니다.\n\n생각 깊이\n모델이 답을 만들기 전에 얼마나 많이 생각할지 정합니다. 높다고 항상 좋은 것은 아니며, 보통 기본값이면 충분합니다.\n생각 예산은 일부 모델에서 생각 토큰 수를 직접 지정할 때 사용합니다."
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
