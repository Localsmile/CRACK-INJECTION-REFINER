# CRACK-INJECTION-REFINER
[비공식] crystallized-chasm 기반 연동 확장 스크립트

[crack.wrtn.ai](http://crack.wrtn.ai) 전용 RP 로어 자동 주입 — WebSocket 인터셉트 기반, Gemini API 연동 대화 분석 및 세계관 DB 자동 구축

## crystallized-chasm 프로젝트 (milkyway0308)
https://github.com/milkyway0308/crystallized-chasm

# 기능 요약
1. 메시지 인터셉트
- Socket.IO (WebSocket) send 이벤트 인터셉트 — wrtn JS보다 선행 실행 (document-start)
- fetch 폴백 지원

2. 로어 주입
- IndexedDB(Dexie) 기반 로어 팩 시스템 — JSON 가져오기/내보내기, 수동 입력
- 트리거 키워드 매칭 → 가중치 스코어링 → 상위 N개 자동 주입
- 한국어 조사 인식 정규식 (은/는/이/가/을/를 등)
- 바이그램 유사도 기반 오타 허용 매칭
- && 복합 트리거 (캐릭터+이벤트 조합 조건)
- 재주입 쿨다운 (턴 기반, per-entry)
- 주입 위치 선택 (메시지 앞/뒤)

3. Gemini API 연동
- 대화 자동 분석 → 로어 자동 추출 및 DB 병합 (주기적/수동)
- 기존 DB 포함 전송으로 중복 추출 방지
- API Key / Vertex AI (서비스 계정 JWT) 이중 인증 지원
- 모델 선택 (Gemini 2.x, 3.x, 커스텀 ID)
- Thinking 레벨 / 토큰 버짓 설정
- API 재시도 로직

4. URL별 상태 관리
- 채팅방(URL)별 독립된 팩 활성화, 쿨다운, 턴 카운터, 로그
- 자동 추출 팩 이름 자동 생성 (URL suffix 기반)

5. UI
- ModalManager 기반 설정 패널 (decentralized-modal.js)
- 팩 관리, 항목별 ON/OFF, 인라인 JSON 편집
- 주입/추출 실행 로그 뷰어
- 쿨다운 상태 모니터 + 수동 해제

# 설치방법
1. Tampermonkey / Violentmonkey 설치
2. 유저스크립트 설치

[필수] [캐즘 이그나이터](https://github.com/milkyway0308/crystallized-chasm/raw/refs/heads/main/crack/ignitor.user.js)

[필수] [로어 인젝터](링크1)

[선택] [AI 응답 교정기(리파이너)](링크2)

# 로어 JSON 스키마(Lore Format)
```{
  "type": "character|location|item|event|...",
  "name": "엔티티명",
  "triggers": ["키워드1", "캐릭터&&이벤트"],
  "scan_range": 5,
  "summary": "요약",
  "detail": { "attributes": "", "relations": [], "background_or_history": "" }
}
```

# 의존성 (Dependencies)
- Dexie.js v4.2.1
- crack-shared-core / chasm-shared-core (milkyway0308)
- decentralized-modal.js
- toastify-injection.js



