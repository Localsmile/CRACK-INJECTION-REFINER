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
  "text": "[핵심 기능]\n1. 현재 장면에 맞는 로어를 찾아 대화에 자동 삽입함.\n2. 대화를 주기적으로 읽어 로어팩에 기억을 추가함.\n3. 중요한 사건/약속은 별도 장면 기억으로 저장해 나중에 다시 불러옴.\n\n[사용 위치]\n채팅/에피소드 화면에서 로어 도구를 열 수 있음.\n\n[용어]\n로어: 요약본/기억\n의미 검색: 단어가 달라도 비슷한 의미의 로어를 찾는 기능\n변경분만 저장: 바뀐 내용만 받아 저장해 비용과 시간을 줄이는 기능"
};
  const HELP_ITEMS = [
  {
    "title": "홈",
    "sections": [
      {
        "label": "[빠른 설정]",
        "text": "처음 쓰면 기본 추천 권장.\n수동 검색은 의미 검색을 끄고 단어 일치 중심으로 사용함.\n정밀은 후보 재정렬과 응답 교정까지 쓰는 장문 RP용."
      },
      {
        "label": "[자동 삽입/압축]",
        "text": "로어 자동 삽입\n현재 메시지에 관련 로어를 넣음.\n\n로어 자동 추출\n일정 턴마다 대화를 로어로 정리함. 수동 추출에는 영향 없음.\n\n적응형 로어 압축\n삽입 공간이 부족하면 로어 길이를 자동으로 줄임.\n자동: 남은 공간에 맞춤\n길게: 자세히 넣음\n짧게: 핵심만 넣음\n아주 짧게: 최소 정보만 넣음"
      },
      {
        "label": "[검색 & 감지]",
        "text": "의미로 찾기\n단어가 달라도 관련 로어 찾음. API/검색 준비 필요.\n\n의미 검색 모델\n모델을 바꾸면 기존 로어 검색 준비 재실행 권장.\n\n추출 후 검색 준비\n새 로어를 의미 검색용으로 자동 준비함.\n\n오래된 정보도 가끔 넣기\n직접 관련이 약해도 중요한 과거 정보를 주기적으로 넣음.\n\nAI로 후보 다시 고르기\n검색 후보를 현재 장면 기준으로 다시 정렬함. 정확도는 오르지만 지연/API 비용 증가."
      },
      {
        "label": "[주입 제어]",
        "text": "주입 위치\n사용자 메시지 앞/뒤 중 로어를 넣을 위치를 정함.\n\n삽입 쿨타임\n같은 로어가 너무 자주 들어가지 않게 막음.\n\n한 번에 넣을 로어\n한 턴에 주입할 후보 수를 정함.\n\n삽입 흔적 자동 정리\n설정한 턴이 지난 뒤 이전 사용자 메시지에서 로어 참조문을 걷어냄.\n\n재주입 판단\n최근 대화 길이를 바탕으로 플랫폼이 이미 기억할 가능성이 높은 턴 수를 추정함. 최근 문맥 추정값은 플랫폼 변경에 맞춰 조절할 수 있음."
      },
      {
        "label": "[추가 정보/출력]",
        "text": "관계 표현\n캐릭터 사이의 기본 말투와 태도, 상황별 호칭을 함께 전달함. 하나의 호칭을 항상 강제하지 않음.\n\n첫 만남/재회 관리\n처음 만나는지, 오랜만에 다시 만나는지 자동 전달함.\n\n출력 포맷\n로어를 어떤 접두사/접미사로 감쌀지 정함."
      }
    ]
  },
  {
    "title": "로어 추출/변환",
    "sections": [
      {
        "label": "[자동/수동 추출]",
        "text": "자동 추출\n정해진 턴마다 자동 추출 전용 범위와 항목으로 로어를 저장함.\n\n수동 추출\n버튼을 누를 때 수동 추출 전용 범위와 항목으로 로어를 저장함.\n\n기억할 대사\n나중에 다시 인용될 가능성이 뚜렷한 핵심 대사만 저장하며, 해당 대사가 없으면 만들지 않음.\n\n저장할 로어팩\n현재 채팅에서 추출한 내용이 들어갈 로어팩 이름."
      },
      {
        "label": "[변경분만 저장]",
        "text": "ON: 바뀐 부분만 받아 기존 로어에 반영함. 변화 없으면 저장을 건너뜀.\nOFF: 갱신된 전체 로어를 받아 병합함.\n\n보통 ON이 더 빠르고 비용이 적게 듦."
      },
      {
        "label": "[중요 장면 기억하기]",
        "text": "일반 추출도 뚜렷한 중요 장면을 함께 저장할 수 있음.\n정밀 분석을 켜면 일반 추출 후 중요 장면만 별도 API 호출로 한 번 더 확인함.\n자동, 수동, 전체 대화 추출에서 각각 사용할지 정할 수 있음. 추가 호출만큼 시간과 생성 API 사용량이 늘어남."
      },
      {
        "label": "[과거 장면 불러오기 판단]",
        "text": "저장된 중요 장면 중 지금 대화에 맞는 것을 고름.\n이 화면에서는 ON/OFF, 제한 시간, 검토할 장면 수만 조절함.\n모델과 생각 깊이는 API 설정에서 관리함."
      },
      {
        "label": "[전체 대화 추출]",
        "text": "이미 긴 채팅에서 로어를 처음 만들 때 쓰는 기능.\n대화를 여러 구간으로 나눠 추출함. 성공한 구간은 저장하고 실패한 구간 번호는 이 화면에 남김.\n한 번에 읽을 턴: 한 구간에 넣을 대화량\n겹쳐 읽을 턴: 흐름이 끊기지 않게 앞뒤로 겹쳐 읽는 양\n재시도: 한 번의 실행에서 같은 구간을 다시 호출할 횟수\n실패 구간만 다시 시도: 성공한 구간을 건드리지 않고 남은 구간만 실행함."
      },
      {
        "label": "[지식 변환]",
        "text": "URL/텍스트를 로어팩으로 변환함.\nAPI 설정의 로어 추출/변환 모델을 사용함.\n생성된 로어팩은 자동 활성화함."
      }
    ]
  },
  {
    "title": "API 설정",
    "sections": [
      {
        "label": "[API 연결]",
        "text": "지원 방식은 5종.\nGemini API Key: 가장 단순함. 처음 설정 권장.\nFirebase: Firebase 설정 스크립트로 생성하고, 의미 검색은 별도 AI Studio Gemini API 키를 사용함.\nVertex JSON: 서비스 계정 JSON으로 생성함. 의미 검색용 Gemini API 키를 입력하면 의미 검색은 해당 키를 우선 사용함.\nDeepSeek: V4 Flash/Pro 생성 호출에 사용함. 의미 검색은 별도 Gemini API 키를 사용함.\nOpenAI 호환: URL, API 키, 모델명을 직접 입력함. 의미 검색은 별도 Gemini API 키를 사용함."
      },
      {
        "label": "[모델 선택]",
        "text": "API를 쓰는 모델 선택은 여기서 관리함.\n\n로어 추출/변환 모델\n자동 추출, 수동 추출, 지식 변환, 중요 장면 추출에 사용함.\n\n후보 재정렬 모델\n검색된 로어 후보를 다시 고를 때 사용함.\n\n과거 장면 판단 모델\n저장된 중요 장면 중 지금 대화에 맞는 것을 고름.\n\n응답 교정 모델\nAI 응답을 검수/수정할 때 사용함."
      },
      {
        "label": "[기능별 추론]",
        "text": "접이식 설정에서 기능마다 생각 깊이를 따로 조절함.\nGemini는 모델별 지원값에 맞춰 적용하고, 맞지 않는 모델에는 보내지 않음.\nDeepSeek는 기능별로 끄기/High/Max를 지정할 수 있음.\nOpenAI 호환은 기본값에서 추론 파라미터를 보내지 않음. 설정을 켠 경우 서버가 거부하면 자동으로 빼고 재시도함."
      },
      {
        "label": "[비용 표시]",
        "text": "API 응답에 사용량 정보가 있으면 실제 토큰 기준으로 계산함.\nGemini는 usageMetadata, DeepSeek/OpenAI 호환은 usage 필드 기준.\nDeepSeek 캐시 hit/miss 토큰이 있으면 분리 계산함.\n없으면 글자 수 기반 추정값 사용함.\n표시 비용은 참고용이며 실제 청구액은 제공사 청구 정책/환율/세금에 따라 달라질 수 있음."
      },
      {
        "label": "[고급 프롬프트]",
        "text": "프롬프트 입력 공간은 API 설정 > 프롬프트에 모음.\n공통 로어 추출 템플릿, 장면/변환/판단 프롬프트, 후보 재정렬, 응답 교정 프롬프트를 수정함.\n추출 항목 선택은 실행 때 프롬프트와 스키마 뒤에 적용되므로 사용자 템플릿에서도 같은 항목 설정을 사용함.\nDeepSeek 전용 프롬프트는 필요할 때만 별도로 켤 수 있음."
      }
    ]
  },
  {
    "title": "로어 관리",
    "sections": [
      {
        "label": "[목록]",
        "text": "로어를 켜고 끄거나 수정/삭제함.\n검색 준비 표시는 의미 검색에 바로 쓸 수 있는지 보여줌.\n앵커는 자동 갱신에서 보호하는 고정 로어."
      },
      {
        "label": "[로어팩 관리]",
        "text": "전체 로어팩을 켜고 끄거나 이름 변경, 내보내기, 검색 준비, 삭제함.\n로어팩을 펼치면 각 로어의 전체 내용을 확인하고 JSON으로 수정할 수 있음.\n활성화한 로어팩만 현재 채팅에 주입되며, 개별 로어팩 JSON 가져오기는 백업 화면에서 실행함."
      },
      {
        "label": "[백업/동기화]",
        "text": "현재 데이터를 파일에 저장하면 로어, 로어팩, 설정, 검색 준비와 채팅별 상태를 JSON으로 내려받음.\n파일 내용을 현재 데이터에 추가하면 기존 로어를 유지하고 이름 충돌과 설정 처리 방식을 직접 고름. 파일 기준으로 전체 복원하면 현재 로컬 로어 DB를 비우고 파일 내용으로 다시 구성함.\n현재 데이터를 서버에 백업하면 검색 준비, 이력, 스냅샷, 로그와 API 키를 제외한 압축 백업을 새로 추가함. 선택 서버 백업은 현재 데이터에 추가하거나 전체 복원할 수 있고, 복원된 팩은 검색 준비를 다시 실행함."
      },
      {
        "label": "[병합]",
        "text": "활성 로어팩에서 합칠 로어를 직접 선택하고 AI로 하나의 로어로 병합함.\n유사도 임계값은 검색 준비된 로어 중 후보를 좁힐 때만 선택적으로 사용함.\n병합과 되돌리기 후 검색 준비는 자동으로 갱신함."
      },
      {
        "label": "[스냅샷]",
        "text": "자동/수동 추출 전후 백업본.\n펼쳐서 로어 이름, 유형, 상태, 요약, 호출 단서와 원본 JSON을 확인할 수 있음.\n추출 결과가 마음에 안 들 때 복구용으로 사용함."
      }
    ]
  },
  {
    "title": "응답 교정",
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
    "title": "활동",
    "sections": [
      {
        "label": "[실행 로그]",
        "text": "주입, 추출, 응답 교정, 모순 기록 확인용.\nAPI 비용도 모델/기능/채팅별로 볼 수 있음.\n비용은 비교용으로 보고, 실제 청구액은 사용 중인 API 제공사의 결제 내역에서 확인함."
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
