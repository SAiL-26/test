"""Real wave-propagation data loader (Vs model 415x308x17, snapshots, seismograms, MCMC, energy).

Ported from teammate's pyvista_surface project. Reads precomputed binary artifacts under
backend/data/_shared/wave_real/. Endpoints in routes/wave_real.py wrap these loaders.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "_shared" / "wave_real"
MODEL_FILE = DATA_DIR / "0311_vs_topoeffect.bin"

MCMC_TRUE_VALUES: dict[str, int] = {"x": 19, "y": 28, "z": 8, "r": 7}
SEISMOGRAM_NT_TOTAL = 75000
SEISMOGRAM_N_RECEIVERS = 100
SEISMOGRAM_DT_S = 0.4e-8

# case_id=1 baseline (inflammation 80, full), 2 = position shift (inflammation 70),
# 3 = size change (small radius 9), 4 = custom slot (future precomputed grid bin).
CASE_CONFIG: dict[int, dict] = {
    1: {
        "snapshot_dir": None,
        "snapshot_mod": True,
        "seismogram_file": DATA_DIR / "seismogram_srcx_80_r01000.dat",
        "energy_profile_file": DATA_DIR / "fin_30khz_shot60_염증80_energy_profile_rx62to99.npz",
        "mcmc_trace_file": DATA_DIR / "mcmc_trace_80_use.txt",
        "label": "baseline",
    },
    2: {
        "snapshot_dir": DATA_DIR / "snap" / "70",
        "snapshot_mod": True,
        "seismogram_file": DATA_DIR / "snap" / "70" / "seismogram_srcx_70000.dat",
        "energy_profile_file": DATA_DIR / "fin_30khz_shot60_염증70_energy_profile_rx62to99.npz",
        "mcmc_trace_file": DATA_DIR / "mcmc_trace_70_use.txt",
        "label": "position",
    },
    3: {
        "snapshot_dir": DATA_DIR / "snap" / "80_s9",
        "snapshot_mod": True,
        "seismogram_file": DATA_DIR / "snap" / "80_s9" / "seismogram_srcx_80_s09000.dat",
        "energy_profile_file": DATA_DIR / "fin_30khz_shot60_염증80_small_9_energy_profile_rx62to99_small_9.npz",
        "mcmc_trace_file": DATA_DIR / "mcmc_trace_80_s9.txt",
        "label": "size",
    },
    4: {
        "snapshot_dir": None,
        "snapshot_mod": True,
        "seismogram_file": None,
        "energy_profile_file": None,
        "mcmc_trace_file": None,
        "label": "custom",
    },
}


def case_available(case_id: int) -> bool:
    cfg = CASE_CONFIG.get(case_id)
    if cfg is None:
        return False
    f = cfg.get("seismogram_file")
    return f is not None and Path(f).exists()


def _case_cfg(case_id: int) -> dict:
    cfg = CASE_CONFIG.get(case_id, CASE_CONFIG[1])
    if not case_available(case_id):
        return CASE_CONFIG[1]
    return cfg


MODEL_SHAPE = {"ny": 415, "nx": 308, "nz": 17}
TISSUE_VALUES = {
    "background": 0.01,
    "inflammation": 0.025,
    "gingiva": 0.05,
    "bone": 1.5,
    "tooth": 2.5,
}

SNAPSHOT_TIMES = ["07500", "15000", "22500", "30000", "37500", "45000", "52500", "60000", "67500"]

RECEIVER_COORDS: list[tuple[int, int]] = [
    (5, 247), (9, 248), (13, 250), (17, 250), (21, 251), (25, 252), (29, 253), (33, 254),
    (37, 255), (41, 255), (45, 255), (49, 255), (53, 255), (57, 255), (61, 255), (65, 254),
    (69, 254), (73, 252), (77, 251), (81, 250), (85, 249), (89, 248), (93, 246), (97, 246),
    (101, 246), (105, 246), (109, 246), (113, 247), (117, 247), (121, 248), (125, 248), (129, 248),
    (133, 248), (137, 248), (141, 247), (145, 247), (149, 247), (153, 248), (157, 249), (161, 249),
    (165, 249), (169, 249), (173, 249), (177, 249), (181, 250), (185, 251), (189, 250), (193, 250),
    (197, 250), (201, 250), (205, 250), (209, 249), (213, 249), (217, 249), (221, 250), (225, 251),
    (229, 252), (233, 252), (237, 253), (241, 253), (245, 254), (249, 254), (253, 254), (257, 253),
    (261, 253), (265, 253), (269, 254), (273, 255), (277, 254), (281, 253), (285, 253), (289, 253),
    (293, 253), (297, 253), (301, 252), (305, 251), (309, 250), (313, 249), (317, 248), (321, 247),
    (325, 247), (329, 245), (333, 244), (337, 243), (341, 242), (345, 241), (349, 240), (353, 239),
    (357, 238), (361, 238), (365, 238), (369, 238), (373, 238), (377, 237), (381, 237), (385, 237),
    (389, 236), (393, 237), (397, 237), (401, 237),
]


def _read_float32(path: Path) -> np.ndarray:
    if not path.exists():
        raise FileNotFoundError(path)
    return np.fromfile(path, dtype=np.float32)


@lru_cache(maxsize=8)
def _read_float32_cached(path_str: str) -> np.ndarray:
    arr = _read_float32(Path(path_str))
    arr.setflags(write=False)
    return arr


def _read_model_volume() -> np.ndarray:
    raw = _read_float32_cached(str(MODEL_FILE))
    return raw.reshape(MODEL_SHAPE["ny"], MODEL_SHAPE["nx"], MODEL_SHAPE["nz"])


@lru_cache(maxsize=4)
def _load_snapshot_cached(time: str, mod: bool, snap_dir_str: str | None) -> np.ndarray:
    snap_dir = Path(snap_dir_str) if snap_dir_str else None
    raw = _read_float32(snapshot_path(time, mod=mod, snap_dir=snap_dir))
    if mod:
        expected = MODEL_SHAPE["ny"] * MODEL_SHAPE["nx"]
        if raw.size != expected:
            raise ValueError(f"Snapshot {time} has {raw.size} floats; expected {expected}")
        out = raw.reshape(MODEL_SHAPE["ny"], MODEL_SHAPE["nx"])
    elif raw.size == 495 * 388:
        c = _SNAP_CROP
        out = raw.reshape(495, 388)[c:-c, c:-c]
    else:
        out = raw.reshape(1, raw.size)
    out.setflags(write=False)
    return out


def model_info() -> dict[str, Any]:
    raw = _read_float32_cached(str(MODEL_FILE))
    expected = MODEL_SHAPE["ny"] * MODEL_SHAPE["nx"] * MODEL_SHAPE["nz"]
    unique, counts = np.unique(raw, return_counts=True)
    value_counts = {f"{float(v):.5g}": int(c) for v, c in zip(unique, counts)}
    return {
        "file": MODEL_FILE.name,
        "shape": MODEL_SHAPE,
        "dtype": "float32",
        "expectedFloatCount": expected,
        "actualFloatCount": int(raw.size),
        "min": float(np.min(raw)),
        "max": float(np.max(raw)),
        "mean": float(np.mean(raw)),
        "std": float(np.std(raw)),
        "tissueValues": TISSUE_VALUES,
        "valueCounts": value_counts,
        "receiverCount": len(RECEIVER_COORDS),
        "receiverCoords": [{"id": f"R{i:02d}", "x": int(x), "y": int(y)} for i, (y, x) in enumerate(RECEIVER_COORDS)],
    }


def snapshot_path(time: str, mod: bool = True, snap_dir: Path | None = None) -> Path:
    if time not in SNAPSHOT_TIMES:
        raise ValueError(f"Unsupported snapshot time: {time}")
    suffix = "__mod" if mod else ""
    base = snap_dir if snap_dir is not None else DATA_DIR
    return base / f"snapshot_t{time}_srcx_000{suffix}.bin"


def available_snapshot_times(case_id: int = 1) -> list[str]:
    cfg = _case_cfg(case_id)
    snap_dir = cfg["snapshot_dir"]
    mod = cfg["snapshot_mod"]
    return [t for t in SNAPSHOT_TIMES if snapshot_path(t, mod=mod, snap_dir=snap_dir).exists()]


_SNAP_CROP = 40


def load_snapshot(time: str, mod: bool = True, snap_dir: Path | None = None) -> np.ndarray:
    return _load_snapshot_cached(time, mod, str(snap_dir) if snap_dir else None)


def _robust_signed_normalize(values: np.ndarray, percentile: float = 99.2) -> tuple[np.ndarray, float]:
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return np.zeros_like(values, dtype=np.float32), 1.0
    scale = float(np.percentile(np.abs(finite), percentile))
    if not np.isfinite(scale) or scale <= 1e-12:
        scale = float(np.max(np.abs(finite))) if finite.size else 1.0
    if scale <= 1e-12:
        scale = 1.0
    normalized = np.clip(values / scale, -1.0, 1.0).astype(np.float32)
    return normalized, scale


def _downsample(matrix: np.ndarray, max_rows: int = 96, max_cols: int = 96) -> np.ndarray:
    rows, cols = matrix.shape
    step_y = max(1, int(np.ceil(rows / max_rows)))
    step_x = max(1, int(np.ceil(cols / max_cols)))
    return matrix[::step_y, ::step_x]


def snapshot_grid(time: str, mod: bool = True, max_rows: int = 96, max_cols: int = 96, case_id: int = 1) -> dict[str, Any]:
    cfg = _case_cfg(case_id)
    snap_dir = cfg["snapshot_dir"]
    use_mod = cfg["snapshot_mod"]
    matrix = load_snapshot(time, mod=use_mod, snap_dir=snap_dir)
    normalized, scale = _robust_signed_normalize(matrix)
    sampled = _downsample(normalized, max_rows=max_rows, max_cols=max_cols)
    rows, cols = sampled.shape
    return {
        "time": time,
        "timeStep": int(time),
        "mod": use_mod,
        "caseId": case_id,
        "sourceFile": snapshot_path(time, mod=use_mod, snap_dir=snap_dir).name,
        "shape": {"rows": int(matrix.shape[0]), "cols": int(matrix.shape[1])},
        "sampledShape": {"rows": int(rows), "cols": int(cols)},
        "x": np.linspace(0, matrix.shape[1] - 1, cols).round(2).tolist(),
        "y": np.linspace(0, matrix.shape[0] - 1, rows).round(2).tolist(),
        "z": np.round(sampled, 4).tolist(),
        "normalizationScale": scale,
        "min": float(np.min(matrix)),
        "max": float(np.max(matrix)),
    }


def seismogram_summary(case_id: int = 1) -> dict[str, Any]:
    cfg = _case_cfg(case_id)
    snap_dir = cfg["snapshot_dir"]
    mod = cfg["snapshot_mod"]
    times_avail = available_snapshot_times(case_id)
    selected = list(range(0, len(RECEIVER_COORDS), 10))[:10]
    times = [int(t) for t in times_avail]
    raw_values: dict[int, list[float]] = {i: [] for i in selected}
    for t in times_avail:
        matrix = load_snapshot(t, mod=mod, snap_dir=snap_dir)
        for idx in selected:
            y, x = RECEIVER_COORDS[idx]
            raw_values[idx].append(float(matrix[y, x]))
    all_abs = [abs(v) for vals in raw_values.values() for v in vals]
    global_scale = float(max(all_abs)) if all_abs else 1.0
    if global_scale <= 1e-12:
        global_scale = 1.0
    traces = []
    for idx in selected:
        y, x = RECEIVER_COORDS[idx]
        trace_scale = float(max(abs(v) for v in raw_values[idx])) if raw_values[idx] else 1.0
        if trace_scale <= 1e-12:
            trace_scale = 1.0
        traces.append({
            "id": f"R{idx:02d}",
            "x": int(x),
            "y": int(y),
            "time": times,
            "amplitude": [round(float(np.clip(v / trace_scale, -1.0, 1.0)), 4) for v in raw_values[idx]],
            "traceScale": trace_scale,
        })
    return {"time": times, "normalizationScale": global_scale, "traces": traces}


@lru_cache(maxsize=8)
def _seismogram_gather_cached(
    t0: int, t1: int, r0: int, r1: int, max_time_rows: int, case_id: int,
) -> dict[str, Any]:
    seismo_file = _case_cfg(case_id)["seismogram_file"]
    # Memory-conscious: stay in float32 throughout. The 30 MB .dat reshapes to
    # (75000, 100) float32 = 30 MB; doubling to float64 would cost 60 MB extra
    # per worker which blew up the 512 MB Fly VM previously.
    raw = _read_float32(seismo_file)
    gather = raw.reshape(SEISMOGRAM_NT_TOTAL, SEISMOGRAM_N_RECEIVERS)
    window = gather[t0:t1, r0:r1]
    abs_vals = np.abs(window[np.isfinite(window)])
    vmax = float(np.percentile(abs_vals, 99.5)) if abs_vals.size > 0 else 1.0
    if vmax <= 1e-12:
        vmax = 1.0
    n_time = window.shape[0]
    step = max(1, int(np.ceil(n_time / max_time_rows)))
    # Downsample BEFORE normalization to keep peak memory low.
    sampled_raw = window[::step, :]
    sampled = np.clip(sampled_raw / vmax, -1.0, 1.0).astype(np.float32)
    time_us = (np.arange(t0, t1, step) * SEISMOGRAM_DT_S * 1e6).round(4).tolist()
    receivers = list(range(r0, r1))
    return {
        "z": np.round(sampled, 4).tolist(),
        "time_us": time_us,
        "receivers": receivers,
        "vmax": round(vmax, 6),
        "sampledShape": {"rows": len(time_us), "cols": len(receivers)},
        "caseId": case_id,
    }


def seismogram_gather(
    t0: int = 0,
    t1: int = 75000,
    r0: int = 0,
    r1: int = 100,
    max_time_rows: int = 600,
    case_id: int = 1,
) -> dict[str, Any]:
    return _seismogram_gather_cached(t0, t1, r0, r1, max_time_rows, case_id)


def screening_surface(max_rows: int = 96, max_cols: int = 96, case_id: int = 1) -> dict[str, Any]:
    cfg = _case_cfg(case_id)
    snap_dir = cfg["snapshot_dir"]
    mod = cfg["snapshot_mod"]
    times_avail = available_snapshot_times(case_id)
    accumulator: np.ndarray | None = None
    for t in times_avail:
        matrix = np.abs(load_snapshot(t, mod=mod, snap_dir=snap_dir))
        normalized, _ = _robust_signed_normalize(matrix)
        energy = np.abs(normalized)
        accumulator = energy if accumulator is None else accumulator + energy
    if accumulator is None:
        accumulator = np.zeros((MODEL_SHAPE["ny"], MODEL_SHAPE["nx"]), dtype=np.float32)
    accumulator = accumulator / max(len(times_avail), 1)
    accumulator = np.clip(accumulator, 0.0, 1.0) ** 0.72
    sampled = _downsample(accumulator, max_rows=max_rows, max_cols=max_cols)
    rows, cols = sampled.shape
    threshold = float(np.percentile(accumulator, 97.5))
    hotspot_count = int(np.sum(accumulator >= threshold))
    return {
        "caseId": case_id,
        "sourceFiles": [snapshot_path(t, mod=mod, snap_dir=snap_dir).name for t in times_avail],
        "shape": {"rows": int(accumulator.shape[0]), "cols": int(accumulator.shape[1])},
        "sampledShape": {"rows": int(rows), "cols": int(cols)},
        "x": np.linspace(0, accumulator.shape[1] - 1, cols).round(2).tolist(),
        "y": np.linspace(0, accumulator.shape[0] - 1, rows).round(2).tolist(),
        "z": np.round(sampled, 4).tolist(),
        "threshold": round(threshold, 4),
        "hotspotVoxelCount": hotspot_count,
    }


def velocity_slice_z9(case_id: int = 1) -> dict[str, Any]:
    volume = _read_model_volume()
    slice_z9 = volume[:, :, 9]
    orig_by_new = sorted(range(len(RECEIVER_COORDS)), key=lambda i: RECEIVER_COORDS[i][0])
    ep_file = _case_cfg(case_id)["energy_profile_file"]
    if ep_file is not None and ep_file.exists():
        npz = np.load(ep_file, allow_pickle=True)
        new_indices = npz["receiver_indices"].astype(int).tolist()
    else:
        new_indices = list(range(62, 100))
    receivers = []
    ys, xs = [], []
    for new_idx in new_indices:
        if new_idx < len(orig_by_new):
            orig = orig_by_new[new_idx]
            y, x = RECEIVER_COORDS[orig]
            receivers.append({"id": int(new_idx), "x": int(x), "y": int(y)})
            ys.append(y)
            xs.append(x)
    if not ys:
        raise ValueError("No valid receiver indices found")
    PAD = 20
    y0 = max(0, min(ys) - PAD)
    y1 = min(MODEL_SHAPE["ny"], max(ys) + PAD + 1)
    x0 = max(0, min(xs) - PAD)
    x1 = min(MODEL_SHAPE["nx"], max(xs) + PAD + 1)
    cropped = slice_z9[y0:y1, x0:x1]
    return {
        "z": np.round(cropped, 5).tolist(),
        "x": list(range(x0, x1)),
        "y": list(range(y0, y1)),
        "shape": {"rows": int(cropped.shape[0]), "cols": int(cropped.shape[1])},
        "z_index": 9,
        "receivers": receivers,
        "vmin": float(np.min(slice_z9)),
        "vmax": float(np.max(slice_z9)),
    }


def _voxel_surface_mesh(mask: np.ndarray, step: int = 1) -> dict[str, list]:
    if step > 1:
        mask = mask[::step, ::step, :]
    if not np.any(mask):
        return {"x": [], "y": [], "z": [], "i": [], "j": [], "k": []}
    s = float(step)
    padded = np.pad(mask, 1, constant_values=False)
    all_x: list[np.ndarray] = []
    all_y: list[np.ndarray] = []
    all_z: list[np.ndarray] = []
    all_i: list[np.ndarray] = []
    all_j: list[np.ndarray] = []
    all_k: list[np.ndarray] = []
    base = 0

    def _emit(exposed: np.ndarray, offsets: list[tuple[int, int, int]]) -> None:
        nonlocal base
        iy_e, ix_e, iz_e = np.where(exposed)
        n = len(iy_e)
        if n == 0:
            return
        for dx, dy, dz in offsets:
            all_x.append((ix_e + dx).astype(np.float32) * s)
            all_y.append((iy_e + dy).astype(np.float32) * s)
            all_z.append((iz_e + dz).astype(np.float32))
        b = np.arange(n, dtype=np.int32) + base
        all_i.extend([b, b])
        all_j.extend([b + n, b + 2 * n])
        all_k.extend([b + 2 * n, b + 3 * n])
        base += 4 * n

    _emit(mask & ~padded[1:-1, 2:,  1:-1], [(1,0,0),(1,1,0),(1,1,1),(1,0,1)])
    _emit(mask & ~padded[1:-1, :-2, 1:-1], [(0,0,0),(0,0,1),(0,1,1),(0,1,0)])
    _emit(mask & ~padded[2:,  1:-1, 1:-1], [(0,1,0),(1,1,0),(1,1,1),(0,1,1)])
    _emit(mask & ~padded[:-2, 1:-1, 1:-1], [(0,0,0),(0,0,1),(1,0,1),(1,0,0)])
    _emit(mask & ~padded[1:-1, 1:-1, 2:],  [(0,0,1),(1,0,1),(1,1,1),(0,1,1)])
    _emit(mask & ~padded[1:-1, 1:-1, :-2], [(0,0,0),(0,1,0),(1,1,0),(1,0,0)])
    if not all_x:
        return {"x": [], "y": [], "z": [], "i": [], "j": [], "k": []}
    return {
        "x": np.concatenate(all_x).round(1).tolist(),
        "y": np.concatenate(all_y).round(1).tolist(),
        "z": np.concatenate(all_z).round(1).tolist(),
        "i": np.concatenate(all_i).tolist(),
        "j": np.concatenate(all_j).tolist(),
        "k": np.concatenate(all_k).tolist(),
    }


MCMC_BG = {
    "offset_x": 220,
    "offset_y": 295,
    "x_range": (220, 260),
    "y_range": (295, 355),
}
TISSUE_MAP = {"gingiva": 0.05, "bone": 1.5, "tooth": 2.5}
# Clinical palette (matches Phase 3 finding tokens): pink for gum tissue, warm bone red,
# enamel off-white for teeth. These map to mesh3d color in the 3D viewer.
TISSUE_COLORS = {"gingiva": "#FFB3D1", "bone": "#C8322B", "tooth": "#F5EFE2"}


@lru_cache(maxsize=1)
def _mcmc_background_cached() -> dict[str, Any]:
    volume = _read_model_volume()
    bx0, bx1 = MCMC_BG["x_range"]
    by0, by1 = MCMC_BG["y_range"]
    region = volume[by0 : by1 + 1, bx0 : bx1 + 1, :]
    tissues: dict[str, dict] = {}
    for name, value in TISSUE_MAP.items():
        mask = np.abs(region - value) < 0.01
        n_voxels = int(np.sum(mask))
        mesh = _voxel_surface_mesh(mask, step=4)
        tissues[name] = {
            **mesh,
            "color": TISSUE_COLORS[name],
            "count": n_voxels,
        }
    return {
        "tissues": tissues,
        "local_bounds": {
            "x": [0, bx1 - bx0],
            "y": [0, by1 - by0],
            "z": [0, MODEL_SHAPE["nz"] - 1],
        },
    }


def mcmc_background() -> dict[str, Any]:
    return _mcmc_background_cached()


# Tissue colors for the full-grid mesh — same palette as the MCMC bg mesh so
# the wavefield 3D overlay stays coherent with other 3D views.
FULL_TISSUE_COLORS = {"gingiva": "#FFB3D1", "bone": "#C8322B", "tooth": "#F5EFE2"}


@lru_cache(maxsize=4)
def _tissue_full_mesh_cached(step: int) -> dict[str, Any]:
    volume = _read_model_volume()
    tissues: dict[str, dict] = {}
    for name, value in TISSUE_MAP.items():
        mask = np.abs(volume - value) < 0.01
        n_voxels = int(np.sum(mask))
        mesh = _voxel_surface_mesh(mask, step=step)
        tissues[name] = {
            **mesh,
            "color": FULL_TISSUE_COLORS[name],
            "count": n_voxels,
        }
    return {
        "tissues": tissues,
        "step": step,
        "bounds": {
            "x": [0, MODEL_SHAPE["nx"] - 1],
            "y": [0, MODEL_SHAPE["ny"] - 1],
            "z": [0, MODEL_SHAPE["nz"] - 1],
        },
    }


def tissue_full_mesh(step: int = 8) -> dict[str, Any]:
    return _tissue_full_mesh_cached(step)


def mcmc_trace(case_id: int = 1) -> dict[str, Any]:
    trace_file = _case_cfg(case_id)["mcmc_trace_file"]
    if not trace_file.exists():
        raise FileNotFoundError(trace_file)
    data = np.loadtxt(trace_file, dtype=np.float64)
    if data.ndim == 1:
        data = data.reshape(1, -1)
    return {
        "iterations": data[:, 0].astype(int).tolist(),
        "x": data[:, 1].astype(int).tolist(),
        "y": data[:, 2].astype(int).tolist(),
        "z": data[:, 3].astype(int).tolist(),
        "r": data[:, 4].astype(int).tolist(),
        "misfit": [float(v) for v in data[:, 5]],
        "true_values": MCMC_TRUE_VALUES,
        "total": int(len(data)),
        "caseId": case_id,
    }


def energy_profile(case_id: int = 1) -> dict[str, Any]:
    ep_file = _case_cfg(case_id)["energy_profile_file"]
    if ep_file is None or not ep_file.exists():
        raise FileNotFoundError(ep_file)
    z = np.load(ep_file, allow_pickle=True)
    if "receiver_indices" not in z.files:
        raise KeyError("receiver_indices not found in NPZ")
    receiver_indices = z["receiver_indices"].astype(float).tolist()
    if "Px_s" in z.files:
        profile = z["Px_s"].astype(float)
    elif "Px" in z.files:
        profile = z["Px"].astype(float)
    else:
        raise KeyError("Px_s or Px not found in NPZ")
    max_val = float(np.max(profile))
    if max_val < 1e-12:
        max_val = 1.0
    profile_norm = np.round(profile / max_val, 5).tolist()
    peak_idx = int(np.argmax(profile))
    return {
        "receiver_indices": receiver_indices,
        "profile": profile_norm,
        "peak_receiver": receiver_indices[peak_idx],
        "peak_value": float(profile_norm[peak_idx]),
        "source_file": ep_file.name,
        "caseId": case_id,
    }
