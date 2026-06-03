from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from ..db import get_db
from ..deps import get_current_user, require_doctor
from ..models import Patient, Scan, Detection, User, UserRole
from ..schemas import PatientOut, PatientCreate

router = APIRouter(prefix="/patients", tags=["patients"])


def _patient_to_out(p: Patient, db: Session) -> PatientOut:
    scans = sorted(p.scans, key=lambda s: s.scan_date, reverse=True)
    latest_scan_date = scans[0].scan_date if scans else None
    latest_severity = None
    if scans and scans[0].detection:
        latest_severity = scans[0].detection.severity_score
    return PatientOut(
        id=p.id,
        mrn=p.mrn,
        full_name=p.full_name,
        dob=p.dob,
        sex=p.sex,
        notes=p.notes,
        doctor_id=p.doctor_id,
        user_id=p.user_id,
        created_at=p.created_at,
        scan_count=len(scans),
        latest_severity=latest_severity,
        latest_scan_date=latest_scan_date,
    )


@router.get("", response_model=list[PatientOut])
def list_patients(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user.role == UserRole.doctor:
        stmt = select(Patient).where(Patient.doctor_id == user.id)
    else:
        stmt = select(Patient).where(Patient.user_id == user.id)
    patients = db.execute(stmt).scalars().all()
    return [_patient_to_out(p, db) for p in patients]


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(
    patient_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = db.get(Patient, patient_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "patient not found")
    if user.role == UserRole.doctor:
        if p.doctor_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not your patient")
    else:
        if p.user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "not your record")
    return _patient_to_out(p, db)


@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    body: PatientCreate,
    doctor: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    existing = db.execute(select(Patient).where(Patient.mrn == body.mrn)).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "MRN already exists")
    p = Patient(**body.model_dump(), doctor_id=doctor.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _patient_to_out(p, db)
