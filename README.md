# CRACK-INJECTION-REFINER

`crack.wrtn.ai` 채팅 화면에서 동작하는 비공식 Tampermonkey 사용자 스크립트입니다.

주요 목적은 RP 대화 중 로어를 자동 삽입하고, 대화 로그를 기반으로 로어팩을 추출하며, Gemini 계열 API를 이용해 응답 교정을 수행하는 것입니다.

## 설치

권장 설치 파일:

```text
https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/main/universal_bundle_work/dist/erie_crack_inject_universal.user.js
```

배포 보존 브랜치:

```text
https://raw.githubusercontent.com/Localsmile/CRACK-INJECTION-REFINER/260523-universal-clean/universal_bundle_work/dist/erie_crack_inject_universal.user.js
```

`260523-universal-clean` 브랜치는 보존용 배포 브랜치입니다. `main` 브랜치는 해당 브랜치의 단일 설치용 번들 구조를 기준으로 관리합니다.

## 동작 대상

스크립트는 다음 형태의 채팅 경로에서 실제 기능을 수행합니다.

```text
https://crack.wrtn.ai/stories/*/episodes/*
https://crack.wrtn.ai/characters/*/chats/*
https://crack.wrtn.ai/u/*/c/*
```

메인 화면에서는 무거운 모듈을 직접 실행하지 않습니다. 메인 화면에서 채팅 경로로 SPA 이동이 발생하면 채팅 전용 부트스트랩을 위해 재로드를 유도합니다.

## 로드 구조

이 저장소는 소스 관리를 위해 파일을 모듈 단위로 분리하지만, 사용자가 설치하는 파일은 단일 userscript입니다.

관리용 소스:

```text
embedding/
embedding_pre/
universal_bundle_work/
```

사용자 설치용 출력:

```text
universal_bundle_work/dist/erie_crack_inject_universal.user.js
```

외부 런타임 의존성은 Dexie만 `@require`로 유지합니다. 프로젝트 내부 모듈은 빌드 시 단일 userscript 본문에 포함됩니다.

## 주요 기능

### 로어 삽입

- 채팅 요청 직전 사용자 입력에 로어를 삽입합니다.
- 삽입 ON/OFF는 추출 ON/OFF와 별도로 관리합니다.
- 트리거, 의미 검색, 최근 대화, 쿨타임, 중요도, 오래된 정보 주기 삽입 여부를 기준으로 후보를 고릅니다.
- 삽입 예산에 맞춰 로어 내용을 자동 압축합니다.
- 같은 로어가 반복 삽입되지 않도록 턴 기반 쿨타임을 적용합니다.

### 로어 추출

- 자동 추출, 수동 추출, 전체 로그 일괄 추출을 지원합니다.
- 자동 추출은 로어 삽입을 꺼도 별도 설정이 켜져 있으면 주기적으로 동작합니다.
- 기존 로어팩을 입력에 포함하여 새 정보와 기존 정보를 병합합니다.
- 변경분만 저장 모드에서는 입력 조건은 유지하고 출력만 변경분 중심으로 받습니다.
- 변화가 없는 경우 저장과 임베딩 준비를 건너뛰도록 설계되어 있습니다.

### 중요 장면 추출

- 일반 로어 추출과 별도 API 호출로 동작합니다.
- 사건, 약속, 관계 변화, 상태 변화처럼 이후 대화에서 다시 참조할 정보를 저장합니다.
- 변경분만 저장 모드가 켜진 경우 중요 장면도 변경분 중심으로 갱신합니다.

### 과거 장면 판단

- 저장된 중요 장면 중 현재 대화에 관련된 항목을 판단합니다.
- 판단 모델과 reasoning 설정은 API 설정에서 관리합니다.

### 응답 교정

- 마지막 assistant 응답을 로어, 메모리, 최근 대화 기준으로 검수합니다.
- 수동 교정과 자동 교정을 지원합니다.
- 서버 수정은 `crack-gen/v3/chats/{chatId}/messages/{messageId}` PATCH 경로를 사용합니다.
- 같은 메시지에 대한 중복 교정 호출을 방지합니다.
- 서버 수정 성공 후 현재 화면이 갱신되지 않으면 DOM 반영을 시도하고, 실패 시 새로고침 안내를 표시합니다.

