# CRACK-INJECTION-REFINER

[비공식] `crystallized-chasm` 기반 연동 확장 스크립트
[crack.wrtn.ai](https://crack.wrtn.ai) 전용 RP 로어 자동 주입 · AI 응답 교정 · 대화 기반 DB 자동 구축

WebSocket `send` 인터셉트로 유저 메시지 직전에 로어를 끼워 넣고, Gemini / Vertex AI 연동으로 대화 로그에서 로어를 추출해 IndexedDB에 누적함.

컨텍스트 관리 로직/기술을 크랙 유저 채팅을 수정/삽입하는 방식으로 구현.

---

## 기반 프로젝트

- [milkyway0308 / crystallized-chasm](https://github.com/milkyway0308/crystallized-chasm)
  공용 코어(`crack-shared-core`, `chasm-shared-core`), `decentralized-modal`, `toastify-injection`을 그대로 사용함.

---

## 아키텍처

로더 스크립트가 `@require`로 모듈을 순차 로드함.
엔트리는 단일 유저스크립트지만 내부적으로 **Core 라이브러리 + 인젝터 + 리파이너**로 분리됨.

### Core 라이브러리

| 모듈 | 역할 |
| --- | --- |
| `core-ui.js` | 설정/로그 UI 공통 컴포넌트 |
| `core-kernel.js` | 전역 상태, 이벤트 버스, 수명 주기 |
| `core-platform.js` | WebSocket / fetch 후킹, Gemini·Vertex 호출 래퍼 |
| `core-memory.js` | Dexie DB, 워킹 메모리, 첫만남 기록, 감쇠 스코어 |
| `core-format.js` | adaptiveFormat(full / compact / micro), 동적 예산 계산 |
| `core-search.js` | 하이브리드 검색(트리거 + 임베딩), 활성 캐릭터 감지 |
| `core-embedding.js` | 임베딩 생성·캐시, 유사도 계산 |
| `core-importer.js` | JSON 팩 가져오기/내보내기, 스키마 검증 |

### 인젝터 (6개 모듈)

로더의 검증 루틴(`__interceptorLoaded` 등)이 요구하는 순서:

1. **interceptor** — Socket.IO `send` 선점(document-start), fetch 폴백
2. **const** — 상수, 기본 설정, 정규식 테이블
3. **settings** — URL별 설정 저장/로드, 마이그레이션
4. **extract** — 대화 로그 → Gemini → 로어 추출 → 중요도 게이팅 → 병합
5. **inject** — 트리거 매칭, 예산 산정, adaptiveFormat, 메시지 앞/뒤 삽입
6. **ui** — 설정 패널, 팩 편집기, 로그 뷰어, 쿨다운 모니터

### 리파이너

`refiner.js` — AI 응답 후처리(문체 교정, 금지어 필터, 커스텀 룰) 전담.

---

## 기능 요약

### 1. 메시지 인터셉트

- Socket.IO(WebSocket) `send` 인터셉트, wrtn 자체 JS보다 선행 실행(`@run-at document-start`)
- fetch 폴백 지원
- 인터셉션 실패 시 토스트 경고

### 2. 로어 주입

- IndexedDB(Dexie) 기반 로어 팩, JSON 가져오기/내보내기, 수동 입력
- 한국어 조사 인식 정규식(은/는/이/가/을/를 …)
- 바이그램 유사도 기반 오타 허용 매칭
- `&&` 복합 트리거 (예: `캐릭터A && 이벤트X`)
- 하이브리드 검색: 트리거 매칭 + 임베딩 유사도 + 시간 감쇠 혼합
- 2단계 시간 감쇠: `aiMemoryTurns`(AI 단기 기억 한계)와 `decayHalfLife`(관련성 반감기)를 분리
- Importance Gating: 중요도 낮은 로어는 자동 추출 단계에서 컷
- adaptiveFormat: 2000자 제한 내 여유 글자 수를 계산해 full → compact → micro 단계적 압축
- 워킹 메모리 / 씬 상태 / 첫만남 추적 / 호칭 매트릭스
- 재주입 쿨다운(턴 기반, per-entry), 주입 위치(앞/뒤) 선택
- 모순 감지 로깅

### 3. Gemini / Vertex AI 연동

- 대화 자동 분석 → 로어 자동 추출 → DB 병합(주기적 / 수동)
- 기존 DB 포함 전송으로 중복 추출 방지
- 이중 인증: API Key · Vertex AI(서비스 계정 JWT)
- 모델 선택: Gemini 2.x / 3.x / 커스텀 ID
- Thinking 레벨, 토큰 버짓, 재시도 로직
- 임베딩 모델 별도 지정 가능

### 4. URL별 상태 관리

- 채팅방(URL)별 팩 활성화, 쿨다운, 턴 카운터, 로그가 독립
- 자동 추출 팩 이름 자동 생성(URL suffix 기반)
- 활성 캐릭터 감지(`detectActiveCharacters`)로 씬별 우선순위 조정

### 5. UI

- `ModalManager` 기반 설정 패널(`decentralized-modal.js`)
- 팩 관리, 항목별 ON/OFF, 인라인 JSON 편집
- 주입/추출 실행 로그 뷰어
- 쿨다운 상태 모니터 + 수동 해제

---

## 기술 구현 상세

### WebSocket 인터셉션

- `document-start` 시점에 `window.WebSocket`을 프록시 래퍼로 교체
- 기존 `send`를 저장 후 래핑, 유저 메시지 프레임(Socket.IO 이벤트 코드 + payload)만 필터링
- payload를 디코딩 → 로어 주입 → 재인코딩 → 원본 `send.call`로 위임
- 인젝션 실패·파싱 실패 시 원본 payload를 그대로 통과시켜 채팅 유실 방지
- fetch 폴백: 일부 업데이트 경로에서 HTTP POST로 전송되는 경우를 대비해 `window.fetch` 동일 패턴으로 래핑

### 하이브리드 검색 파이프라인

입력: 최근 N턴 로그 + 활성 로어 팩
출력: 주입 후보 배열(점수 정렬)

1. **트리거 스캔** — 각 엔트리의 `triggers`를 최근 `scan_range`턴에 대해 정규식/바이그램 매칭, 한국어 조사 허용
2. **임베딩 회수** — 트리거 미스 엔트리 중 `importance ≥ threshold`인 것만 임베딩 유사도 상위 K 회수
3. **활성 캐릭터 보정** — `detectActiveCharacters`가 반환한 집합에 속한 엔트리의 점수에 가중치
4. **재주입 스코어** — `calcReinjectionScore(lastInjectedTurn, currentTurn, halfLife, memoryTurns)`로 감쇠 반영
5. **병합** — 트리거 점수 + 임베딩 점수 + 재주입 점수를 가중 합산, 중복 엔트리 dedupe

### 2단계 시간 감쇠 모델

두 파라미터가 완전히 다른 곡선을 그림:

- `aiMemoryTurns` — AI가 직전 몇 턴을 "기억하고 있다"고 가정하는 윈도우. 윈도우 안이면 재주입 불필요(점수 감점)
- `decayHalfLife` — 로어 자체의 관련성 반감기. 경과 턴이 반감기를 넘을수록 재주입 필요도가 지수적으로 상승

- `memoryOverlap`: 0~1, 윈도우 안이면 1에 가까워 감점
- `relevanceDecay`: 반감기 기반 지수 회복 함수, 오래된 로어일수록 다시 필요하다고 판단

### adaptiveFormat 과 동적 예산

입력 제한 2000자 내에서 "최대한 많은 로어를 의미 있게" 삽입하기 위한 목적

1. 원본 유저 메시지 길이 측정 → `budget = 2000 - len(userMessage) - 안전빵`
2. 후보 로어를 점수 내림차순으로 정렬
3. `full` 포맷으로 시뮬레이션 누적, 예산 초과 시 후순위부터 `compact`로 다운그레이드
4. 그래도 초과면 `micro`(summary only) 로 재다운그레이드
5. 그래도 초과면 하위 엔트리 드롭
6. 마지막으로 섹션 헤더·구분자 포함 길이 재검증

각 포맷은 `detail` 하위 필드 중 어떤 걸 살리고 버릴지 규칙이 다름. `importance`가 높을수록 full 유지 확률이 높아지는 tie-break를 둠.

### Importance Gating

자동 추출이 로그당 수십 개씩 뽑아내면 DB가 노이즈로 오염됨. 방지책:

- 추출 결과 각 엔트리에 `importance: 1~5` 요구
- `importance < minImportance`는 저장 단계에서 드롭
- 중복 병합 시 `max(importance)` 유지, summary/detail은 최신본으로 덮어쓰되 모순되면 `conflict` 로그에 기록

### 모순 감지

동일 엔트리에 대해 속성값이 바뀔 때:

- 단순 추가/확장 → silent merge
- 기존 값과 상충(예: 생존 → 사망, 소속 A → 소속 B) → `conflict` 로그에 턴·이전값·새값·출처 메시지 기록
- UI에서 유저가 수동으로 채택·롤백 가능

### 워킹 메모리 / 씬 상태

`core-memory.js`가 URL별로 유지하는 단기 슬롯.

- 현재 장소, 활성 인물, 진행 중 이벤트를 추적
- 매 턴 LLM 추출 결과로 갱신
- `detectActiveCharacters`가 이 슬롯과 최근 발화를 교차해 "지금 씬에 실제로 등장한" 인물만 골라 로어 우선순위에 반영

### 첫만남 추적 / 호칭 매트릭스

- 엔트리별 `firstEncounter`: 해당 로어가 채팅 문맥에서 처음 등장한 턴/메시지 ID 저장
- 첫 등장 이전에는 로어를 주입하지 않아 "AI가 모르는 정보를 이미 아는 것처럼 말하는" 누수 방지
- 호칭 매트릭스: 인물 A가 인물 B를 부르는 호칭을 관계·상황별로 기록, 캐릭터 간 톤 일관성 확보

### 스토리지 레이아웃

- Dexie DB: `packs`, `entries`, `embeddings`, `workingMemory`, `firstEncounters`, `logs`
- localStorage: URL별 경량 상태(쿨다운, 턴 카운터, 마지막 추출 시각)
- IndexedDB 용량 압박 시 임베딩부터 LRU 축출

### Gemini / Vertex 호출 계층

`core-platform.js` 안에서 통합:

- 공통 스키마로 요청 빌드 → 인증 모드 분기(Key vs JWT)
- Vertex는 서비스 계정 JSON에서 JWT 서명 후 OAuth 토큰 교환 → `Authorization: Bearer`
- Thinking/토큰 버짓은 모델이 지원하는 경우에만 파라미터 주입
- 재시도: 지수 백오프, 4xx는 즉시 실패, 5xx·네트워크 오류만 재시도
- 토스트로 실패 원인 표면화(Key 만료, 쿼터 초과, 모델 미지원 등 구분)

---

## 설치

1. [Tampermonkey](https://www.tampermonkey.net/) 또는 [Violentmonkey](https://violentmonkey.github.io/) 설치
2. 아래 링크로 유저스크립트 설치
https://github.com/Localsmile/CRACK-INJECTION-REFINER/raw/refs/heads/main/embedding_pre/erie_crack_inject.user.js

---

## 의존성

- [Dexie.js](https://dexie.org/)
- `crack-shared-core` / `chasm-shared-core` ([milkyway0308](https://github.com/milkyway0308/crystallized-chasm))
- `decentralized-modal.js`
- `toastify-injection.js`

모두 `@require` CDN 로드, 별도 설치 불필요.

---

## 크레딧
- 코어 프레임워크: [milkyway0308 / crystallized-chasm](https://github.com/milkyway0308/crystallized-chasm)
- 확장 스크립트 및 로어 엔진: Localsmile
