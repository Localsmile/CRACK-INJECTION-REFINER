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
    "title": "홈/주입 설정",
    "sections": [
      {
        "label": "[빠른 설정]",
        "text": "처음 쓰면 기본 추천 권장.\n수동 검색은 API 호출 최소화용.\n정밀은 후보 재정렬/응답 교정까지 쓰는 장문 RP용."
      },
      {
        "label": "[인젝션/압축]",
        "text": "로어 자동 삽입\n현재 메시지에 관련 로어를 넣음.\n\n로어 자동 추출\n일정 턴마다 대화를 로어로 정리함. 수동 추출에는 영향 없음.\n\n적응형 로어 압축\n삽입 공간이 부족하면 로어 길이를 자동으로 줄임.\n자동: 남은 공간에 맞춤\n길게: 자세히 넣음\n짧게: 핵심만 넣음\n아주 짧게: 최소 정보만 넣음"
      },
      {
        "label": "[검색 & 감지]",
        "text": "의미로 찾기\n단어가 달라도 관련 로어 찾음. API/검색 준비 필요.\n\n의미 검색 모델\n모델을 바꾸면 기존 로어 검색 준비 재실행 권장.\n\n추출 후 검색 준비\n새 로어를 의미 검색용으로 자동 준비함.\n\n오래된 정보도 가끔 넣기\n직접 관련이 약해도 중요한 과거 정보를 주기적으로 넣음.\n\nAI로 후보 다시 고르기\n검색 후보를 현재 장면 기준으로 다시 정렬함. 정확도는 오르지만 지연/API 비용 증가."
      },
      {
        "label": "[주입 제어]",
        "text": "주입 위치\n사용자 메시지 앞/뒤 중 로어를 넣을 위치를 정함.\n\n삽입 쿨타임\n같은 로어가 너무 자주 들어가지 않게 막음.\n\n한 번에 넣을 로어\n한 턴에 주입할 후보 수를 정함.\n\n삽입 흔적 자동 정리\n설정한 턴이 지난 뒤 이전 사용자 메시지에서 로어 참조문을 걷어냄."
      },
      {
        "label": "[추가 정보/출력]",
        "text": "호칭 정보\n캐릭터 간 호칭 정보 함께 전달함.\n\n첫 만남/재회 관리\n처음 만나는지, 오랜만에 다시 만나는지 자동 전달함.\n\n출력 포맷\n로어를 어떤 접두사/접미사로 감쌀지 정함."
      }
    ]
  },
  {
    "title": "대화 정리/변환",
    "sections": [
      {
        "label": "[자동/수동 추출]",
        "text": "자동 대화 정리\n정해진 턴마다 대화를 읽어 로어팩에 저장함.\n\n수동 정리 실행\n자동 정리 설정값으로 지금 바로 정리함. 기본값에서는 일반 로어와 장면 기억을 함께 저장함.\n\n저장할 로어팩\n현재 채팅에서 정리한 내용이 들어갈 로어팩 이름."
      },
      {
        "label": "[변경분만 저장]",
        "text": "ON: 바뀐 부분만 받아 기존 로어에 반영함. 변화 없으면 저장을 건너뜀.\nOFF: 갱신된 전체 로어를 받아 병합함.\n\n보통 ON이 더 빠르고 비용이 적게 듦."
      },
      {
        "label": "[중요 장면 기억하기]",
        "text": "사건, 약속, 관계 변화처럼 나중에 다시 참고할 장면을 저장함.\n수동 정리에는 기본 포함됨.\n자동 정리나 전체 대화 정리에도 포함할 수 있지만, 시간이 조금 더 걸릴 수 있음."
      },
      {
        "label": "[과거 장면 불러오기 판단]",
        "text": "저장된 중요 장면 중 지금 대화에 맞는 것을 고름.\n이 화면에서는 ON/OFF, 제한 시간, 검토할 장면 수만 조절함.\n모델과 생각 깊이는 API 설정에서 관리함."
      },
      {
        "label": "[전체 대화 정리]",
        "text": "이미 긴 채팅을 처음 정리할 때 쓰는 기능.\n대화를 여러 구간으로 나눠 정리함.\n한 번에 읽을 턴: 한 구간에 넣을 대화량\n겹쳐 읽을 턴: 흐름이 끊기지 않게 앞뒤로 겹쳐 읽는 양\n재시도: 실패한 구간을 다시 시도할 횟수"
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
        "text": "지원 방식은 5종.\nGemini API Key: 가장 단순함. 처음 설정 권장.\nFirebase: Firebase 설정 스크립트 사용함. 의미 검색 준비는 별도 Gemini API 키 사용함.\nVertex JSON: 서비스 계정 JSON 사용함.\nDeepSeek: V4 Flash/Pro 생성 호출에 사용함.\nOpenAI 호환: Base URL과 API 키를 직접 넣어 chat/completions 호환 서버를 사용함. 모델명은 기능별로 직접 입력함."
      },
      {
        "label": "[모델 선택]",
        "text": "API를 쓰는 모델 선택은 여기서 관리함.\n\n추출/정리용 모델\n자동 추출, 수동 추출, 지식 변환, 중요 장면 추출에 사용함.\n\n후보 재정렬 모델\n검색된 로어 후보를 다시 고를 때 사용함.\n\n과거 장면 판단 모델\n저장된 중요 장면 중 지금 대화에 맞는 것을 고름.\n\n응답 교정 모델\nAI 응답을 검수/수정할 때 사용함."
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
        "label": "[고급 지시문]",
        "text": "프롬프트 입력 공간은 프롬프트 관리 메뉴로 모음.\n공통 로어 추출 템플릿, 장면/변환/판단 프롬프트, 후보 재정렬, 응답 교정 지시문을 수정함.\nDeepSeek 전용 프롬프트는 필요할 때만 별도로 켤 수 있음."
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
        "label": "[파일]",
        "text": "개별 로어팩 JSON 가져오기/내보내기용.\n활성화한 로어팩만 대화에 주입됨.\n0개가 된 팩은 정리 대상."
      },
      {
        "label": "[백업/동기화]",
        "text": "전체 설정, 로어팩, 로어, 검색 준비, 채팅별 상태를 파일이나 서버로 저장/복원함.\n파일 백업은 검색 준비까지 포함할 수 있음.\n서버 백업은 로어/팩/채팅별 활성 상태 중심으로 저장하고, 검색 준비/이력/로그는 제외함. 복원 후 필요한 로어팩만 다시 검색 준비함."
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
