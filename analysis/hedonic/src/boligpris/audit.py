from __future__ import annotations

import numpy as np
import pandas as pd

from .features import add_market_index


def _robust_z(x: pd.Series) -> pd.Series:
    med = x.median()
    mad = (x - med).abs().median() * 1.4826
    return (x - med) / mad if mad and np.isfinite(mad) else x * np.nan


def dedupe(df: pd.DataFrame, window_days: int) -> tuple[pd.DataFrame, dict]:
    """Én observation pr. bolig og salg.

    Regel 1: samme bolig, samme dato, FORSKELLIG pris er tvetydigt. Begge rækker udelades.
    Regel 2: samme bolig og samme pris inden for window_days er samme salg indberettet flere gange.
             Den tidligste række beholdes.
    Gensalg af samme bolig på tværs af flere måneder er ægte, adskilte observationer og beholdes.
    """
    d = df.sort_values(["pid", "sold_date", "price"]).copy()
    ambiguous = d.groupby(["pid", "sold_date"])["price"].transform("nunique") > 1
    n_ambiguous = int(ambiguous.sum())
    d = d[~ambiguous].copy()
    d = d.sort_values(["pid", "price", "sold_date"])
    gap = d.groupby(["pid", "price"])["sold_date"].diff().dt.days
    near = gap.notna() & (gap <= window_days)
    n_near = int(near.sum())
    d = d[~near].sort_values(["sold_date", "pid"]).reset_index(drop=True)
    return d, {"ambiguous_same_day_diff_price": n_ambiguous, "near_duplicates": n_near}


def audit_sales(raw: pd.DataFrame, cfg: dict, index: pd.Series) -> tuple[pd.DataFrame, dict]:
    f = cfg["filters"]
    steps: list[dict] = []

    def step(label: str, before: int, after: int, **detail):
        steps.append({"step": label, "removed": int(before - after), "remaining": int(after), **detail})

    seg_map = {pt: seg for seg, pts in f["segments"].items() for pt in pts}
    d = raw.copy()
    d["segment"] = d["pt"].map(seg_map)
    d = add_market_index(d, index)
    steps.append({"step": "Rå eksport (9000, handler fra 2011-01-01, fire boligtyper)", "removed": 0, "remaining": len(d)})

    # Diagnostik FØR handelstypefilteret: ligger familiehandler osv. systematisk under markedet?
    diag = d.dropna(subset=["idx"]).assign(rel=lambda x: x["price"] / (x["idx"] * x["sqm"]))
    sale_type_diag = [
        {"segment": seg, "sale_type": st, "n": int(len(g)), "median_rel_to_index": float(g["rel"].median())}
        for (seg, st), g in diag.groupby(["segment", "sale_type"])
    ]

    n = len(d)
    by_type = d["sale_type"].value_counts().to_dict()
    d = d[d["sale_type"].isin(f["sale_types"])]
    step("Kun almindelig fri handel (fjerner familie, auktion, øvrige)", n, len(d),
         dropped_by_type={k: int(v) for k, v in by_type.items() if k not in f["sale_types"]})

    n = len(d)
    bad = d["price"].isna() | (d["price"] <= 0) | d["sqm"].isna() | (d["sqm"] < f["area_m2_min"]) | (d["sqm"] > f["area_m2_max"])
    d = d[~bad]
    step(f"Ugyldig pris eller areal (areal uden for {f['area_m2_min']}-{f['area_m2_max']} m²)", n, len(d))

    n = len(d)
    d, dup = dedupe(d, f["dedupe_window_days"])
    step("Dubletter og tvetydige salg", n, len(d), **dup)

    n = len(d)
    postdate = d["year"].notna() & (d["year"] > d["sold_date"].dt.year)
    d = d[~postdate]
    step("Nuværende bygning er opført efter salget (areal og byggeår hører til en anden bygning)", n, len(d))

    n = len(d)
    d = d.dropna(subset=["idx"])
    step("Intet markedsindeks for måneden før salget (salg i januar 2011)", n, len(d))
    d = d.reset_index(drop=True)

    # Flag, ikke sletning
    d["year"] = d["year"].where(d["year"] >= f["year_min"])
    d["rooms"] = d["rooms"].where((d["rooms"] > 0) & (d["rooms"] <= f["rooms_max"]))
    d["flag_ppsqm_outlier"] = False
    d["y0"] = np.log(d["price"] / (d["idx"] * d["sqm"]))
    for seg, g in d.groupby("segment"):
        z = _robust_z(g["y0"])
        d.loc[g.index, "flag_ppsqm_outlier"] = z.abs() > f["outlier_robust_z"]
    drift = (d["resarea"].notna() & (d["area_as_of"] <= d["sold_date"])
             & ((d["sqm"] / d["resarea"] - 1).abs() > f["area_drift_tolerance"]))
    d["flag_area_drift"] = drift
    d["flag_any"] = d["flag_ppsqm_outlier"] | d["flag_area_drift"]
    d = d.drop(columns=["y0"])

    comparable_area = d["resarea"].notna() & (d["area_as_of"] <= d["sold_date"])
    ratio = (d["sqm"] / d["resarea"])[comparable_area]
    report = {
        "steps": steps,
        "sale_type_diagnostic": sale_type_diag,
        "flags": {
            "ppsqm_outlier": int(d["flag_ppsqm_outlier"].sum()),
            "area_drift": int(d["flag_area_drift"].sum()),
            "any": int(d["flag_any"].sum()),
            "robust_z_threshold": f["outlier_robust_z"],
            "note": "Flagges og beholdes i den primære analyse. Følsomhedsanalysen fjerner dem fra træningsdata.",
        },
        "missing": {seg: {"n": int(len(g)),
                          "rooms_missing": int(g["rooms"].isna().sum()),
                          "year_missing": int(g["year"].isna().sum()),
                          "vur_missing": int(g["vur"].isna().sum())}
                    for seg, g in d.groupby("segment")},
        "area_drift": {
            "n_with_area_at_sale": int(comparable_area.sum()),
            "share_of_clean": float(comparable_area.mean()),
            "median_abs_deviation": float((ratio - 1).abs().median()) if len(ratio) else None,
            "share_beyond_tolerance": float(((ratio - 1).abs() > f["area_drift_tolerance"]).mean()) if len(ratio) else None,
            "tolerance": f["area_drift_tolerance"],
        },
        "vur": _vur_report(d),
        "sales_per_year": {seg: {int(y): int(c) for y, c in g["sold_date"].dt.year.value_counts().sort_index().items()}
                           for seg, g in d.groupby("segment")},
        "properties": {seg: {"sales": int(len(g)), "unique_properties": int(g["pid"].nunique()),
                             "repeat_sale_properties": int((g["pid"].value_counts() > 1).sum())}
                       for seg, g in d.groupby("segment")},
    }
    return d, report


def _vur_report(d: pd.DataFrame) -> dict:
    out = {}
    for seg, g in d.groupby("segment"):
        has = g["vur"].notna()
        r = (g.loc[has, "price"] / g.loc[has, "vur"])
        out[seg] = {
            "n": int(len(g)), "with_asof_valuation": int(has.sum()), "share": float(has.mean()),
            "price_to_valuation_median": float(r.median()) if has.any() else None,
            "price_to_valuation_p10_p90": [float(r.quantile(.1)), float(r.quantile(.9))] if has.sum() >= 10 else None,
            "share_by_year": {int(y): float(gg["vur"].notna().mean()) for y, gg in g.groupby(g["sold_date"].dt.year)},
        }
    return out
