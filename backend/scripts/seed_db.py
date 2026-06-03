"""Seed demo data: 1 doctor + 5 patients + 6 scans + detections.

Idempotent: deletes & recreates everything to give a clean demo state.
Run AFTER prep_scans.py.
"""
from __future__ import annotations
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# allow running as a script from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from sqlalchemy import delete

from app.auth import hash_password
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import (
    User, UserRole, Patient, Scan, ScanStatus, ScenarioTag, Detection,
)


DEMO_DOCTOR_EMAIL = "doctor@demo.com"
DEMO_PATIENT_EMAIL = "patient2@demo.com"   # patient #2 (김철수) has a login

PATIENTS = [
    {
        "id": 1, "mrn": "MRN-0001", "name": "홍길동", "dob": date(1990, 3, 5), "sex": "M",
        "notes": "정기 검진. 특이 소견 없음.",
        "scans": [{"id": 1, "scenario": "healthy", "scan_date": date(2026, 4, 12)}],
    },
    {
        "id": 2, "mrn": "MRN-0002", "name": "김철수", "dob": date(1973, 11, 22), "sex": "M",
        "notes": "치주염 가족력. 6개월 간격 추적 관찰.",
        "scans": [
            {"id": 2, "scenario": "healthy", "scan_date": date(2025, 11, 4)},
            {"id": 3, "scenario": "inf70",   "scan_date": date(2026, 5,  1)},
        ],
        "has_login": True,
    },
    {
        "id": 3, "mrn": "MRN-0003", "name": "이영희", "dob": date(1984, 7, 14), "sex": "F",
        "notes": "최근 우측 어금니 부위 불편감 호소.",
        "scans": [{"id": 4, "scenario": "inf70", "scan_date": date(2026, 4, 28)}],
    },
    {
        "id": 4, "mrn": "MRN-0004", "name": "박민수", "dob": date(1965, 1, 9), "sex": "M",
        "notes": "흡연 30년. 잇몸 출혈 빈발.",
        "scans": [{"id": 5, "scenario": "inf80", "scan_date": date(2026, 5, 9)}],
    },
    {
        "id": 5, "mrn": "MRN-0005", "name": "정수아", "dob": date(1997, 9, 30), "sex": "F",
        "notes": "건강검진 목적 방문.",
        "scans": [{"id": 6, "scenario": "healthy", "scan_date": date(2026, 5, 12)}],
    },
]


# detection severity per scenario
SEVERITY = {"healthy": 0.05, "inf70": 0.62, "inf80": 0.89}


def compute_detection_from_bundle(scan_dir: Path, scenario: str) -> dict:
    """Compute candidate receiver + estimate location from the residual data."""
    meta = json.loads((scan_dir / "meta.json").read_text())
    spacing_mm = meta["spacing_mm"]
    recv_yx = meta["geometry"]["recv_coords_yx"]
    lesion_yx = meta["geometry"]["lesion_centroid_yx"]

    if scenario == "healthy":
        peak_idx = 0
        peak_val = 0.0
    else:
        tag = scenario
        res = np.fromfile(scan_dir / f"residual_{tag}.bin", dtype=np.float32)
        peak_idx = int(res.argmax())
        peak_val = float(res[peak_idx])

    # estimate = lesion centroid + slight noise (deterministic per scan)
    rng = np.random.default_rng(seed=hash(scan_dir.name) & 0xFFFF)
    est_y = (lesion_yx[0] + rng.normal(0, 1.5)) * spacing_mm
    est_x = (lesion_yx[1] + rng.normal(0, 1.5)) * spacing_mm
    est_z = (meta["geometry"]["recv_z"]) * spacing_mm

    return {
        "candidate_recv_idx": peak_idx,
        "candidate_residual": peak_val,
        "estimate_x_mm": float(est_x),
        "estimate_y_mm": float(est_y),
        "estimate_z_mm": float(est_z),
        "severity_score": SEVERITY[scenario],
        "model_version": "wave-screen-v0.1",
    }


def main():
    # fresh DB
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # doctor
        doc = User(
            email=DEMO_DOCTOR_EMAIL,
            password_hash=hash_password("doctor123"),
            full_name="김주영 (Dr. Kim)",
            role=UserRole.doctor,
        )
        db.add(doc)
        db.flush()
        print(f"doctor:  {doc.email}  pw=doctor123  id={doc.id}")

        for spec in PATIENTS:
            user_id = None
            if spec.get("has_login"):
                pu = User(
                    email=DEMO_PATIENT_EMAIL,
                    password_hash=hash_password("patient123"),
                    full_name=spec["name"],
                    role=UserRole.patient,
                )
                db.add(pu)
                db.flush()
                user_id = pu.id
                print(f"patient login: {pu.email}  pw=patient123  → {spec['name']}")

            p = Patient(
                mrn=spec["mrn"],
                full_name=spec["name"],
                dob=spec["dob"],
                sex=spec["sex"],
                doctor_id=doc.id,
                user_id=user_id,
                notes=spec["notes"],
            )
            db.add(p)
            db.flush()

            for s in spec["scans"]:
                bundle_dir = f"scans/scan_{s['id']:03d}"
                full = settings.data_dir / bundle_dir
                assert full.is_dir(), f"bundle missing: {full} — run prep_scans.py first"
                scan = Scan(
                    patient_id=p.id,
                    scan_date=s["scan_date"],
                    status=ScanStatus.completed,
                    scenario_tag=ScenarioTag[s["scenario"]],
                    notes=None,
                    bundle_dir=bundle_dir,
                    source_dat=f"fin_30khz_shot60_염증{'0' if s['scenario']=='healthy' else s['scenario'][3:]}.dat",
                )
                db.add(scan)
                db.flush()

                d_info = compute_detection_from_bundle(full, s["scenario"])
                det = Detection(scan_id=scan.id, **d_info)
                db.add(det)

            print(f"  + {spec['name']} (MRN {spec['mrn']}, {len(spec['scans'])} scan(s))")

        db.commit()
        print("\nseed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
