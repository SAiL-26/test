"""Add (or refresh) a single multi-scan progression patient.

Idempotent: safe to re-run. Patient MRN-0006 (최영진) gets 5 chronological
scans showing severity climbing from baseline → probable lesion. Each scan
reuses the existing shared seismic bundle (symlinks into _shared) but has
its own meta.json with the per-visit scenario tag.

Why this exists: R5a feedback — clinicians want a single case that visibly
demonstrates the lesion progressing across visits.

Usage:
    cd backend && python scripts/seed_progression_patient.py
"""
from __future__ import annotations
import json
import os
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import (
    Detection, Patient, Scan, ScanStatus, ScenarioTag, User, UserRole,
)


# ── target patient ────────────────────────────────────────────────────────
PATIENT_MRN = "MRN-0006"
PATIENT_NAME = "최영진"
PATIENT_DOB = date(1971, 2, 18)   # ~55 세 (2026)
PATIENT_SEX = "M"
PATIENT_NOTES = (
    "흡연력 25년. 좌측 하악 둔통 호소. 6주~3개월 간격 단기 추적 관찰 케이스. "
    "병변 진행 추세 시연용 데모 환자."
)

# ── progression timeline ─────────────────────────────────────────────────
# Each entry → its own scan row + detection. Lesion centroid drifts slightly
# and severity climbs scan by scan. estimate_(x,y,z)_mm are in scan frame.
# The bundle scenario controls residual data shown in the wave viewer.
PROGRESSION = [
    {
        "scan_id": 7,  "scan_date": date(2025, 8, 15), "scenario": "healthy",
        "severity": 0.05, "residual": 0.002, "recv_idx": 0,
        "est_mm": (14.80, 19.95, 0.50),
        "model": "wave-screen-v0.1",
        "review": "정기 검진 baseline — 특이 소견 없음.",
    },
    {
        "scan_id": 8,  "scan_date": date(2025, 11, 20), "scenario": "healthy",
        "severity": 0.18, "residual": 0.018, "recv_idx": 42,
        "est_mm": (15.05, 20.20, 0.50),
        "model": "wave-screen-v0.1",
        "review": "잔차 미세 증가. 임상적 의미는 낮으나 6개월 후 추적 권고.",
    },
    {
        "scan_id": 9,  "scan_date": date(2026, 2, 10),  "scenario": "inf70",
        "severity": 0.42, "residual": 0.083, "recv_idx": 51,
        "est_mm": (15.45, 20.62, 0.50),
        "model": "wave-screen-v0.2",
        "review": "경계성 — 좌측 어금니부에서 일관된 RMS 잔차 패턴 출현.",
    },
    {
        "scan_id": 10, "scan_date": date(2026, 4, 25),  "scenario": "inf70",
        "severity": 0.65, "residual": 0.142, "recv_idx": 53,
        "est_mm": (15.92, 21.10, 0.50),
        "model": "wave-screen-v0.2",
        "review": "의심 소견 — 잔차 진폭 및 공간 일관성 모두 증가. 단기 재스캔 권고.",
    },
    {
        "scan_id": 11, "scan_date": date(2026, 5, 30),  "scenario": "inf80",
        "severity": 0.84, "residual": 0.231, "recv_idx": 55,
        "est_mm": (16.48, 21.78, 0.50),
        "model": "wave-screen-v0.3",
        "review": "병변 가능성 높음 — 전문의 의뢰 및 영상 정밀 검사 필요.",
    },
]

SHARED_DIR = settings.data_dir / "scans" / "_shared"
SHARED_FILES = [
    "slice_vp.bin", "slice_vs.bin", "slice_rho.bin", "lesion_mask.bin",
    "wavefield.bin",
    "seis_healthy.bin", "seis_inf70.bin", "seis_inf80.bin",
    "residual_inf70.bin", "residual_inf80.bin",
]

SUMMARY_BY_SCENARIO = {
    "healthy": "정상 — 잔차 패턴 없음.",
    "inf70":   "조기 염증 추정 — 수신기별 RMS 잔차 패턴이 일관된 공간적 분포.",
    "inf80":   "진행성 염증 추정 — ⚠ 시뮬레이션이 수치적 불안정성 영역 포함 (Vs 80% 감소).",
}


