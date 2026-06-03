from __future__ import annotations
from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- auth ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)
    id: int
    email: EmailStr
    full_name: str
    role: str


TokenOut.model_rebuild()


# ---------- patient ----------
class PatientBase(BaseModel):
    mrn: str
    full_name: str
    dob: date
    sex: Literal["M", "F", "O"]
    notes: str | None = None


class PatientCreate(PatientBase):
    pass


class PatientOut(PatientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    doctor_id: int
    user_id: int | None
    created_at: datetime
    scan_count: int = 0
    latest_severity: float | None = None
    latest_scan_date: date | None = None


# ---------- scan ----------
class ScanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    patient_id: int
    scan_date: date
    status: str
    scenario_tag: str
    notes: str | None
    bundle_dir: str
    created_at: datetime


class DetectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    scan_id: int
    candidate_recv_idx: int
    candidate_residual: float
    estimate_x_mm: float
    estimate_y_mm: float
    estimate_z_mm: float
    severity_score: float
    model_version: str
    doctor_review: str | None
    computed_at: datetime


class ScanDetailOut(ScanOut):
    detection: DetectionOut | None = None
    patient_name: str | None = None
    bundle_meta: dict = Field(default_factory=dict)


class ReviewIn(BaseModel):
    review: str
