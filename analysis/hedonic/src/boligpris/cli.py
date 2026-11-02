from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

from .audit import audit_sales
from .config import load_config, resolve
from .data_load import load_listings, load_market_index, load_sales
from .descriptive import describe
from .evaluation import (common_subset_summary, decide, paired_comparisons, run_blocks, run_final,
                         run_rolling, summarize)
from .features import add_features
from .methods import METHOD_LABELS
from .reporting import clean, mark_indicative, provenance, write_json
from .scoring import REASONS, score_listings

SCHEMA_VERSION = 1


def _out(cfg: dict) -> Path:
    return resolve(cfg, cfg["data"]["outputs_dir"])


def prepare(cfg: dict):
    index = load_market_index(cfg)
    clean_df, audit = audit_sales(load_sales(cfg), cfg, index)
    return index, audit, add_features(clean_df, cfg)


def cmd_dev(cfg: dict) -> None:
    """Audit, beskrivelse, rolling-origin, blokgeografi, følsomhed og beslutning. Rører IKKE det urørte testsæt."""
    index, audit, df = prepare(cfg)
    dev = df[df["sold_date"] < pd.Timestamp(cfg["splits"]["final_holdout_from"])]
    pred, info = run_rolling(df, cfg)
    pooled = mark_indicative(summarize(pred, ["segment", "method"]), cfg)
    comps = paired_comparisons(pred, cfg)
    decision = decide(pooled, comps, cfg)
    pred_s, _ = run_rolling(df, cfg, train_exclude_flagged=True)
    blocks = run_blocks(df, cfg)
    scatter = {}
    for seg, d in decision.items():
        g = pred[(pred["segment"] == seg) & (pred["method"] == d["recommended"]) & pred["ph"].notna()]
        scatter[seg] = {"method": d["recommended"],
                        "points": [[round(a / 1e4) * 1e4, round(b / 1e4) * 1e4] for a, b in zip(g["price"], g["ph"])]}
    result = {
        "schema_version": SCHEMA_VERSION,
        "audit": audit,
        "descriptive": describe(dev, index),
        "rolling": {
            "test_years": cfg["splits"]["rolling_test_years"],
            "pooled": pooled,
            "per_fold": mark_indicative(summarize(pred, ["segment", "fold", "method"]), cfg),
            "cells": {dim: mark_indicative(summarize(pred, ["segment", "method", dim]), cfg)
                      for dim in ("price_class", "age_class", "block")},
            "common_subset_with_valuation": mark_indicative(common_subset_summary(pred), cfg),
            "paired_vs_baseline": comps,
            "calibration": info,
            "scatter": scatter,
        },
        "sensitivity_exclude_flagged_train": mark_indicative(summarize(pred_s, ["segment", "method"]), cfg),
        "spatial_blocks_within_9000": {
            "pooled": mark_indicative(summarize(blocks, ["segment", "method"]), cfg),
            "per_block": mark_indicative(summarize(blocks, ["segment", "method", "fold"]), cfg),
            "note": "Leave-one-block-out inden for postnummer 9000. Måler IKKE generalisering til nye byer eller postnumre.",
        },
        "decision": decision,
        "method_labels": METHOD_LABELS,
    }
    write_json(_out(cfg) / "dev_results.json", result)
    print("dev_results.json skrevet")
    for seg, d in decision.items():
        print(seg, "->", d["recommended"], "|", d["reason"])


def cmd_final(cfg: dict, force: bool) -> None:
    """Det urørte testsæt evalueres højst én gang. Låsen gemmer hashen af udviklingsresultaterne, som valget bygger på."""
    out = _out(cfg)
    lock, dev_path = out / "final_holdout.lock", out / "dev_results.json"
    if not dev_path.exists():
        sys.exit("Kør 'dev' først. Modelvalget skal være fastlagt før det urørte testsæt åbnes.")
    if lock.exists() and not force:
        sys.exit(f"Det urørte testsæt er allerede åbnet ({lock.read_text().splitlines()[0]}). Brug --force kun hvis du accepterer, at det ikke længere er urørt.")
    _, _, df = prepare(cfg)
    pred = run_final(df, cfg)
    result = {"schema_version": SCHEMA_VERSION, "pristine": not force,
              "from": cfg["splits"]["final_holdout_from"],
              "summary": mark_indicative(summarize(pred, ["segment", "method"]), cfg),
              "decision_sha256": hashlib.sha256(dev_path.read_bytes()).hexdigest()}
    write_json(out / "final_results.json", result)
    lock.write_text(f"opened {pd.Timestamp.now('UTC').isoformat()}\ndev_results_sha256 {result['decision_sha256']}\nforce {force}\n")
    print("final_results.json skrevet og testsættet låst")


def cmd_score(cfg: dict) -> None:
    index, _, df = prepare(cfg)
    dev_path = _out(cfg) / "dev_results.json"
    decision = json.loads(dev_path.read_text(encoding="utf-8"))["decision"]
    scored, summary = score_listings(load_listings(cfg), df, cfg, index, decision)
    summary["reasons"] = REASONS
    # Post hoc, EFTER det urørte testsæt er åbnet. Ændrer ikke modelvalget. Viser om det seneste niveau afviger.
    summary["post_hoc_relative_level"] = {
        seg: [{"year": int(y), "n": int(len(g)), "unique_properties": int(g["pid"].nunique()),
               "median_price_vs_index_area": float(np.exp(g["y"]).median())}
              for y, g in d.groupby("sale_year") if y >= 2017]
        for seg, d in df.groupby("segment")}
    write_json(_out(cfg) / "scoring_summary.json", summary)
    keep = ["lid", "segment", "asking", "estimate", "lo", "hi", "ratio", "position", "assessable", "reason",
            "n_comparables", "low_confidence", "alt_a1", "alt_a2", "alt_ridge", "alt_gbm"]
    scored[keep].round(3).to_csv(_out(cfg) / "scoring_listings.csv", index=False)
    print("scoring_summary.json skrevet")


def cmd_report(cfg: dict) -> None:
    out = _out(cfg)
    parts = {"dev": "dev_results.json", "final": "final_results.json", "scoring": "scoring_summary.json"}
    data = {k: json.loads((out / f).read_text(encoding="utf-8")) for k, f in parts.items() if (out / f).exists()}
    missing = set(parts) - set(data)
    if missing:
        sys.exit(f"Mangler {sorted(missing)}. Kør dev, final og score først.")
    results = {"schema_version": SCHEMA_VERSION, **data, "provenance": provenance(cfg)}
    write_json(out / "results.json", results)
    target = resolve(cfg, cfg["data"]["shared_results_json"])
    shutil.copyfile(out / "results.json", target)
    print("results.json skrevet og kopieret til", target)


def main(argv: list[str] | None = None) -> None:
    warnings.filterwarnings("ignore")
    ap = argparse.ArgumentParser(prog="boligpris")
    ap.add_argument("stage", choices=["dev", "final", "score", "report"])
    ap.add_argument("--config")
    ap.add_argument("--force", action="store_true", help="Åbn det urørte testsæt igen. Det er så ikke længere urørt.")
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    {"dev": lambda: cmd_dev(cfg), "final": lambda: cmd_final(cfg, a.force),
     "score": lambda: cmd_score(cfg), "report": lambda: cmd_report(cfg)}[a.stage]()
