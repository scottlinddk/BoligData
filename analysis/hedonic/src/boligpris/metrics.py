from __future__ import annotations

import numpy as np
import pandas as pd


def _f(x):
    return None if x is None or not np.isfinite(x) else float(x)


def metrics(price, ph, lo=None, hi=None) -> dict:
    """Fastlagte metrikker: MdAPE, bias (median fortegnsfejl i %), dækning og relativ bredde af intervallet.

    n tæller kun handler hvor metoden kunne give et estimat. n_total er alle testhandler.
    """
    price, ph = np.asarray(price, float), np.asarray(ph, float)
    ok = np.isfinite(ph) & (price > 0)
    out = {"n_total": int(len(price)), "n": int(ok.sum())}
    if ok.sum() == 0:
        return {**out, "mdape": None, "bias": None, "p90_ape": None, "coverage": None, "median_rel_width": None, "n_interval": 0}
    err = (ph[ok] - price[ok]) / price[ok]
    out.update(mdape=_f(np.median(np.abs(err))), bias=_f(np.median(err)), p90_ape=_f(np.quantile(np.abs(err), 0.9)))
    has_interval = lo is not None and hi is not None and np.isfinite(np.asarray(lo, float)).any()
    if has_interval:
        lo, hi = np.asarray(lo, float)[ok], np.asarray(hi, float)[ok]
        fin = np.isfinite(hi)
        pr = price[ok]
        out["coverage"] = _f(np.mean((pr >= lo) & (pr <= hi))) if len(pr) else None
        out["n_interval"] = int(fin.sum())  # handler med et begrænset (informativt) interval
        out["median_rel_width"] = _f(np.median((hi[fin] - lo[fin]) / ph[ok][fin])) if fin.any() else None
    else:
        out.update(coverage=None, median_rel_width=None, n_interval=0)
    return out


def wilson(k: int, n: int, z: float = 1.645) -> list[float] | None:
    """90 % Wilson-interval for en andel (dækning). Viser hvor lidt n siger om dækningen."""
    if n == 0:
        return None
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [float(max(0, c - h)), float(min(1, c + h))]


def paired_bootstrap_median_diff(ape_a, ape_b, groups, reps, seed, ci) -> dict:
    """Forskel i MdAPE (a minus b) på de samme handler. Genudtræk hele boliger (klynger), ikke enkelthandler.
    Negativ forskel betyder at a er bedre. Intervallet afspejler kun stikprøvestøj, ikke bias fra datavalg."""
    a, b, g = np.asarray(ape_a, float), np.asarray(ape_b, float), np.asarray(groups)
    ok = np.isfinite(a) & np.isfinite(b)
    a, b, g = a[ok], b[ok], g[ok]
    if len(a) < 10:
        return {"n": int(len(a)), "diff": None, "lo": None, "hi": None}
    ids = pd.unique(g)
    idx_by = {k: np.flatnonzero(g == k) for k in ids}
    rng = np.random.default_rng(seed)
    diffs = np.empty(reps)
    for r in range(reps):
        pick = rng.choice(len(ids), len(ids), replace=True)
        rows = np.concatenate([idx_by[ids[j]] for j in pick])
        diffs[r] = np.median(a[rows]) - np.median(b[rows])
    lo, hi = np.quantile(diffs, [(1 - ci) / 2, 1 - (1 - ci) / 2])
    return {"n": int(len(a)), "diff": float(np.median(a) - np.median(b)), "lo": float(lo), "hi": float(hi)}
