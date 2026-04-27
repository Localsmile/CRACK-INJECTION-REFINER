# 모듈 아키텍처 문서

## 개요

CRACK-INJECTION-REFINER 프로젝트의 모듈화된 아키텍처입니다.  
모든 모듈은 IIFE 패턴으로 작성되며, `unsafeWindow.__LoreCore`, `unsafeWindow.__LoreInj`, `unsafeWindow.__LoreRefiner`를 통해 상태를 공유합니다.

## Release target — 1.4.0-test

- Runtime baseline entering this line: `1.3.19` loader + Core `1.3.7`.
- Target release label: `1.4.0-test`.
- Final DB schema: Dexie `v9`.
- `v8` adds embedding lifecycle metadata; `v9` adds temporal/entity graph metadata.
- `8/8` adds automatic no-API local migration and stale embedding cleanup.
- Schema migrations: database tables/indexes and per-entry structural fields.
- localStorage migrations: settings, prompt/template defaults, old-version notices, session flags, and loader-facing status labels.
- Final invariant: all modified modules have cache-busting loader URLs and the line is ready for user testing/distribution.

---

## 1. 코어 모듈 (Core)

| 파일 | 줄수 | 역할 | 의존 |
|------|------|------|------|
| `core-kernel.js` | ~470 | DB 초기화(v9 final), API 호출, 설정/턴/멘션 유틸, 마이그레이션 상수 | Dexie |
| `core-ui.js` | ~185 | UI 헬퍼 (토글, API 입력, 뱃지) | 없음 |
| `core-platform.js` | ~65 | 플랫폼 로그/메모리/페르소나 가져오기 | kernel |
| `core-memory.js` | ~280 | 시간감쇠, 활성캐릭터, 첫만남/재회, 워킹메모리, 호칭매트릭스, 버전이력 | kernel |
| `core-format.js` | ~255 | 포맷 (full/compact/micro), 어셈블리, 번들 | kernel |
| `core-search.js` | ~250 | 키워드스캔, 임베딩검색, LLM 재정렬 | kernel, memory |
| `core-embedding.js` | ~100 | 텍스트 임베딩, 팩 임베딩 | kernel |
| `core-importer.js` | ~130 | URL/텍스트/JSON → 로어 임포트 | kernel, embedding |

**로드 순서**: kernel → ui → platform → memory → format → search → embedding → importer

---

## 2. 인젝터 모듈 (Injecter)

| 파일 | 줄수 | 역할 | 의존 |
|------|------|------|------|
| `injecter-1.js` | ~100 | 주입 커널 (메시지 인터셉트, 주입 실행) | core |
| `injecter-2.js` | ~225 | OOC 포맷, CHANGELOG, 버전관리 | core |
| `injecter-3.js` | ~325 | 설정, 팩/엔트리 ON/OFF, 스냅샷, 로그, 턴/쿨다운 | core |
| `injecter-4.js` | ~505 | 자동추출, 배치추출, URL/텍스트 변환 | core, importer |
| `injecter-5.js` | ~285 | 주입 파이프라인 (검색→정렬→포맷→주입) | core, search, format, memory |
| `injecter-6.js` | ~25 | **진입점** — 서브모듈 등록 수집 + setupSubMenus | injecter-3 |

### 2-1. 인젝터-6 서브모듈 (UI)

| 파일 | 줄수 | 서브메뉴 | 의존 |
|------|------|---------|------|
| `injecter-6-sub-main.js` | ~120 | 메인 설정 | injecter-6 |
| `injecter-6-sub-lore.js` | ~135 | 로어 관리(목록) | injecter-6 |
| `injecter-6-sub-merge.js` | ~216 | 로어 병합 | injecter-6 |
| `injecter-6-sub-snapshot.js` | ~30 | 스냅샷 | injecter-6 |
| `injecter-6-sub-file.js` | ~70 | 파일 관리 | injecter-6 |
| `injecter-6-sub-extract.js` | ~200 | 추출/변환 설정 | injecter-6 |
| `injecter-6-sub-refiner.js` | ~200 | AI 응답 교정 | injecter-6, refiner |
| `injecter-6-sub-log.js` | ~80 | 실행 로그 | injecter-6 |
| `injecter-6-sub-session.js` | ~145 | 세션 상태 | injecter-6 |
| `injecter-6-sub-api.js` | ~75 | API 설정 | injecter-6 |
| `injecter-6-sub-help.js` | ~110 | 도움말 | injecter-6 |
| `injecter-6-ui.js` | ~150 | **UI 진입점** — 모달+DOM+변경로그 | injecter-6, 모든 sub-* |

**로드 순서**: injecter-6 → sub-main → sub-lore → sub-merge → sub-snapshot → sub-file → sub-extract → sub-refiner → sub-log → sub-session → sub-api → sub-help → ui

---

## 3. 리파이너 모듈 (Refiner)

| 파일 | 줄수 | 역할 | 의존 |
|------|------|------|------|
| `refiner-prompts.js` | ~170 | 프롬프트 템플릿, TOPICS, buildDynamicPrompt | 없음 |
| `refiner-dom.js` | ~160 | DOM 조작, React Fiber 패치, markdown 렌더 | 없음 |
| `refiner-core.js` | ~240 | refineMessage, matchByTrigger, fingerprint | prompts, dom |
| `refiner-queue.js` | ~50 | 큐 관리 (enqueueRefine, processQueue) | 없음 |
| `refiner-observer.js` | ~70 | MutationObserver + 폴링 | core, queue |
| `refiner.js` | ~30 | **진입점** — 5모듈 조합 + init() | prompts, dom, core, queue, observer |

**로드 순서**: prompts → dom → core → queue → observer → refiner

---

## 4. 로더 (Loader)

| 파일 | 역할 |
|------|------|
| `erie_crack_inject.user.js` | 모든 @require 관리 + 로드 검증 |
| `crack-lore-core.user.js` | 코어 전용 로더 (injecter/refiner 없이 코어만) |

---

## 5. 의존성 DAG (전체)
