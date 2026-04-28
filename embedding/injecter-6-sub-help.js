// injecter-6-sub-help.js: 도움말
(async function(){
  const _w = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const deadline = Date.now() + 15000;
  while (!(_w.__LoreInj && _w.__LoreInj.__settingsLoaded) && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
  if (_w.__LoreInj.__subHelpLoaded) return;
  
  const { C } = _w.__LoreInj;
  _w.__LoreInj.registerSubMenu = _w.__LoreInj.registerSubMenu || function() {};
  
  _w.__LoreInj.registerSubMenu('help', function(modal) {
    modal.createSubMenu('도움말', (m) => {
      m.replaceContentPanel((panel) => {
        const addHelp = (title, sections) => {
          panel.addBoxedField('', '', { onInit: (nd) => {
            C.setFullWidth(nd);
            const head = document.createElement('div');
            head.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:2px 0;';
            const arrow = document.createElement('span'); arrow.textContent = '▶'; arrow.style.cssText = 'font-size:11px;color:#888;width:10px;';
            const tt = document.createElement('div'); tt.textContent = title; tt.style.cssText = 'font-size:13px;color:#4a9;font-weight:bold;flex:1;';
            head.appendChild(arrow); head.appendChild(tt);
            const body = document.createElement('div'); body.style.cssText = 'display:none;padding:10px 2px 4px 2px;border-top:1px dashed #333;margin-top:6px;width:100%;box-sizing:border-box;';
            sections.forEach(s => {
              const lbl = document.createElement('div'); lbl.textContent = s.label; lbl.style.cssText = 'font-size:11px;color:#888;font-weight:bold;margin-top:10px;margin-bottom:3px;letter-spacing:.5px;';
              const txt = document.createElement('div'); txt.textContent = s.text; txt.style.cssText = 'font-size:12px;color:#ccc;line-height:1.75;word-break:keep-all;';
              body.appendChild(lbl); body.appendChild(txt);
            });
            head.onclick = () => { const open = body.style.display !== 'none'; body.style.display = open ? 'none' : 'block'; arrow.textContent = open ? '▶' : '▼'; };
            nd.appendChild(head); nd.appendChild(body);
          }});
        };
  
        panel.addBoxedField('', '', { onInit: (nd) => {
          C.setFullWidth(nd);
          const t = document.createElement('div'); t.textContent = '빠른 시작';
          t.style.cssText = 'font-size:14px;color:#ccc;font-weight:bold;margin-bottom:6px;';
          const d = document.createElement('div');
          d.innerHTML = '1. API 설정 메뉴에서 Gemini 키 입력함<br>2. 메인 설정 상단 빠른 설정에서 프리셋 고름<br>3. 파일 메뉴에서 로어 팩 가져오거나 대화 추출 실행함<br>4. 필요하면 응답 교정 켜면 됨';
          d.style.cssText = 'font-size:12px;color:#ccc;line-height:1.8;word-break:keep-all;';
          nd.appendChild(t); nd.appendChild(d);
        }});

        addHelp('1.4.0-test 마이그레이션', [
          { label: '기능', text: '8/8 최종 패스부터 기존 로어 DB와 설정을 API 호출 없이 로컬에서 자동 정리함. 문자열 summary는 full/compact/micro 3단 구조로 보강하고, 예전 호칭 정보는 callState로 옮기며, timeline·entities·embedding stale 상태를 정리함.' },
          { label: '알림', text: '오래된 로어 형식이 발견되면 "Old lore format detected and locally migrated. Review recommended." 상태가 저장됨. 세션 상태 관리 메뉴에서 마이그레이션 결과와 stale embedding 삭제 수를 확인할 수 있음.' },
          { label: '주의', text: '마이그레이션은 로컬 DB 구조 보정만 수행하고 임베딩 재생성 API 호출은 하지 않음. 필요한 경우 파일 메뉴에서 팩 임베딩을 수동 생성하면 됨.' }
        ]);
  
        addHelp('로어 주입', [
          { label: '기능', text: '대화에 특정 키워드가 나오면 저장된 설정을 AI 프롬프트에 자동으로 끼워 넣음. AI가 세계관과 인물 정보를 잊지 않게 함.' },
          { label: '예시', text: '로어에 "Alice=사과 싫어함" 항목을 저장해두면 대화에 "사과"가 나올 때 해당 설정이 프롬프트에 포함됨. 주입 위치를 "메시지 앞"으로 두면 유저 메시지 직전에 삽입됨.' },
          { label: '설정', text: '메인 설정 > "로어 인젝션 활성화"로 전체 스위치 켬. 주입 위치(앞/뒤)는 같은 화면에서 고름. 적응형 압축은 분량이 많을 때 full → compact → micro 순으로 자동 축약함. OOC 포맷은 AI에게 "이건 배경지식"이라고 알리는 방식으로, 대부분 기본(OOC) 권장. System 태그·내레이터·최소는 모델 특성에 맞춰 골라 씀.' }
        ]);
  
        addHelp('응답 교정 (Refiner)', [
          { label: '기능', text: 'AI 응답 직후 로어·요약과 모순되는 부분을 찾아 수정안을 만들음. 죽은 캐릭터가 말하거나 설정과 다른 진술이 나오면 다시 씀.' },
          { label: '예시', text: '로어에 "철수=사망"이 있는데 AI가 "철수가 웃으며 말했다"라고 쓰면 해당 문장을 감지해 대체함. 자동 반영을 켜 두면 팝업 없이 즉시 교체됨.' },
          { label: '설정', text: 'AI 응답 교정 메뉴에서 "응답 교정 켜기" 토글. 로어 검색 모드는 "키워드 매칭만"(빠름) 또는 "임베딩"(의미 기반, API 비용 증가) 중 고름. 참조 대화 턴 수는 교정 시 직전 대화 몇 턴을 함께 읽을지 정함(기본 1). 검수 템플릿은 미리 만들어 둔 프롬프트에서 고르거나 직접 작성함. 수동 검수 버튼으로 마지막 AI 응답을 즉시 다시 돌릴 수 있음.' }
        ]);
  
        addHelp('자동 대화 추출', [
          { label: '기능', text: '일정 턴마다 최근 대화를 분석해 새 설정·관계·약속을 로어 DB에 자동 저장함. 직접 입력하지 않아도 대화에서 드러난 정보가 누적됨.' },
          { label: '예시', text: '대화 중 "니아는 20살이야" 같은 문장이 나오면 다음 추출 주기에 "니아" 항목에 나이가 기록됨. 관계 변화나 약속도 함께 정리됨.' },
          { label: '설정', text: '대화 추출 및 변환 메뉴에서 "자동 대화 추출" 켬. 주기(턴)은 몇 턴마다 실행할지 정하는 값으로 짧을수록 반영이 빠르지만 API 호출이 늘어남(기본 8, 정밀 프리셋은 5). 범위(턴)은 한 번 분석할 때 최근 몇 턴을 볼지 정함(기본 6). 오프셋은 최신 몇 턴을 제외하고 볼지 정하는 값으로, 너무 최신 내용은 아직 확정되지 않았을 수 있어 3턴 정도 띄우는 게 안정적임. "기존 로어 전송"을 켜면 중복 생성이 줄고, "페르소나 정보 전송"은 유저 페르소나 이름을 같이 보내 정확도를 올림. "저장될 로어명"은 결과가 담길 팩 이름임. 수동 추출 실행 버튼으로 즉시 1회 돌릴 수 있음.' }
        ]);
  
        addHelp('의미 검색과 재정렬 (Reranker)', [
          { label: '기능', text: '임베딩 검색은 키워드가 정확히 일치하지 않아도 뜻이 비슷한 로어를 찾아냄. 재정렬은 찾은 후보들을 LLM이 현재 장면에 맞게 다시 정렬함.' },
          { label: '예시', text: '"강아지"라고 입력해도 "개" 항목이 검색됨. 결과가 10개라면 재정렬이 현재 씬과 가장 관련 있는 5개를 상위로 올림.' },
          { label: '설정', text: '메인 설정 > 검색 & 감지에서 "임베딩 검색"과 "LLM 재정렬"을 각각 토글. 임베딩 모델은 gemini-embedding-001이 안정적이며, 모델 변경 시 기존 임베딩 재생성 필요함. "자동 임베딩 생성"을 켜면 대화 추출 직후 신규 항목이 자동 벡터화됨. Reranker 모델·프롬프트는 API 설정 메뉴에서 바꿀 수 있음(추천: 3.1 Flash Lite). 기존 팩은 파일 메뉴의 "임베딩" 버튼으로 일괄 생성함.' }
        ]);
  
        addHelp('시간 감쇠·쿨다운·중요도 게이팅', [
          { label: '기능', text: '시간 감쇠는 오래 등장하지 않은 로어의 재주입 우선도를 점차 올려 AI가 잊을 무렵 다시 떠올리게 함. 쿨다운은 같은 항목이 연달아 반복 주입되는 걸 막음. 중요도 게이팅은 중요도+새로움+감정 점수 합이 임계값 미만인 사소한 기록을 걸러냄.' },
          { label: '예시', text: '특정 캐릭터 설정이 10턴 넘게 언급 안 되면 재주입 점수가 올라 다음 주입 후보가 됨. 쿨다운이 8이면 한 번 주입된 로어는 8턴 동안 재주입 안 됨. 임계값이 12면 합계 12 미만 항목은 저장되지 않음.' },
          { label: '설정', text: '메인 설정 > 검색 & 감지 > "시간 감쇠" 토글. 쿨다운 턴 수·중요도 임계값은 프리셋에 포함돼 있음(기본 쿨다운 8·임계값 12, 정밀은 임계값 10으로 더 많이 모음). 현재 쿨다운·재주입 점수는 세션 상태 관리 메뉴에서 확인하고 개별 리셋 가능함.' }
        ]);
  
        addHelp('호칭과 서사 연속성', [
          { label: '기능', text: '호칭 매트릭스는 캐릭터끼리 서로를 어떻게 부르는지(너·씨·오빠 등)를 관계 항목에 기록해 AI에게 전달함. 서사 연속성은 처음 만난 사이인지 이미 아는 사이인지를 구분해 "처음 뵙겠습니다" 같은 엉뚱한 대사를 줄임.' },
          { label: '예시', text: 'A→B는 "자기", B→A는 "오빠"로 저장돼 있으면 AI가 일관되게 그 호칭을 씀. 이미 만난 캐릭터가 재등장하면 자동으로 재회 태그가 붙음.' },
          { label: '설정', text: '메인 설정 > 추가 정보 주입에서 두 토글 모두 기본 켜짐. 호칭은 자동 추출이 대화에서 탐지한 것을 로어 항목에 기록함 — 필요 시 로어 관리에서 직접 수정함.' }
        ]);
  
        addHelp('파일과 스냅샷', [
          { label: '기능', text: 'JSON 팩을 가져오거나 내보내 다른 유저와 공유함. 스냅샷은 추출·변경 시점의 팩 상태를 자동 보관해 롤백 지점으로 쓸 수 있음.' },
          { label: '예시', text: '배포된 캐릭터 팩.json을 "JSON 파일 가져오기"로 등록함. 자동 추출이 엉망이 된 것 같으면 스냅샷에서 이전 시점으로 복원함.' },
          { label: '설정', text: '가져오기·내보내기·삭제·팩 임베딩은 로어 관리(파일) 메뉴에서 다룸. JSON을 직접 붙여넣기도 가능함. 스냅샷 목록과 복원은 로어 스냅샷 메뉴. 팩 단위 ON/OFF는 파일 메뉴 상단 스위치로, 개별 항목 ON/OFF는 로어 관리(목록)에서 토글함.' }
        ]);
  
        addHelp('프롬프트 템플릿 (자동 추출용)', [
          { label: '기능', text: '자동 추출 시 AI에게 보낼 프롬프트를 직접 고치거나 새로 만들 수 있음. 장르·톤에 맞춰 추출 기준을 조정 가능함.' },
          { label: '예시', text: '성인 장르용 템플릿을 복제해 "관계 변화 묘사는 더 구체적으로" 같은 지시를 덧붙여 저장함. 이후 추출은 그 템플릿 기준으로 돌아감.' },
          { label: '설정', text: '대화 추출 및 변환 메뉴 중간의 프롬프트 템플릿 관리에서 "+ 새 템플릿"으로 복제함. 스키마(출력 JSON 구조), "프롬프트(DB 미포함)"(기존 로어를 같이 보내지 않을 때), "프롬프트(DB 포함)"(함께 보낼 때) 세 가지를 편집함. 기본 템플릿은 보호돼 수정 불가이므로 복제 후 편집. 프롬프트 안의 {schema}·{context}·{entries}는 실제 값으로 치환되는 자리표시자이므로 지우면 안 됨. "초기화" 버튼으로 커스텀 템플릿을 기본값 내용으로 되돌림.' }
        ]);
  
        addHelp('앵커와 버전 이력', [
          { label: '기능', text: '앵커는 유저가 확정한 캠논 항목을 자동 추출의 덮어쓰기로부터 보호함. 버전 이력은 모든 덮어쓰기 직전 상태를 자동 백업해 언제든 되돌릴 수 있게 함.' },
          { label: '예시', text: '"니아=17세"로 앵커 지정해두면 이후 AI가 "18세" 같은 잘못된 서술을 해도 핵심 필드는 유지됨. 자동 추출이 실수로 관계 설정을 지웠다면 이력에서 이전 버전을 복원함.' },
          { label: '설정', text: '로어 관리(목록)에서 각 항목의 "앵커" 버튼으로 지정·해제. "이력" 버튼으로 저장된 버전(최대 20개) 목록을 보고 복원함. 앵커 상태에서도 사건 목록 추가와 키워드(triggers) 확장은 허용돼 서사는 계속 누적됨.' }
        ]);
  
        addHelp('URL·텍스트 → 로어 변환', [
          { label: '기능', text: '외부 설정 문서(URL)나 붙여넣은 긴 텍스트를 AI가 분석해 로어 팩 구조로 자동 변환함. 대량 임포트에 유용함.' },
          { label: '예시', text: '위키 문서 URL을 입력하면 주요 인물·장소·사건이 항목별로 나뉘 팩으로 생성됨. 소설 본문을 붙여넣으면 등장인물과 관계가 자동 추출됨.' },
          { label: '설정', text: '대화 추출 및 변환 메뉴 아래의 "지식 변환" 영역에서 URL 또는 텍스트와 팩 이름을 입력한 뒤 변환 버튼 누름. 변환에는 자동 추출과 같은 LLM API 키가 쓰임. 변환된 팩은 자동으로 활성화됨.' }
        ]);
  
        addHelp('빠른 설정 프리셋', [
          { label: '기능', text: '자주 쓰는 설정 묶음을 한 번에 적용함. 기존 설정은 기본값으로 초기화된 뒤 프리셋 값으로 덮임.' },
          { label: '예시', text: '"기본 추천"은 일반 RP용(8턴 추출, 재정렬 꺼짐). "수동 검색"은 API 절약형으로 자동 추출이 꺼져 있음. "정밀(리랭커)"은 5턴 추출 + LLM 재정렬 + 의미 기반 응답 교정까지 한꺼번에 켬.' },
          { label: '설정', text: '메인 설정 최상단의 빠른 설정 카드에서 버튼 선택. 적용 후 새로고침 필요함.' }
        ]);
  
        addHelp('API 설정 (모델·추론)', [
          { label: '기능', text: 'Gemini 키 또는 Vertex AI JSON을 등록해 자동 추출·임베딩·재정렬·지식 변환·응답 교정에 공통으로 사용함. 기본 LLM 모델과 재정렬 모델, 추론 예산을 분리해 지정 가능함.' },
          { label: '예시', text: '기본 LLM은 Gemini 3.0 Flash로, Reranker는 3.1 Flash Lite로 지정하면 속도와 품질을 함께 확보함. 추론 레벨 Medium(2048 토큰)은 대부분 RP에 충분함.' },
          { label: '설정', text: 'API 설정 메뉴에서 키 입력 후 "API 키 테스트"로 동작 확인함. 기본 LLM·재정렬 모델은 각각 드롭다운에서 고름. 추론 레벨은 Off·Minimal·Low·Medium·High·Budget 중 고르고, Budget을 고르면 토큰 수를 직접 입력함. Reranker 프롬프트는 같은 화면에서 편집 가능하며 "기본값 복구" 버튼으로 되돌림.' }
        ]);
  
        addHelp('세션 상태와 실행 로그', [
          { label: '기능', text: '현재 채팅방의 턴 수·쿨다운·재주입 점수를 한눈에 보고 개별·일괄 초기화함. 실행 로그는 주입·추출·교정·모순 기록을 분리해 남김.' },
          { label: '예시', text: 'AI가 특정 설정을 반복 참조하면 주입 기록에서 어떤 항목이 몇 번 들어갔는지 확인함. 자동 추출이 실패했다면 추출 기록에서 API 에러를 살핌.' },
          { label: '설정', text: '세션 상태 관리 메뉴에서 항목별 리셋 또는 "세션 전체 초기화"로 일괄 리셋. 실행 로그는 각 카테고리(주입·추출·교정·모순) 상단을 클릭해 펼치거나 "초기화" 버튼으로 지움.' }
        ]);
      }, '기능 안내');
    });
  });
  
  _w.__LoreInj.__subHelpLoaded = true;
})();
