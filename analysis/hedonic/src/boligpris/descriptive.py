from __future__ import annotations

import numpy as np
import pandas as pd


def _q(x, p):
    return float(np.quantile(x, p)) if len(x) else None


def describe(df: pd.DataFrame, index: pd.Series) -> dict:
    """Fase 2. Fordelinger pr. år og kvartal med n. Sammensætningskolonner (areal, alder, rækkehusandel) vises ved siden af
    prisen, så en prisændring ikke læses som ren prisudvikling, når de solgte boliger har skiftet karakter."""
    out = {"yearly": {}, "quarterly": {}, "price_distribution": {}}
    for seg, g in df.groupby("segment"):
        g = g.assign(pp=g["price"] / g["area"], year_s=g["sold_date"].dt.year, q=g["sold_date"].dt.to_period("Q").astype(str))
        yearly = []
        for y, gg in g.groupby("year_s"):
            idx_year = index[index.index.year == y]
            yearly.append({
                "year": int(y), "n": int(len(gg)), "unique_properties": int(gg["pid"].nunique()),
                "median_price": _q(gg["price"], .5), "p25_price": _q(gg["price"], .25), "p75_price": _q(gg["price"], .75),
                "median_ppsqm": _q(gg["pp"], .5), "p25_ppsqm": _q(gg["pp"], .25), "p75_ppsqm": _q(gg["pp"], .75),
                "median_area": _q(gg["area"], .5),
                "median_building_year": _q(gg["year"].dropna(), .5),
                "share_terraced": float((gg["pt"] == "terraced_house").mean()) if seg == "house" else None,
                "stats_index_mean": float(idx_year.mean()) if len(idx_year) else None,
                "relative_to_index_median": float(np.exp(gg["y"]).median()),
            })
        out["yearly"][seg] = yearly
        out["quarterly"][seg] = [{"quarter": q, "n": int(len(gg)), "median_ppsqm": _q(gg["pp"], .5)}
                                 for q, gg in g.groupby("q")]
        out["price_distribution"][seg] = {
            "n": int(len(g)),
            "price_quantiles": {str(p): _q(g["price"], p) for p in (.05, .25, .5, .75, .95)},
            "ppsqm_quantiles": {str(p): _q(g["pp"], p) for p in (.05, .25, .5, .75, .95)},
        }
    return out