## API 설정

지원 방식:

- Gemini API Key
- Vertex AI 서비스 계정 JSON
- Firebase 설정 스크립트
- NVIDIA NIM OpenAI 호환 Chat Completions API

Firebase 방식에서 임베딩을 사용하는 경우 별도 Gemini API Key가 필요할 수 있습니다.

NVIDIA NIM 방식은 생성 API 키와 임베딩용 Gemini API Key를 별도로 입력합니다. 기존 Gemini, Vertex, Firebase 설정 값은 삭제하지 않고 보존합니다. 의미 검색과 임베딩은 NIM 키가 아니라 Gemini 임베딩 API로 생성합니다.

NIM 모델 기본 선택지는 다음과 같습니다.

- deepseek-ai/deepseek-v4-pro
- deepseek-ai/deepseek-v4-flash
- z-ai/glm5.1
- moonshotai/kimi-k2.6

NIM 모델 설정은 Gemini 모델 설정과 별도로 저장됩니다. API 방식을 NIM으로 선택하면 NIM 모델 설정만 표시하고, Gemini 계열을 선택하면 Gemini 모델 설정만 표시합니다.

모델 설정은 기능별로 분리됩니다.

- 추출/정리 모델
- 임베딩 모델
- 후보 재정렬 모델
- 과거 장면 판단 모델
- 응답 교정 모델

API 비용 표시는 Gemini 응답의 `usageMetadata` 또는 OpenAI 호환 응답의 `usage`가 있으면 해당 토큰 사용량을 기준으로 계산합니다. 토큰 사용량이 없으면 글자 수 기반 추정값을 사용합니다. 실제 청구액은 각 API 제공자의 결제 내역이 기준입니다.

## 저장소 구조

```text
embedding/
  core-*.js                  공통 런타임, DB, API, 검색, 포맷, 가격 계산
  injecter-*.js              로어 삽입, 추출, 병합, 설정 UI
  refiner-*.js               응답 교정, DOM 반영, 큐, observer
  vendor/                    외부 기반 코드 및 UI 의존 파일

embedding_pre/
  erie_crack_inject.user.js       라우터형 설치 스크립트
  erie_crack_inject_chat.user.js  분할 require형 채팅 스크립트

universal_bundle_work/
  build-universal-bundle.ps1      단일 userscript 생성
  bundle-manifest.json            번들 포함 파일 목록
  verify-universal-bundle.ps1     번들 검증
  dist/                           사용자 설치용 출력 파일

BETA/
LORE_TEST/
user_note/
```

## 빌드

단일 설치용 userscript 생성:

```powershell
powershell -ExecutionPolicy Bypass -File universal_bundle_work\build-universal-bundle.ps1
```

검증:

```powershell
powershell -ExecutionPolicy Bypass -File universal_bundle_work\verify-universal-bundle.ps1
node --check universal_bundle_work\dist\erie_crack_inject_universal.user.js
```

## 저장 데이터

주요 저장소:

- IndexedDB: 로어팩, 로어 엔트리, 임베딩 캐시
- localStorage: 설정, URL별 활성 로어팩, 쿨타임, 교정 처리 지문
- sessionStorage: 라우터 재로드 방지 플래그

기존 사용자 로어팩 데이터와 설정 키는 유지하는 방향으로 마이그레이션합니다.

## 개발 기준

- 사용자 설치용 파일은 `universal_bundle_work/dist/erie_crack_inject_universal.user.js`입니다.
- 기능 수정은 먼저 `embedding/` 소스에 적용한 뒤 번들을 다시 생성합니다.
- `dist` 파일만 직접 수정하지 않습니다.
- `260523-universal-clean` 브랜치는 보존용으로 유지합니다.
- `main` 브랜치는 단일 설치용 universal 구조를 기준으로 관리합니다.

## 주의 사항

- 이 스크립트는 비공식 사용자 스크립트입니다.
- 대상 사이트의 DOM, API 경로, 응답 스키마가 변경되면 일부 기능이 동작하지 않을 수 있습니다.
- API 호출 기능은 사용자의 API Key 또는 클라우드 계정 비용을 발생시킬 수 있습니다.
