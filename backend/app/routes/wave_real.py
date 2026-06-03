"""Real wave-propagation visualization endpoints.

Mounted under /api/wave/*. Read-only loaders over precomputed binary artifacts
(Vs model, snapshots, seismograms, MCMC traces, energy profiles).
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from .. import wave_data as wd

router = APIRouter(prefix="/wave", tags=["wave"])


@router.get("/metadata")
def metadata() -> dict:
    return {
        "projectTitle": "공개 치과 데이터를 활용한 파동 기반 치은 병변 탐지 과정의 인터랙티브 웹 시각화 시스템",
        "modelShape": wd.MODEL_SHAPE,
        "tissueValues": wd.TISSUE_VALUES,
        "snapshotTimes": wd.SNAPSHOT_TIMES,
        "cases": {
            cid: {"label": cfg["label"], "available": wd.case_available(cid)}
            for cid, cfg in wd.CASE_CONFIG.items()
        },
        "seismogramDtS": wd.SEISMOGRAM_DT_S,
        "seismogramNt": wd.SEISMOGRAM_NT_TOTAL,
        "seismogramNRecv": wd.SEISMOGRAM_N_RECEIVERS,
    }


@router.get("/model/info")
def model_info() -> dict:
    try:
        return wd.model_info()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/model/raw")
def model_raw() -> FileResponse:
    if not wd.MODEL_FILE.exists():
        raise HTTPException(status_code=404, detail="Vs model file not found")
    return FileResponse(
        path=wd.MODEL_FILE,
        filename=wd.MODEL_FILE.name,
        media_type="application/octet-stream",
    )


@router.get("/snapshot/grid")
def snapshot_grid(
    time: str = Query("07500"),
    max_rows: int = Query(96, ge=32, le=415),
    max_cols: int = Query(96, ge=32, le=415),
    case: int = Query(1, ge=1, le=4),
) -> dict:
    try:
        return wd.snapshot_grid(time=time, max_rows=max_rows, max_cols=max_cols, case_id=case)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/seismogram/summary")
def seismogram_summary(case: int = Query(1, ge=1, le=4)) -> dict:
    try:
        return wd.seismogram_summary(case_id=case)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/seismogram/gather")
def seismogram_gather(
    max_time_rows: int = Query(600, ge=100, le=2000),
    case: int = Query(1, ge=1, le=4),
) -> dict:
    try:
        return wd.seismogram_gather(max_time_rows=max_time_rows, case_id=case)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/screening/surface")
def screening_surface(
    max_rows: int = Query(96, ge=32, le=180),
    max_cols: int = Query(96, ge=32, le=180),
    case: int = Query(1, ge=1, le=4),
) -> dict:
    try:
        return wd.screening_surface(max_rows=max_rows, max_cols=max_cols, case_id=case)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/velocity-slice")
def velocity_slice(case: int = Query(1, ge=1, le=4)) -> dict:
    try:
        return wd.velocity_slice_z9(case_id=case)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/mcmc/background")
def mcmc_background() -> dict:
    try:
        return wd.mcmc_background()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/tissue/full-mesh")
def tissue_full_mesh(step: int = Query(8, ge=2, le=16)) -> dict:
    """Tissue surface meshes extracted from the full Vs volume (subsampled).

    Used by the 3D wavefield overlay so the wave snapshot surface is rendered
    in the same scene as gingiva/bone/tooth meshes. `step` controls XY
    subsampling — higher = smaller payload, less detail.
    """
    try:
        return wd.tissue_full_mesh(step=step)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/mcmc/trace")
def mcmc_trace(case: int = Query(1, ge=1, le=4)) -> dict:
    try:
        return wd.mcmc_trace(case_id=case)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/energy-profile")
def energy_profile(case: int = Query(1, ge=1, le=4)) -> dict:
    try:
        return wd.energy_profile(case_id=case)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
