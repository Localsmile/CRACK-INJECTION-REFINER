// injecter-6-sub-help.js: 도움말
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subHelpLoaded) return;

  const { C } = _w.__LoreInj;
  const TONE = {
    muted: 'var(--li-muted,#748196)',
    soft: 'var(--li-text-soft,#a9b6c7)',
    text: 'var(--li-text,#e7edf5)',
    ok: '#78d5a8'
  };
  const HELP_QUICK_START = {
  "title": "기능 안내",
  "text": "[핵심 기능]\n1. 현재 장면에 맞는 로어를 찾아 대화에 자동 삽입함.\n2. 대화를 주기적으로 정리해 로어팩을 갱신함.\n3. 중요한 사건과 약속을 별도 장면 기억으로 저장해 필요할 때 다시 참고함.\n\n[기본 용어]\n로어: 대화에 넣을 요약 기억\n의미 검색: 단어가 달라도 의미가 가까운 로어를 찾는 기능\n변경분만 저장: 기존 로어 전체 대신 바뀐 부분만 받아 출력 토큰을 줄이는 기능"
};
  const HELP_ITEMS = [
  {
    "title": "로어 설정",
    "sections": [
      {
        "label": "[빠른 설정]",
        "text": "처음 쓰면 기본 추천 권장.\n수동 검색은 API 호출 최소화용.\n정밀은 다음 턴 후보 준비/응답 교정까지 쓰는 장문 RP용."
      },
      {
        "label": "[인젝션/압축]",
        "text": "로어 인젝션 활성화\n대화에 로어 자동 삽입함. 보통 ON 권장.\n\n적응형 로어 압축\n삽입 공간이 부족하면 로어 길이를 자동으로 줄임.\n자동: 남은 공간에 맞춤\n길게: 자세히 넣음\n짧게: 핵심만 넣음\n아주 짧게: 최소 정보만 넣음"
      },
      {
        "label": "[검색 & 감지]",
        "text": "의미로 찾기\n단어가 달라도 관련 로어 찾음. API/검색 준비 필요.\n\n의미 검색 모델\n모델을 바꾸면 기존 로어 검색 준비 재실행 권장.\n\n추출 후 검색 준비\n새 로어를 의미 검색용으로 자동 준비함.\n\n오래된 정보도 가끔 넣기\n직접 관련이 약해도 중요한 과거 정보를 주기적으로 넣음.\n\n다음 턴 후보 준비\n현재 대화를 보고 다음 삽입에 쓸 후보 순서를 백그라운드로 준비함. 현재 전송은 기다리지 않음."
      },
      {
        "label": "[추가 정보/출력]",
        "text": "호칭 정보\n캐릭터 간 호칭 정보 함께 전달함.\n\n첫 만남/재회 관리\n처음 만나는지, 오랜만에 다시 만나는지 자동 전달함.\n\n출력 포맷\n로어를 어떤 접두사/접미사로 감쌀지 정함."
      }
    ]
  },
  {
    "title": "기억 설정과 추출 실행",
    "sections": [
      {
        "label": "[기억 설정]",
        "text": "자동 대화 정리, 변경분만 저장, 기존 로어 참고, 중요 장면 기억, 추출 후 임베딩은 기억 설정에서 관리함.\n고급 설정을 열면 읽을 최근 대화, 최근 제외, 중요 장면 최대 개수를 조절할 수 있음."
      },
      {
        "label": "[변경분만 저장]",
        "text": "ON/OFF 모두 같은 대화와 기존 로어 요약을 입력으로 보냄.\nON: 변경된 부분만 받아 기존 로어에 반영함. 변화 없으면 저장/검색 준비를 건너뜀.\nOFF: 갱신된 전체 로어를 받아 병합함.\n입력 토큰은 거의 같고 출력 토큰만 줄이는 구조."
      },
      {
        "label": "[중요 장면 기억하기]",
        "text": "일반 로어 추출과 같은 API 호출에서 함께 처리함.\n사건, 약속, 관계 변화처럼 나중에 다시 참고할 장면을 별도 장면 기억으로 저장함.\n변경분만 저장 ON이면 중요 장면도 바뀐 부분만 받아 반영함."
      },
      {
        "label": "[삽입 설정]",
        "text": "삽입 위치, 삽입 문자 수, 장면 상태 문자 수, 삽입 흔적 자동 정리, 쿨타임은 삽입 설정/검색 설정에서 관리함."
      },
      {
        "label": "[추출 실행]",
        "text": "수동 추출과 전체 로그 일괄 추출처럼 API를 직접 실행하는 작업만 추출 화면에서 처리함.\n저장할 로어팩은 실행 화면에서 선택함.\nURL/텍스트 변환은 별도 지식 변환 화면에서 처리함."
      },
      {
        "label": "[전체 로그 일괄 추출]",
        "text": "이미 긴 채팅을 처음 정리할 때 쓰는 기능.\n대화를 배치로 나눠 여러 번 요약함.\n배치 크기: 한 번에 읽을 턴 수\n오버랩: 흐름 끊김 방지용 중복 턴 수\n재시도: API 실패 시 다시 시도할 횟수"
      },
      {
        "label": "[지식 변환]",
        "text": "URL/텍스트를 로어팩으로 변환함.\nAPI 설정의 추출/정리용 모델 사용함.\n생성된 로어팩은 자동 활성화함.\n긴 원문은 청크로 나눠 처리하며 실패 시 추출 로그에서 확인함."
      }
    ]
  },
  {
    "title": "API 설정",
    "sections": [
      {
        "label": "[API 연결]",
        "text": "지원 방식은 4종.\nGemini API Key: 가장 단순함. 처음 설정 권장.\nFirebase: Firebase 설정 스크립트 사용함. 의미 검색 준비는 별도 Gemini API Key 필요. Google AI Studio에서 무료 키 발급 가능.\nVertex JSON: 서비스 계정 JSON 사용함.\nDeepSeek: V4 Flash/Pro 생성 호출에 사용함. 의미 검색/임베딩은 DeepSeek가 아니라 별도 Gemini API 키 사용함."
      },
      {
        "label": "[모델 선택]",
        "text": "API를 쓰는 모델 선택은 여기서 관리함.\n\n추출/정리용 모델\n자동 추출, 수동 추출, 지식 변환에 사용함. 중요 장면 기억은 자동/수동/전체 추출 결과 안에서 함께 저장함.\n\n후보 준비 모델\n다음 삽입에 쓸 로어 후보 순서를 준비할 때 사용함.\n\n과거 장면 판단 모델\n저장된 중요 장면 중 지금 대화에 맞는 것을 고를 때 사용함.\n\n응답 교정 모델\nAI 응답을 검수/수정할 때 사용함."
      },
      {
        "label": "[비용 표시]",
        "text": "API 응답에 사용량 정보가 있을 때만 토큰 기준으로 계산함.\nGemini는 usageMetadata, DeepSeek는 usage 필드 기준.\nDeepSeek 캐시 hit/miss 토큰이 있으면 분리 계산함.\n사용량 정보가 없는 호출은 호출수만 기록하고 USD 합산에서 제외함.\n표시 비용은 제공사 응답 사용량 기준이며 환율/세금/제공사 정책에 따른 최종 청구액은 결제 내역을 기준으로 확인."
      },
      {
        "label": "[고급 지시문]",
        "text": "프롬프트 화면에서 추출 템플릿, 후보 준비 지시문, 응답 교정 지시문을 수정함.\nAPI 화면은 연결 정보와 모델 선택만 관리함."
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
        "text": "개별 로어팩 JSON 가져오기/내보내기용.\n활성화한 로어팩만 대화에 주입됨.\n0개가 된 팩은 정리 대상."
      },
      {
        "label": "[백업/동기화]",
        "text": "전체 설정, 로어팩, 로어, 검색 준비, 채팅별 상태를 파일이나 서버로 저장/복원함.\n서버 동기화는 수동 실행만 지원함.\n서버 백업은 ID당 10개까지 보관하고, 1년 지난 백업은 자동 삭제 대상."
      },
      {
        "label": "[병합]",
        "text": "활성 로어팩 안의 유사한 로어를 통합함.\n가장 긴 항목 유지는 API 없음.\nLLM 요약 병합은 API 비용 발생.\n후보를 찾은 뒤 모든 후보를 한 번에 병합할 수 있음."
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
        "text": "주입, 추출, 교정, 모순 기록을 확인함.\nAPI 비용은 모델/기능/로어팩별로 볼 수 있음.\n실제 청구액은 API 제공사 결제 내역을 기준으로 확인."
      },
      {
        "label": "[현재 세션 상태]",
        "text": "현재 채팅에서 어떤 로어가 점수를 받았는지, 재주입 쿨다운이 어떻게 걸렸는지 확인/초기화함."
      }
    ]
  }
];

  _w.__LoreInj.registerSettingsPage('help', '도움말', (m) => {
      m.replaceContentPanel((panel) => {
        const addHelp = (title, sections) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);

            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:9px;cursor:pointer;padding:4px 0;';

            const arrow = document.createElement('span');
            arrow.textContent = '▸';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.style.cssText = 'font-size:13px;color:' + TONE.muted + ';width:16px;text-align:center;line-height:1;';

            const tt = document.createElement('div');
            tt.textContent = title || '도움말';
            tt.style.cssText = 'font-size:13px;color:' + TONE.text + ';font-weight:900;flex:1;';

            head.appendChild(arrow);
            head.appendChild(tt);

            const body = document.createElement('div');
            body.style.cssText = 'display:none;padding:10px 2px 4px 38px;border-top:1px dashed var(--li-line,#2f3b4f);margin-top:8px;width:100%;box-sizing:border-box;';

            (sections || []).forEach(s => {
              const lbl = document.createElement('div');
              lbl.textContent = s.label || '내용';
              lbl.style.cssText = 'font-size:11px;color:' + TONE.ok + ';font-weight:900;margin-top:10px;margin-bottom:3px;letter-spacing:0;';

              const txt = document.createElement('div');
              txt.textContent = s.text || '';
              txt.style.cssText = 'font-size:12px;color:' + TONE.soft + ';line-height:1.75;word-break:keep-all;white-space:pre-line;';

              body.appendChild(lbl);
              body.appendChild(txt);
            });

            head.onclick = () => {
              const open = body.style.display !== 'none';
              body.style.display = open ? 'none' : 'block';
              arrow.textContent = open ? '▸' : '▾';
            };

            nd.appendChild(head);
            nd.appendChild(body);
          }});
        };

        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);

          const t = document.createElement('div');
          t.textContent = HELP_QUICK_START.title || '빠른 시작';
          t.style.cssText = 'font-size:15px;color:' + TONE.text + ';font-weight:900;margin-bottom:6px;';

          const d = document.createElement('div');
          d.textContent = HELP_QUICK_START.text || '';
          d.style.cssText = 'font-size:12px;color:' + TONE.soft + ';line-height:1.8;word-break:keep-all;white-space:pre-line;';

          nd.appendChild(t);
          nd.appendChild(d);
        }});

        HELP_ITEMS.forEach(item => addHelp(item.title, item.sections || []));
      }, '기능 안내');
  });

  _w.__LoreInj.__subHelpLoaded = true;
})();
