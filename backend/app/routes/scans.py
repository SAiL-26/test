from __future__ import annotations
import json
import re
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import select

from ..config import settings
from ..db import get_db
from ..deps import get_current_user, require_doctor
from ..models import Scan, Patient, Detection, User, UserRole
from ..schemas import ScanOut, ScanDetailOut, DetectionOut, ReviewIn

router = APIRouter(prefix="/scans", tags=["scans"])

SAFE_NAME = re.compile(r"^[a-zA-Z0-9_.\-]+$")


def _check_scan_access(scan: Scan, user: User) -> None:
    p = scan.patient
    if user.role == UserRole.doctor:
        if p.doctor_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not your patient")
    else:
        if p.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not your record")


def _bundle_meta(bundle_dir: str) -> dict:
    p = settings.data_dir / bundle_dir / "meta.json"
    if not p.is_file():
        return {}
    try:
        return json.loads(p.read_text())
    except Exception:
        return {}


@router.get("", response_model=list[ScanOut])
def list_scans(
    patient_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Scan).join(Patient)
    if user.role == UserRole.doctor:
        stmt = stmt.where(Patient.doctor_id == user.id)
    else:
        stmt = stmt.where(Patient.user_id == user.id)
    if patient_id is not None:
        stmt = stmt.where(Scan.patient_id == patient_id)
    stmt = stmt.order_by(Scan.scan_date.desc())
    scans = db.execute(stmt).scalars().all()
    return scans


@router.get("/{scan_id}", response_model=ScanDetailOut)
def get_scan(
    scan_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scan not found")
    _check_scan_access(scan, user)
    detection_out = DetectionOut.model_validate(scan.detection) if scan.detection else None
    return ScanDetailOut(
        id=scan.id,
        patient_id=scan.patient_id,
        scan_date=scan.scan_date,
        status=scan.status.value,
        scenario_tag=scan.scenario_tag.value,
        notes=scan.notes,
        bundle_dir=scan.bundle_dir,
        created_at=scan.created_at,
        detection=detection_out,
        patient_name=scan.patient.full_name,
        bundle_meta=_bundle_meta(scan.bundle_dir),
    )


@router.get("/{scan_id}/bundle/{filename}")
def get_scan_bundle_file(
    scan_id: int,
    filename: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not SAFE_NAME.match(filename):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "invalid filename")
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scan not found")
    _check_scan_access(scan, user)
    path = (settings.data_dir / scan.bundle_dir / filename).resolve()
    if settings.data_dir.resolve() not in path.parents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "path outside data dir")
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "bundle file not found")
    media = "application/json" if filename.endswith(".json") else "application/octet-stream"
    return FileResponse(path, media_type=media)


@router.post("/{scan_id}/review", response_model=DetectionOut)
def review_scan(
    scan_id: int,
    body: ReviewIn,
    doctor: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    scan = db.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "scan not found")
    if scan.patient.doctor_id != doctor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your patient")
    if not scan.detection:
        raise HTTPException(status.HTTP_409_CONFLICT, "no detection to review")
    scan.detection.doctor_review = body.review
    db.commit()
    db.refresh(scan.detection)
    return DetectionOut.model_validate(scan.detection)
