from __future__ import annotations
import enum
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy import String, Integer, ForeignKey, DateTime, Date, Float, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class UserRole(str, enum.Enum):
    doctor = "doctor"
    patient = "patient"


class ScanStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class ScenarioTag(str, enum.Enum):
    healthy = "healthy"
    inf70 = "inf70"
    inf80 = "inf80"


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patients: Mapped[List["Patient"]] = relationship(
        back_populates="doctor", foreign_keys="Patient.doctor_id"
    )
    patient_profile: Mapped[Optional["Patient"]] = relationship(
        back_populates="user", foreign_keys="Patient.user_id", uselist=False
    )


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[int] = mapped_column(primary_key=True)
    mrn: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    dob: Mapped[date] = mapped_column(Date)
    sex: Mapped[str] = mapped_column(String(1))
    doctor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    doctor: Mapped["User"] = relationship(back_populates="patients", foreign_keys=[doctor_id])
    user: Mapped[Optional["User"]] = relationship(back_populates="patient_profile", foreign_keys=[user_id])
    scans: Mapped[List["Scan"]] = relationship(back_populates="patient", cascade="all, delete-orphan")


class Scan(Base):
    __tablename__ = "scans"
    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    scan_date: Mapped[date] = mapped_column(Date)
    status: Mapped[ScanStatus] = mapped_column(Enum(ScanStatus), default=ScanStatus.completed)
    scenario_tag: Mapped[ScenarioTag] = mapped_column(Enum(ScenarioTag))
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bundle_dir: Mapped[str] = mapped_column(String(255))
    source_dat: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient: Mapped["Patient"] = relationship(back_populates="scans")
    detection: Mapped[Optional["Detection"]] = relationship(
        back_populates="scan", cascade="all, delete-orphan", uselist=False
    )


class Detection(Base):
    __tablename__ = "detections"
    id: Mapped[int] = mapped_column(primary_key=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), unique=True)
    candidate_recv_idx: Mapped[int] = mapped_column(Integer)
    candidate_residual: Mapped[float] = mapped_column(Float)
    estimate_x_mm: Mapped[float] = mapped_column(Float)
    estimate_y_mm: Mapped[float] = mapped_column(Float)
    estimate_z_mm: Mapped[float] = mapped_column(Float)
    severity_score: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(64))
    doctor_review: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    scan: Mapped["Scan"] = relationship(back_populates="detection")
