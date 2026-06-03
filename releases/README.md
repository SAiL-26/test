# Releases — Dental Wave Viz 최종본

## 다운로드 & 합치기 (GitHub 100 MB 파일 한도 회피용 분할)

zip 파일이 133 MB로 GitHub 단일 파일 한도를 넘어, 두 조각으로 분할되어 있습니다.

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

zip 내용은 `git archive HEAD`로 만든 것이므로, `.gitignore`에 등록된 항목
(`node_modules/`, `dist/`, `.env`, 디자인 ZIP)은 포함되지 않습니다.
시드 DB(`backend/dental.sqlite` — 환자 6명, 스캔 11건)와 wave bundle(`backend/data/`,
약 165 MB)은 포함되어 별도 시드 작업 없이 바로 실행됩니다.

## 데모 계정
| 이메일 | 비밀번호 | 역할 | 보이는 데이터 |
|---|---|---|---|
| `doctor@demo.com` | `doctor123` | 의사 | **전체 환자 6명** (홍길동·김철수·이영희·박민수·정수아·최영진) |
| `patient2@demo.com` | `patient123` | 환자 (김철수) | 김철수 본인 데이터만 |

⚠️ **동료에게 안내**: 의사 시점으로 환자 목록 전체를 보려면 `doctor@demo.com`으로
로그인해야 합니다. `patient2@demo.com`은 김철수 본인 계정이라 김철수 데이터만 보입니다
(접근 제어가 의도된 동작).
