"""Preprocess raw research data into per-scan bundles.

Layout produced:
  backend/data/scans/
    _shared/                  ← all binary data (shared across scans)
      slice_{vp,vs,rho}.bin
      lesion_mask.bin
      wavefield.bin
      seis_{healthy,inf70,inf80}.bin
      residual_{inf70,inf80}.bin
    scan_001/
      meta.json              ← scan-specific metadata
      (symlinks → ../_shared/*.bin)
    scan_002/...

Scan definitions live in scan_definitions.json (auto-created if missing).
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import numpy as np

ROOT = Path("/home/willy010313/Chronic")
BACKEND = ROOT / "dental_viz" / "backend"
OUT_ROOT = BACKEND / "data" / "scans"
SHARED = OUT_ROOT / "_shared"

INNER_NX, INNER_NY, INNER_NZ = 308, 415, 17
PML = 40
NX_FULL, NY_FULL = INNER_NX + 2 * PML, INNER_NY + 2 * PML
DX = 6.25e-5
DT = 0.4e-8
NT_OBS = 75000
NRECV = 100
SHOT_IDX_SEIS = 60
SHOT_IDX_SNAP = 80
RECV_Z = 8

RECV_COORDS = [
    (5,247),(9,248),(13,250),(17,250),(21,251),(25,252),(29,253),(33,254),
    (37,255),(41,255),(45,255),(49,255),(53,255),(57,255),(61,255),(65,254),
    (69,254),(73,252),(77,251),(81,250),(85,249),(89,248),(93,246),(97,246),
    (101,246),(105,246),(109,246),(113,247),(117,247),(121,248),(125,248),(129,248),
    (133,248),(137,248),(141,247),(145,247),(149,247),(153,248),(157,249),(161,249),
    (165,249),(169,249),(173,249),(177,249),(181,250),(185,251),(189,250),(193,250),
    (197,250),(201,250),(205,250),(209,249),(213,249),(217,249),(221,250),(225,251),
    (229,252),(233,252),(237,253),(241,253),(245,254),(249,254),(253,254),(257,253),
    (261,253),(265,253),(269,254),(273,255),(277,254),(281,253),(285,253),(289,253),
    (293,253),(297,253),(301,252),(305,251),(309,250),(313,249),(317,248),(321,247),
    (325,247),(329,245),(333,244),(337,243),(341,242),(345,241),(349,240),(353,239),
    (357,238),(361,238),(365,238),(369,238),(373,238),(377,237),(381,237),(385,237),
    (389,236),(393,237),(397,237),(401,237),
]

VOL_DIR = ROOT / "모델링_공유"
SNAP_DIR = ROOT / "modeling_run" / "results" / "snap"
SEIS_DIR = ROOT / "Seismogram 전달용"

SCENARIOS = {
    "healthy":  "fin_30khz_shot60_염증0.dat",
    "inf70":    "fin_30khz_shot60_염증70.dat",
    "inf80":    "fin_30khz_shot60_염증80.dat",
}


def load_vol(fn: str) -> np.ndarray:
    raw = np.fromfile(VOL_DIR / fn, dtype=np.float32)
    return raw.reshape(INNER_NY, INNER_NX, INNER_NZ)


def build_shared() -> dict:
    """Run the heavy preprocessing once. Returns the shared meta block."""
    SHARED.mkdir(parents=True, exist_ok=True)
    print(f"[shared] {SHARED}")

    # --- volume slices ---
    vp = load_vol("0311_vp_topo.bin")
    vs = load_vol("0311_vs_infection80_topo.bin")
    rho = load_vol("0309_rho_up.bin")
    slice_meta = {}
    for name, vol in [("vp", vp), ("vs", vs), ("rho", rho)]:
        sl = vol[:, :, RECV_Z].astype(np.float32)
        sl.tofile(SHARED / f"slice_{name}.bin")
        slice_meta[name] = {
            "shape": list(sl.shape), "dtype": "float32",
            "min": float(sl.min()), "max": float(sl.max()),
            "mean": float(sl.mean()),
        }

    # lesion mask (bottom 8% Vs cells = explicit inserted region)
    vs_z = vs[:, :, RECV_Z]
    nonzero = vs_z[vs_z > 0.02]
    thr = np.percentile(nonzero, 8.0)
    mask = ((vs_z > 0.02) & (vs_z < thr)).astype(np.uint8)
    mask.tofile(SHARED / "lesion_mask.bin")
    ys, xs = np.where(mask > 0)
    lesion_centroid = (int(ys.mean()), int(xs.mean())) if len(xs) else (0, 0)

    # --- wavefield snapshots ---
    files = sorted(SNAP_DIR.glob("snapshot_t*_srcx_000.bin"))
    DSAMPLE = 2
    sample = np.fromfile(files[0], dtype=np.float32).reshape(NY_FULL, NX_FULL)
    sample_inner = sample[PML:PML+INNER_NY, PML:PML+INNER_NX][::DSAMPLE, ::DSAMPLE]
    NY_DS, NX_DS = sample_inner.shape
    frames = np.empty((len(files), NY_DS, NX_DS), dtype=np.float32)
    for i, f in enumerate(files):
        a = np.fromfile(f, dtype=np.float32).reshape(NY_FULL, NX_FULL)
        inner = a[PML:PML+INNER_NY, PML:PML+INNER_NX]
        frames[i] = inner[::DSAMPLE, ::DSAMPLE]
    vmax = float(np.percentile(np.abs(frames), 99.5))
    q = (np.clip(frames / max(vmax, 1e-30), -1.0, 1.0) * 127).astype(np.int8)
    q.tofile(SHARED / "wavefield.bin")
    frame_t_idx = [int(f.name.split("_t")[1].split("_")[0]) for f in files]

    # --- seismograms (3 scenarios) ---
    T_DS = 75
    NT_DS = NT_OBS // T_DS
    seis_meta = {}
    seis_arr = {}
    for tag, fn in SCENARIOS.items():
        raw = np.fromfile(SEIS_DIR / fn, dtype=np.float32)
        arr = raw.reshape(NT_OBS, NRECV)
        ds = arr[::T_DS, :].T.astype(np.float32)
        seis_arr[tag] = arr
        vmax_s = float(np.percentile(np.abs(ds), 99.5))
        qs = (np.clip(ds / max(vmax_s, 1e-30), -1.0, 1.0) * 32767).astype(np.int16)
        qs.tofile(SHARED / f"seis_{tag}.bin")
        seis_meta[tag] = {"shape": list(ds.shape), "dtype": "int16", "vmax": vmax_s, "t_decimation": T_DS}

    # residuals
    h = seis_arr["healthy"]
    residuals = {}
    for tag in ["inf70", "inf80"]:
        diff = seis_arr[tag] - h
        res = np.sqrt((diff ** 2).mean(axis=0)).astype(np.float32)
        res.tofile(SHARED / f"residual_{tag}.bin")
        residuals[tag] = res

    shared_meta = {
        "grid": {
            "NX": INNER_NX, "NY": INNER_NY, "NZ": INNER_NZ,
            "NX_ds": NX_DS, "NY_ds": NY_DS, "downsample": DSAMPLE,
        },
        "spacing_mm": DX * 1e3,
        "extent_mm": {
            "x": INNER_NX * DX * 1e3,
            "y": INNER_NY * DX * 1e3,
            "z": INNER_NZ * DX * 1e3,
        },
        "time": {
            "NT": NT_OBS, "DT_s": DT, "T_total_us": NT_OBS * DT * 1e6,
            "NT_ds": NT_DS, "t_decimation": T_DS,
        },
        "geometry": {
            "shot_idx_seismogram": SHOT_IDX_SEIS,
            "shot_idx_snapshot": SHOT_IDX_SNAP,
            "recv_z": RECV_Z,
            "num_recv": NRECV,
            "recv_coords_yx": RECV_COORDS,
            "lesion_centroid_yx": list(lesion_centroid),
        },
        "slices": slice_meta,
        "lesion_mask": {"shape": list(mask.shape), "dtype": "uint8", "n_cells": int(mask.sum())},
        "wavefield": {
            "shape": [len(files), NY_DS, NX_DS], "dtype": "int8", "vmax": vmax,
            "frame_t_idx": frame_t_idx,
            "frame_t_us": [t * DT * 1e6 for t in frame_t_idx],
        },
        "seismograms": {
            "scenarios": list(SCENARIOS.keys()),
            "files": seis_meta,
        },
        "residual_max": {tag: float(r.max()) for tag, r in residuals.items()},
        "residual_argmax": {tag: int(r.argmax()) for tag, r in residuals.items()},
    }
    (SHARED / "shared_meta.json").write_text(json.dumps(shared_meta, indent=2, ensure_ascii=False))
    return shared_meta


SHARED_FILES = [
    "slice_vp.bin", "slice_vs.bin", "slice_rho.bin", "lesion_mask.bin",
    "wavefield.bin",
    "seis_healthy.bin", "seis_inf70.bin", "seis_inf80.bin",
    "residual_inf70.bin", "residual_inf80.bin",
]


def link_shared_into(scan_dir: Path):
    for fn in SHARED_FILES:
        src = (SHARED / fn).resolve()
        dst = scan_dir / fn
        if dst.is_symlink() or dst.exists():
            dst.unlink()
        os.symlink(src, dst)


def write_scan_meta(scan_dir: Path, scan_id: str, scenario: str, shared_meta: dict):
    """Compose per-scan meta.json: shared content + scenario-specific bits."""
    meta = dict(shared_meta)
    meta["scan_id"] = scan_id
    meta["scenario_tag"] = scenario
    meta["actual_seismogram"] = f"seis_{scenario}.bin"
    # add a brief, human-readable summary
    meta["summary"] = {
        "healthy":  "정상 — 잔차 패턴 없음.",
        "inf70":    "조기 염증 추정 — 수신기별 RMS 잔차 패턴이 일관된 공간적 분포.",
        "inf80":    "진행성 염증 추정 — ⚠ 시뮬레이션이 수치적 불안정성 영역 포함 (Vs 80% 감소).",
    }[scenario]
    (scan_dir / "meta.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))


def build_scan_bundles(scan_specs: list[dict], shared_meta: dict):
    """scan_specs: [{id: int, scenario: 'healthy'|'inf70'|'inf80'}, ...]"""
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    for spec in scan_specs:
        scan_id = f"scan_{spec['id']:03d}"
        scan_dir = OUT_ROOT / scan_id
        scan_dir.mkdir(parents=True, exist_ok=True)
        link_shared_into(scan_dir)
        write_scan_meta(scan_dir, scan_id, spec["scenario"], shared_meta)
        print(f"  built {scan_id} ({spec['scenario']})")


# canonical scan list used by seed_db too
DEFAULT_SCANS = [
    {"id": 1, "scenario": "healthy"},
    {"id": 2, "scenario": "healthy"},  # patient 2 prior visit
    {"id": 3, "scenario": "inf70"},    # patient 2 follow-up
    {"id": 4, "scenario": "inf70"},
    {"id": 5, "scenario": "inf80"},
    {"id": 6, "scenario": "healthy"},
]


def main():
    sm_path = SHARED / "shared_meta.json"
    if sm_path.is_file():
        print("[shared] meta exists, skipping heavy preprocessing")
        shared_meta = json.loads(sm_path.read_text())
    else:
        shared_meta = build_shared()
    print("[scans]")
    build_scan_bundles(DEFAULT_SCANS, shared_meta)
    total_bytes = sum(p.stat().st_size for p in SHARED.iterdir() if p.is_file())
    print(f"\nshared bytes: {total_bytes/1024/1024:.2f} MB")
    print(f"scans created: {len(DEFAULT_SCANS)}")


if __name__ == "__main__":
    main()
