# Dental Wave Viz

> 30 kHz 탄성파 비침습 치은 병변 스크리닝 콘솔
> React 19 + TypeScript + Vite + Tailwind v4 (FE) · FastAPI + SQLite (BE) · Anthropic Claude API · Plotly + R3F 시각화

라이브 배포: https://dental-wave-viz-willy.fly.dev

---

## 빠른 시작

### 0. 사전 요구
- Python 3.10+ (3.12 권장)
- Node 20.19+ 또는 22.12+ (Vite 8 요구)
- (선택) Anthropic API 키 — AI 어시스턴트 실연결용. 미설정 시 stub 응답으로 UI는 동작.

### 1. 클론 & 의존성 설치
```bash
git clone https://github.com/SAiL-26/test.git dental_viz
cd dental_viz

# 백엔드 Python deps
cd backend && pip install -r requirements.txt && cd ..

# 프런트엔드 Node deps
cd frontend && npm install && cd ..
```

### 2. 환경변수
```bash
cp .env.example .env
# .env 편집 — 최소 DENTAL_JWT_SECRET, 선택적으로 DENTAL_ANTHROPIC_API_KEY
```
- JWT secret 생성: `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- Anthropic 키: https://console.anthropic.com/settings/keys (월 한도 설정 권장)

### 3. 개발 서버
```bash
# 터미널 1 — 백엔드
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 터미널 2 — 프런트
cd frontend
npm run dev
```
- 앱: http://localhost:5173 (Vite dev proxy로 `/api/*` → `:8000` 자동)
- API 문서: http://localhost:8000/docs

### 4. 데모 계정
| 이메일 | 비밀번호 | 역할 |
|---|---|---|
| `doctor@demo.com` | `doctor123` | 의사 — 전체 환자 접근 |
| `patient2@demo.com` | `patient123` | 환자 (김철수) — 본인 스캔만 |

---

## 주요 화면 · 라우트

| 라우트 | 화면 | 비고 |
|---|---|---|
| `/login` | 로그인 | 데모 계정 표시 |
| `/intro` | 에디토리얼 모드 선택 | 임상 콘솔 / 심층 분석 / 환자용 앱 3 진입 + 라이브 MCMC 애니메이션 |
| `/` | 환자 트리아지 칸반 | 4구간 (전문의 의뢰 ≥80 / 임상 검토 50–80 / 경과 관찰 20–50 / 정상 <20) |
| `/patients/:id` | 환자 상세 | 스캔 목록 + 메타 |
| `/patients/:id/timeline` | 병변 경과 분석 | severity trend + 3D 치아 arch lesion morph (위치/크기 변화) |
| `/patients/:id/compare` | A/B 스캔 비교 | 단일 환자의 2개 스캔 비교 |
| `/compare` | 다환자 교차 비교 | 레이더 + 추세 오버레이 + 델타 + 진행 속도 예측 |
| `/scans/:id` | 임상 콘솔 (Dark) | 6패널 wave viz + 라이브 MCMC + SOAP 기록지 + AI 도크 |
| `/scans/:id/story` | 작동 원리 (스크롤리텔링) | 6단계 임상 narrative · 의사/환자 모드 토글 |
| `/scans/:id/report` | A4 리포트 미리보기 | 브라우저 인쇄 → 한글 PDF 저장 |
| `/scans/new` | 새 스캔 파이프라인 | 8단계 위저드 (등록 → 치아 특이 → 3D 스캔 → 파동 측정 → f-k 필터 → 저속 에너지 스크리닝 → MCMC → 결과) + SVG 애니메이션 + AI 가이드 |
| `/lab` | 심층 분석 모드 (Research) | 4탭 — Forward 시뮬레이션 / 베이지안 역산 진단 / Corner plot / 민감도 분석 |
| `/runs` | 스캔 이력 | 정렬·필터 가능한 dense table |
| `/eval` | 평가 · 시나리오 | 3 시나리오 통계 + 최근 평가 24행 |
| `/m`, `/m/:patientId` | 환자용 모바일 (Light) | 결과 / 경과 / 도움(AI Q&A) 3탭 · 풀투리프레시 · 진료 예약 시트 · PDF 인쇄 · 공유 |

테마 자동 전환 (라우트 기반): `/scans/:id`, `/compare`만 Clinical Dark, 나머지는 Clinical Light. `useRouteTheme.ts`에서 패턴 관리.

---

## AI 어시스턴트 연동 (Anthropic Claude API)

백엔드의 `POST /api/ai/chat`이 Anthropic Messages API로 프록시합니다.

- 모델: 기본 `claude-sonnet-4-6` (`DENTAL_ANTHROPIC_MODEL`로 변경 가능)
- 시스템 프롬프트: `backend/app/routes/ai.py` — 의사용/환자용 페르소나 분리. 마크다운 강조 금지, 본론부터 시작, 정량지표 인용 강제.
- 케이스 컨텍스트(환자명, scan_id, severity, MCMC 진단 등)는 프런트에서 빌드해 함께 전송.
- 키 미설정 시 `/api/ai/chat`은 stub 응답을 반환 — UI는 정상 동작 (개발 친화).
- 친절한 한글 에러 매핑: 잔액 부족 → 402, 인증 실패 → 401, 한도 초과 → 429.

### 비용 안전장치 (권장)
- Anthropic 콘솔에서 **월 spend limit** 설정 (예: $10)
- 우리 백엔드는 JWT 인증 필수라 로그인한 사용자만 호출 가능

---

## 백엔드 구조

```
backend/
  app/
    main.py          FastAPI 앱 + CORS + SPA fallback
    config.py        pydantic-settings (DENTAL_* env vars)
    db.py            SQLAlchemy 엔진/세션
    models.py        User · Patient · Scan · Detection
    schemas.py       Pydantic I/O 스키마
    auth.py          JWT (python-jose) + bcrypt
    deps.py          get_current_user 의존성
    wave_data.py     wave bundle 로더/캐시
    routes/
      auth.py        /api/auth/* (login, me)
      patients.py    /api/patients/*
      scans.py       /api/scans/*
      wave_real.py   /api/wave/* (metadata, seismogram, energy, velocity, screening, mcmc trace/bg)
      ai.py          /api/ai/chat — Claude 프록시
  data/
    _shared/wave_real/   forward sim 산출물 (Vp/Vs/ρ, snapshot 41프레임, seismogram 100×75000)
    scans/scan_001..011/ 시나리오별 bundle dir (대부분 _shared로 symlink + 자체 meta.json)
  scripts/
    prep_scans.py        _shared 바이너리 정합/패키징
    seed_db.py           기본 환자 5명 + 스캔 6건 시드
    seed_progression_patient.py  진행성 환자 1명 + 5스캔 추가 (최영진, MRN-0006)
  dental.sqlite          SQLite (users · patients · scans · detections)
  requirements.txt
```

### 데이터 재시드
```bash
cd backend
python -m scripts.seed_db                     # 기본 데모 5환자
python scripts/seed_progression_patient.py    # + 진행성 환자 최영진 (idempotent)
```

---

## 프런트엔드 구조

```
frontend/
  src/
    main.tsx           폰트 import · 초기 테마 적용
    App.tsx            BrowserRouter + lazy routes
    index.css          @theme 디자인 토큰 (Light/Dark 듀얼)
    api/
      client.ts        axios + 401 자동 로그아웃
      endpoints.ts     /api/* fetch wrappers
      wave.ts          wave bundle 엔드포인트 + 타입
      types.ts         Patient · Scan · Detection · BundleMeta 등
      ai.ts            askClaude() — POST /api/ai/chat + 친절한 에러
    auth/
      AuthContext.tsx  JWT 토큰 관리 (localStorage)
    components/
      Layout.tsx       76px NavRail + 톱바
      ThemeToggle.tsx  Light/Dark 수동 전환
      ProtectedRoute · NewPatientDialog · ErrorBoundary · Skeleton
      scan/
        ChartSheet.tsx       SOAP 기록지
        AIAssistantDock.tsx  Claude 도크 (의사/환자 페르소나)
        DoctorReview.tsx
        wave/                Plotly 6패널 + R3F · WaveWorkspace 오케스트레이터
    lib/
      useRouteTheme.ts     라우트 기반 자동 테마 전환
      usePlotlyTheme.ts    Plotly 테마 어댑터
      reportPdf.ts         jsPDF 영문 폴백
      storyCopy.ts         StoryMode 한국어 카피
      wavePalette.ts       Plotly 색상 토큰
    pages/
      Intro · PatientList · PatientDetail · PatientApp
      ScanViewer · StoryMode · ReportPreview
      PipelineWizard · ResearchLab · TimelineView
      CompareView · CompareWorkspace · Runs · Eval · Login
  index.html · vite.config.ts · package.json · tsconfig.*
```

### 디자인 토큰
- **Clinical Light** (admin/triage/intro/lab/wizard/mobile): 워밍 포슬린 (`#EFE9DF` / `#FCFAF5` / 제이드틸 `#0E8E86` / 로즈 finding `#DC3A77`)
- **Clinical Dark** (imaging surface): `#0B0F14` / `#121821` / 시안 `#58C2F0` / 핑크 finding `#FF3E8A`
- **타이포**: Inter + Noto Sans KR (UI), JetBrains Mono (data), Newsreader (editorial 세리프 ital)

### 성능 최적화
- 초기 번들 89KB (gzip 26KB) — Plotly 4.6MB 청크는 차트 페이지 진입 시에만 로드
- `lazy()` 적용: ScanViewer · StoryMode · CompareView/Workspace · PipelineWizard · ResearchLab · TimelineView · Runs · Eval
- 카드 호버 시 patient/scans `prefetchQuery` warm-up
- 모든 wave 쿼리 `staleTime: Infinity` (deterministic bundle data)

---

## 프로덕션 배포 (Fly.io 단일 컨테이너)

FE 정적 빌드를 백엔드 컨테이너 안에 함께 패키징 (`Dockerfile` 2-stage).

```bash
# 1. flyctl 설치 (https://fly.io/docs/hands-on/install-flyctl/)
flyctl auth login

# 2. 앱 생성 (이름은 전 세계에서 유일해야 함)
flyctl launch --no-deploy --copy-config --name dental-wave-viz-XXX

# 3. JWT secret 설정 (필수 — production에서 dev 기본키 거부)
flyctl secrets set DENTAL_JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')"

# 4. Anthropic 키 (선택)
flyctl secrets set DENTAL_ANTHROPIC_API_KEY=sk-ant-...

# 5. 볼륨 (SQLite + bundle 영속)
flyctl volumes create dental_data --region nrt --size 1

# 6. 배포
flyctl deploy
```

### Docker 직접 빌드
```bash
docker build -t dental-wave-viz .
docker run -p 8000:8000 \
  -e DENTAL_JWT_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \
  -e DENTAL_ANTHROPIC_API_KEY=sk-ant-... \
  -e DENTAL_ENVIRONMENT=production \
  dental-wave-viz
```

---

## 기술 스택 요약

**프런트**
- React 19 · TypeScript 6 · Vite 8
- Tailwind v4 (`@theme` 토큰)
- React Router 7 (lazy routes)
- TanStack Query 5 (`staleTime: Infinity` + prefetch on hover)
- Plotly.js (2D 6패널) · React Three Fiber (3D)
- `@fontsource-variable/inter` · `jetbrains-mono` · `newsreader` · `@fontsource/noto-sans-kr`
- `axios` · `scrollama` · `jspdf` · `lucide-react`

**백엔드**
- FastAPI 0.115 + uvicorn / gunicorn
- SQLAlchemy 2 + SQLite
- pydantic 2 + pydantic-settings
- python-jose (JWT) + bcrypt
- anthropic 0.41 (Claude API)
- numpy (binary bundle reshape)

**인프라**
- Fly.io 단일 컨테이너 (NRT region)
- Persistent volume 마운트 (SQLite + bundles)
- 멀티스테이지 Dockerfile (node:22-alpine → python:3.12-slim)

---

## 한계 · 정직 코너

- **합성 데이터만**: scenario_tag(healthy/inf70/inf80)는 forward 시뮬레이션 산출. in vitro/ex vivo 검증 전.
- **단일 스칼라 심각도**: 모델 출력이 0.05/0.62/0.89로 깔끔. 실제 모델은 분포·신뢰구간을 가져야 함.
- **3D 치아는 절차적**: glTF 해부학 모델이 아니라 procedural mesh. 데이터(슬라이스/마스크)는 실제이나, 주변 jaw geometry는 시각화 보조용.
- **임상 판단 보조 도구가 아님**: 최종 임상 의사결정은 면허 의사의 직접 검진에 따라야 합니다.

---

## 라이센스 / 사용 권한

연구·교육 목적 PoC. 임상 진단·의료기기로 사용 금지.
