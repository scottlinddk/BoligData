from __future__ import annotations

import datetime as dt
import json
import math
import platform
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import scipy
import sklearn

from .config import resolve, sha256_file


def clean(obj):
    """Gør objektet JSON-sikkert: numpy → python, NaN/inf → null, tidspunkter → tekst. Afrunder til 5 betydende decimaler."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        v = float(obj)
        return None if not math.isfinite(v) else round(v, 5)
    if isinstance(obj, (np.bool_,)):
        return bool(obj)
    if isinstance(obj, (pd.Timestamp, dt.date, pd.Period)):
        return str(obj)[:10] if not isinstance(obj, pd.Period) else str(obj)
    if obj is pd.NaT or obj is None:
        return None
    return obj


def mark_indicative(rows: list[dict], cfg: dict) -> list[dict]:
    lim = cfg["reporting"]["min_cell_n"]
    for r in rows:
        r["indicative"] = bool(r.get("n", 0) < lim)
    return rows


def git_commit(root: Path) -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return None


def provenance(cfg: dict) -> dict:
    root = Path(cfg["_root"])
    files = {k: resolve(cfg, cfg["data"][k]) for k in ("sales_csv", "listings_csv", "stats_snapshot")}
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seed": cfg["project"]["seed"],
        "config_sha256": cfg["_config_sha256"],
        "data_sha256": {k: sha256_file(p) for k, p in files.items()},
        "git_commit": git_commit(root),
        "python": platform.python_version(),
        "packages": {"numpy": np.__version__, "pandas": pd.__version__, "scipy": scipy.__version__, "scikit-learn": sklearn.__version__},
        "config": {k: v for k, v in cfg.items() if not k.startswith("_")},
    }


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(obj), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
