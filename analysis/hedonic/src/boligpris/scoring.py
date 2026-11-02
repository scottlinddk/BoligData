from __future__ import annotations

import numpy as np
import pandas as pd

from .features import add_features, haversine_km
from .intervals import interval_predictions
from .methods import factories

SEG_OF = {"villa": "house", "terraced_house": "house", "villa_apartment": "house", "apartment": "apartment"}
REASONS = {
    "missing_inputs": "Areal eller placering mangler",
    "area_out_of_range": "Areal uden for træningsdatas spænd",
    "few_comparables": "For få sammenlignelige salg",
    "no_interval": "Intervallet er ikke informativt (for få kalibreringshandler)",
}


def _listing_frame(listings: pd.DataFrame, cfg: dict, index: pd.Series) -> tuple[pd.DataFrame, dict]:
    as_of = pd.Timestamp(cfg["scoring"]["as_of"])
    wanted = as_of.to_period("M") - 1
    used = wanted if wanted in index.index else index.index.max()
    meta = {"as_of": str(as_of.date()), "index_month_wanted": str(wanted), "index_month_used": str(used),
            "index_months_stale": int((wanted - used).n), "index_value": float(index[used])}
    d = listings.copy()
    d["segment"] = d["pt"].map(SEG_OF)
    d["sold_date"] = as_of
    d["idx"] = float(index[used])
    d["vur"] = np.nan
    d["price"] = d["asking"].astype(float)
    d["y"] = np.nan
    return add_features(d, cfg), meta


def score_listings(listings: pd.DataFrame, train_all: pd.DataFrame, cfg: dict, index: pd.Series,
                   decision: dict) -> tuple[pd.DataFrame, dict]:
    sc = cfg["scoring"]
    as_of = pd.Timestamp(sc["as_of"])
    L, meta = _listing_frame(listings, cfg, index)
    fx = factories(cfg)
    out, summary = [], {"meta": meta, "segments": {}}
    for seg in ("house", "apartment"):
        g = L[L["segment"] == seg].copy()
        train = train_all[train_all["segment"] == seg]
        method = decision.get(seg, {}).get("recommended")
        if g.empty or method is None:
            continue
        lo_a, hi_a = np.percentile(train["area"], sc["area_range_percentiles"])
        # Kalibreringsvinduet udvides, til der er nok residualer. Ikke testet i rolling-origin, som bruger 12 mdr.
        window_used = None
        for w in sc["calibration_windows_months"]:
            cfg_w = {**cfg, "splits": {**cfg["splits"], "calibration_months": w}}
            ph, lo, hi, info = interval_predictions(fx[method], train, g, as_of, cfg_w)
            window_used = w
            if info["n_calibration"] >= sc["min_calibration_n"]:
                break
        if info["n_calibration"] < sc["min_calibration_n"]:  # stadig for få: intervallet er ikke informativt
            lo, hi = np.full(len(g), np.nan), np.full(len(g), np.nan)
        g["estimate"], g["lo"], g["hi"] = ph, lo, hi
        alt = {m: fx[m]().fit(train).predict(g) for m in ("a1", "a2", "ridge", "gbm")}
        for m, v in alt.items():
            g[f"alt_{m}"] = v

        # Sammenlignelige salg: samme segment, inden for radius, inden for de seneste år, tilsvarende areal.
        since = as_of - pd.DateOffset(years=sc["comparables_years"])
        t = train[train["sold_date"] >= since]
        ncomp = []
        for r in g.itertuples():
            near = haversine_km(r.lat, r.lon, t["lat"].to_numpy(), t["lon"].to_numpy()) <= sc["comparables_radius_km"]
            tol = sc["comparables_area_tolerance"]
            sim = (t["area"].to_numpy() >= r.area * (1 - tol)) & (t["area"].to_numpy() <= r.area * (1 + tol))
            ncomp.append(int((near & sim).sum()))
        g["n_comparables"] = ncomp

        reason = np.full(len(g), "", dtype=object)
        reason[(g["area"].isna() | g["lat"].isna() | g["lon"].isna()).to_numpy()] = "missing_inputs"
        empty = reason == ""
        reason[empty & ((g["area"] < lo_a) | (g["area"] > hi_a)).to_numpy()] = "area_out_of_range"
        empty = reason == ""
        reason[empty & (g["n_comparables"] < sc["comparables_min_n"]).to_numpy()] = "few_comparables"
        empty = reason == ""
        reason[empty & (~np.isfinite(g["hi"].to_numpy(float)) | ~np.isfinite(g["estimate"].to_numpy(float)))] = "no_interval"
        g["reason"] = reason
        g["assessable"] = g["reason"] == ""
        g["low_confidence"] = g["year"].isna()
        g["ratio"] = g["asking"] / g["estimate"]
        g["position"] = np.where(g["asking"] > g["hi"], "over intervallet",
                                 np.where(g["asking"] < g["lo"], "under intervallet", "i intervallet"))
        g.loc[~g["assessable"], ["ratio", "position"]] = [np.nan, "ikke vurderbar"]
        out.append(g)

        a = g[g["assessable"]]
        alt_cols = [f"alt_{m}" for m in ("a1", "a2", "ridge", "gbm")]
        has_pt = g[~g["reason"].isin(["missing_inputs", "area_out_of_range"])]
        ratio_by_method = {m: float((has_pt["asking"] / has_pt[f"alt_{m}"]).median()) for m in ("a1", "a2", "ridge", "gbm")}
        ratio_by_method["recommended"] = float((has_pt["asking"] / has_pt["estimate"]).median())
        spread = (a[alt_cols].max(axis=1) - a[alt_cols].min(axis=1)) / a[alt_cols].median(axis=1)
        qs = [.1, .25, .5, .75, .9]
        summary["segments"][seg] = {
            "method": method, "listings": int(len(g)), "assessable": int(len(a)),
            "not_assessable": {k: int((g["reason"] == k).sum()) for k in REASONS},
            "low_confidence_year_missing": int(a["low_confidence"].sum()),
            "ratio_quantiles": {str(q): float(a["ratio"].quantile(q)) for q in qs} if len(a) else None,
            "position_shares": {p: float((a["position"] == p).mean()) for p in
                                ("under intervallet", "i intervallet", "over intervallet")} if len(a) else None,
            "median_rel_halfwidth": float(np.median((a["hi"] - a["lo"]) / a["estimate"] / 2)) if len(a) else None,
            "model_spread_median": float(spread.median()) if len(a) else None,
            "n_calibration": info["n_calibration"], "calibration_window_months": window_used, "n_train": int(len(train)),
            "with_point_estimate": int(len(has_pt)),
            "median_asking_over_estimate_by_method": ratio_by_method,
            "median_comparables": float(g["n_comparables"].median()),
        }
    scored = pd.concat(out, ignore_index=True) if out else pd.DataFrame()
    return scored, summary