def ensure_bundle(scan_id: int, scenario: str) -> str:
    """Create scan_{id}/ dir, symlink shared files, write per-visit meta.json.

    Returns the relative bundle_dir to store in DB (matches existing rows).
    """
    rel = f"scans/scan_{scan_id:03d}"
    scan_dir = settings.data_dir / rel
    scan_dir.mkdir(parents=True, exist_ok=True)

    # link shared bin files (idempotent: replace if missing/stale)
    for fn in SHARED_FILES:
        src = (SHARED_DIR / fn).resolve()
        dst = scan_dir / fn
        if not src.is_file():
            raise FileNotFoundError(
                f"shared asset missing: {src} — run scripts/prep_scans.py first"
            )
        if dst.is_symlink() or dst.exists():
            dst.unlink()
        os.symlink(src, dst)

    # write meta.json based on the shared meta block
    shared_meta_path = SHARED_DIR / "shared_meta.json"
    if not shared_meta_path.is_file():
        raise FileNotFoundError(
            f"missing {shared_meta_path} — run scripts/prep_scans.py first"
        )
    meta = json.loads(shared_meta_path.read_text())
    meta["scan_id"] = f"scan_{scan_id:03d}"
    meta["scenario_tag"] = scenario
    meta["actual_seismogram"] = f"seis_{scenario}.bin"
    meta["summary"] = SUMMARY_BY_SCENARIO[scenario]
    (scan_dir / "meta.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False)
    )
    return rel


def find_demo_doctor(db) -> User:
    doc = db.scalar(select(User).where(User.role == UserRole.doctor))
    if not doc:
        raise RuntimeError(
            "no doctor user found — run scripts/seed_db.py first to seed base demo data"
        )
    return doc


def upsert_patient(db, doctor: User) -> Patient:
    patient = db.scalar(select(Patient).where(Patient.mrn == PATIENT_MRN))
    if patient is None:
        patient = Patient(
            mrn=PATIENT_MRN,
            full_name=PATIENT_NAME,
            dob=PATIENT_DOB,
            sex=PATIENT_SEX,
            doctor_id=doctor.id,
            user_id=None,
            notes=PATIENT_NOTES,
        )
        db.add(patient)
        db.flush()
        print(f"  + created patient {PATIENT_MRN} ({PATIENT_NAME}) id={patient.id}")
    else:
        patient.full_name = PATIENT_NAME
        patient.dob = PATIENT_DOB
        patient.sex = PATIENT_SEX
        patient.notes = PATIENT_NOTES
        patient.doctor_id = doctor.id
        print(f"  · patient {PATIENT_MRN} already exists, refreshed metadata (id={patient.id})")
    return patient


def upsert_scan_with_detection(db, patient: Patient, spec: dict) -> None:
    bundle_dir = ensure_bundle(spec["scan_id"], spec["scenario"])
    scenario_tag = ScenarioTag[spec["scenario"]]

    # Match by (patient_id, scan_date) — natural progression key.
    scan = db.scalar(
        select(Scan)
        .where(Scan.patient_id == patient.id)
        .where(Scan.scan_date == spec["scan_date"])
    )
    if scan is None:
        scan = Scan(
            patient_id=patient.id,
            scan_date=spec["scan_date"],
            status=ScanStatus.completed,
            scenario_tag=scenario_tag,
            notes=None,
            bundle_dir=bundle_dir,
            source_dat=(
                f"fin_30khz_shot60_염증"
                f"{'0' if spec['scenario'] == 'healthy' else spec['scenario'][3:]}.dat"
            ),
        )
        db.add(scan)
        db.flush()
        verb = "+"
    else:
        scan.scenario_tag = scenario_tag
        scan.status = ScanStatus.completed
        scan.bundle_dir = bundle_dir
        verb = "·"

    det = scan.detection
    if det is None:
        det = Detection(scan_id=scan.id)
        db.add(det)
    det.candidate_recv_idx = spec["recv_idx"]
    det.candidate_residual = float(spec["residual"])
    det.estimate_x_mm = float(spec["est_mm"][0])
    det.estimate_y_mm = float(spec["est_mm"][1])
    det.estimate_z_mm = float(spec["est_mm"][2])
    det.severity_score = float(spec["severity"])
    det.model_version = spec["model"]
    det.doctor_review = spec["review"]

    pct = int(round(spec["severity"] * 100))
    print(
        f"  {verb} scan_{spec['scan_id']:03d}  {spec['scan_date']}  "
        f"{spec['scenario']:7s}  sev={pct}%  est=({spec['est_mm'][0]:.2f}, "
        f"{spec['est_mm'][1]:.2f}, {spec['est_mm'][2]:.2f}) mm"
    )


def main() -> None:
    db = SessionLocal()
    try:
        doctor = find_demo_doctor(db)
        patient = upsert_patient(db, doctor)
        for spec in PROGRESSION:
            upsert_scan_with_detection(db, patient, spec)
        db.commit()
        print(
            f"\nprogression seed complete — {PATIENT_NAME} ({PATIENT_MRN}) "
            f"has {len(PROGRESSION)} scans."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
