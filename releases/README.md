# Releases — Dental Wave Viz 최종본

| 파일 | 기준 커밋 | 생성일 |
|---|---|---|
| `dental_viz_final_20260603.zip` (split 2 parts) | `13393fa` | 2026-06-03 |

기준 커밋에는 다음이 모두 포함되어 있습니다:
- 13단계 디자인 리뉴얼 (Phase 1–13 — index.css 토큰부터 PDF 리포트까지)
- AI 임상 어시스턴트 (Anthropic Claude 백엔드 프록시)
- 8단계 새 스캔 파이프라인 위저드
- 4탭 심층 분석 모드 (`/lab`)
- 환자 모바일 앱 (`/m`) + 진료 예약 시트 + PDF 인쇄 + 공유
- 다회 스캔 진행 환자 (최영진, MRN-0006) 시드 데이터
- 위저드/모달 버튼 인라인 패턴 (모든 모니터에서 작동 보장)
- 캐시 헤더 + Plotly chunk pre-warm + wave bundle prefetch (콘솔 진입 즉시 페인트)

## 다운로드 & 합치기 (GitHub 100 MB 파일 한도 회피용 분할)

zip 파일이 133 MB라 GitHub 단일 파일 한도를 넘어, 두 조각으로 분할되어 있습니다.

```bash
# Linux / macOS
cat dental_viz_final_20260603.zip.part_aa \
    dental_viz_final_20260603.zip.part_ab \
    > dental_viz_final_20260603.zip

# Windows (PowerShell)
Get-Content dental_viz_final_20260603.zip.part_aa, \
            dental_viz_final_20260603.zip.part_ab \
  -Raw -Encoding Byte | \
  Set-Content dental_viz_final_20260603.zip -Encoding Byte

# 검증 (선택)
unzip -t dental_viz_final_20260603.zip
```

## 사용법
```bash
unzip dental_viz_final_20260603.zip -d dental_viz
cd dental_viz
cp .env.example .env  # JWT secret + (선택) Anthropic 키 채우기
(cd backend && pip install -r requirements.txt)
(cd frontend && npm install)

# 실행 (터미널 2개)
(cd backend && python -m uvicorn app.main:app --reload --port 8000)
(cd frontend && npm run dev)
# → http://localhost:5173 · doctor@demo.com / doctor123
```

zip 내용은 `git archive HEAD ":!releases/"`로 만든 것이라 `.gitignore`에
등록된 항목(`node_modules/`, `dist/`, `.env`, 디자인 ZIP) + `releases/`
자체는 포함되지 않습니다. 시드 DB(`backend/dental.sqlite` — 환자 6명,
스캔 11건)와 wave bundle(`backend/data/`, 약 165 MB)은 포함되어 별도
시드 작업 없이 바로 실행됩니다.

## 데모 계정
| 이메일 | 비밀번호 | 역할 | 보이는 데이터 |
|---|---|---|---|
| `doctor@demo.com` | `doctor123` | 의사 | **전체 환자 6명** (홍길동·김철수·이영희·박민수·정수아·최영진) |
| `patient2@demo.com` | `patient123` | 환자 (김철수) | 김철수 본인 데이터만 |

⚠️ **동료에게 안내**: 의사 시점으로 환자 목록 전체를 보려면 `doctor@demo.com`으로
로그인해야 합니다. `patient2@demo.com`은 김철수 본인 계정이라 김철수 데이터만 보입니다
(접근 제어가 의도된 동작).

## (선택) Anthropic Claude API 키 설정
AI 임상 어시스턴트를 실제 응답으로 작동시키려면:
1. https://console.anthropic.com/settings/keys 에서 API 키 발급 (월 한도 권장 $10)
2. `.env`의 `DENTAL_ANTHROPIC_API_KEY=sk-ant-...` 채우기
3. 백엔드 재시작

키가 없으면 stub 응답이 반환되어 UI는 정상 동작하지만 실제 Claude 답변은 안 나옵니다.

## 라이브 데모
키 + 데이터 셋업 없이 바로 보고 싶다면: https://dental-wave-viz-willy.fly.dev
- 데모 계정으로 로그인하면 모든 기능 사용 가능
- AI 어시스턴트는 라이브 키 연동되어 실제 답변
