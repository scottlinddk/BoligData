from __future__ import annotations

import numpy as np
import pandas as pd

from .intervals import interval_predictions
from .methods import ape, factories
from .metrics import metrics, paired_bootstrap_median_diff, wilson
from .splits import block_folds, dev_and_holdout, drop_straddling, rolling_origin

SEGMENTS = ["house", "apartment"]
BASELINES = ["a1", "a2"]  # B dækker kun handler med vurdering og kan ikke vælges som generel baseline
CHALLENGERS = ["ridge", "gbm"]
KEEP = ["pid", "sold_date", "price", "area", "year", "block", "price_class", "age_class", "flag_any", "vur"]


def _rows(fold_label, seg, name, test, ph, lo, hi, stage):
    r = test[KEEP].copy()
    r["stage"], r["fold"], r["segment"], r["method"] = stage, fold_label, seg, name
    r["ph"], r["lo"], r["hi"] = ph, lo, hi
    return r


def run_rolling(df: pd.DataFrame, cfg: dict, train_exclude_flagged: bool = False) -> tuple[pd.DataFrame, list[dict]]:
    """Rolling-origin på udviklingssættet (før det urørte testsæt). Returnerer forudsigelser pr. handel."""
    dev, _ = dev_and_holdout(df, cfg)
    fx, out, info = factories(cfg), [], []
    for seg in SEGMENTS:
        for fold in rolling_origin(dev[dev["segment"] == seg], cfg):
            train = fold.train[~fold.train["flag_any"]] if train_exclude_flagged else fold.train
            for name, fac in fx.items():
                ph, lo, hi, meta = interval_predictions(fac, train, fold.test, fold.train_end, cfg)
                out.append(_rows(fold.label, seg, name, fold.test, ph, lo, hi, "rolling"))
                info.append({"segment": seg, "fold": fold.label, "method": name, "n_train": int(len(train)), **meta})
    return pd.concat(out, ignore_index=True), info


def run_blocks(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Leave-one-block-out i 9000. Ingen intervaller. Dette er IKKE test på nye geografier."""
    dev, _ = dev_and_holdout(df, cfg)
    fx, out = factories(cfg), []
    for seg in SEGMENTS:
        for fold in block_folds(dev[dev["segment"] == seg], cfg):
            for name, fac in fx.items():
                ph = fac().fit(fold.train).predict(fold.test)
                out.append(_rows(fold.label, seg, name, fold.test, ph, np.nan, np.nan, "block"))
    return pd.concat(out, ignore_index=True)


def run_final(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Det urørte testsæt. Kaldes højst én gang (se cli.py for låsen)."""
    dev, hold = dev_and_holdout(df, cfg)
    start = pd.Timestamp(cfg["splits"]["final_holdout_from"])
    fx, out = factories(cfg), []
    for seg in SEGMENTS:
        test = hold[hold["segment"] == seg]
        train = drop_straddling(dev[dev["segment"] == seg], test)
        if test.empty:
            continue
        for name, fac in fx.items():
            ph, lo, hi, _ = interval_predictions(fac, train, test, start, cfg)
            out.append(_rows("final", seg, name, test, ph, lo, hi, "final"))
    return pd.concat(out, ignore_index=True)


def summarize(pred: pd.DataFrame, by: list[str]) -> list[dict]:
    rows = []
    for key, g in pred.groupby(by, observed=True):
        key = key if isinstance(key, tuple) else (key,)
        m = metrics(g["price"], g["ph"], g["lo"], g["hi"])
        if m["coverage"] is not None:
            hit = int(round(m["coverage"] * m["n"]))
            m["coverage_ci90"] = wilson(hit, m["n"])
        rows.append({**dict(zip(by, key)), **m})
    return rows


def common_subset_summary(pred: pd.DataFrame) -> list[dict]:
    """Alle metoder på præcis de handler, hvor baseline B kan vurdere (sammenlignelig population)."""
    rows = []
    for seg, g in pred.groupby("segment"):
        wide = g.pivot_table(index=["fold", "pid", "sold_date"], columns="method", values="ph", aggfunc="first")
        ok = wide["b"].notna()
        keys = wide.index[ok]
        sub = g.set_index(["fold", "pid", "sold_date"]).loc[keys].reset_index()
        for name, gg in sub.groupby("method"):
            rows.append({"segment": seg, "method": name, **metrics(gg["price"], gg["ph"], gg["lo"], gg["hi"])})
    return rows


def paired_comparisons(pred: pd.DataFrame, cfg: dict) -> list[dict]:
    d = cfg["decision"]
    rows = []
    for seg, g in pred.groupby("segment"):
        errs = {m: gg.set_index(["fold", "pid", "sold_date"]).assign(ape=lambda x: ape(x["price"], x["ph"]))["ape"]
                for m, gg in g.groupby("method")}
        for a in CHALLENGERS:
            for b in BASELINES + ["b"]:
                joined = pd.concat([errs[a].rename("a"), errs[b].rename("b")], axis=1).dropna().reset_index()
                res = paired_bootstrap_median_diff(joined["a"], joined["b"], joined["pid"], d["bootstrap_reps"],
                                                   cfg["project"]["seed"], d["bootstrap_ci"])
                res.update(segment=seg, challenger=a, baseline=b)
                med_b = float(np.median(joined["b"])) if len(joined) else None
                res["relative_change"] = (res["diff"] / med_b) if (res["diff"] is not None and med_b) else None
                rows.append(res)
    return rows


def decide(pooled: list[dict], comparisons: list[dict], cfg: dict) -> dict:
    """Fastlagt regel: en challenger anbefales kun hvis den er mindst `min_relative_improvement` bedre i MdAPE end
    den bedste baseline (A1/A2) og bootstrap-intervallet for forskellen ligger helt under 0. Ellers anbefales baseline."""
    need = cfg["decision"]["min_relative_improvement"]
    out = {}
    for seg in SEGMENTS:
        pool = {r["method"]: r for r in pooled if r["segment"] == seg and r["mdape"] is not None}
        base = [b for b in BASELINES if b in pool]
        if not base:
            out[seg] = {"recommended": None, "reason": "Ingen baseline kunne beregnes."}
            continue
        best_base = min(base, key=lambda b: pool[b]["mdape"])
        winners = []
        for c in CHALLENGERS:
            comp = next((r for r in comparisons if r["segment"] == seg and r["challenger"] == c and r["baseline"] == best_base), None)
            if comp and comp["diff"] is not None and comp["relative_change"] is not None:
                if comp["relative_change"] <= -need and comp["hi"] < 0:
                    winners.append((comp["relative_change"], c))
        if winners:
            rec = min(winners)[1]
            out[seg] = {"recommended": rec, "best_baseline": best_base,
                        "reason": f"{rec} slår {best_base} med mindst {need:.0%} i MdAPE og bootstrap-intervallet ligger under 0."}
        else:
            out[seg] = {"recommended": best_base, "best_baseline": best_base,
                        "reason": f"Ingen challenger slår {best_base} med mindst {need:.0%} i MdAPE med et bootstrap-interval under 0. Baseline anbefales."}
    return out
