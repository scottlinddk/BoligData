from __future__ import annotations

import numpy as np
import pandas as pd


def add_market_index(df: pd.DataFrame, index: pd.Series, as_of_col: str = "sold_date") -> pd.DataFrame:
    """Markedsniveau kendt på salgstidspunktet: indeksværdien for MÅNEDEN FØR salget.

    Månedens egen værdi indeholder selve salget og kan ikke kendes på forhånd, så den bruges ikke.
    """
    d = df.copy()
    d["month_prev"] = d[as_of_col].dt.to_period("M") - 1
    d["idx"] = index.reindex(pd.PeriodIndex(d["month_prev"])).to_numpy()
    return d


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi, dl = p2 - p1, np.radians(lon2) - np.radians(lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def block_label(dlat, dlon):
    ns = np.where(np.asarray(dlat) >= 0, "N", "S")
    ew = np.where(np.asarray(dlon) >= 0, "Ø", "V")
    return pd.Series([a + b for a, b in zip(ns, ew)])


def add_features(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    """Kun oplysninger der er kendt på salgstidspunktet eller ikke ændrer sig (placering, boligtype).

    Areal, værelser og byggeår er hentet fra den NUVÆRENDE annonce. De bruges også for ældre handler.
    Det er en kendt begrænsning (se README), ikke noget der er rettet.
    """
    p = cfg["project"]
    d = df.copy()
    d["area"] = d["sqm"].astype(float)
    d["log_area"] = np.log(d["area"])
    d["sale_year"] = d["sold_date"].dt.year
    d["age"] = (d["sale_year"] - d["year"]).clip(lower=0)
    d["dlat"] = (d["lat"] - p["center_lat"]) * 111.2
    d["dlon"] = (d["lon"] - p["center_lon"]) * 111.2 * np.cos(np.radians(d["lat"]))
    d["dist_km"] = haversine_km(d["lat"], d["lon"], p["center_lat"], p["center_lon"])
    d["sub_terraced"] = (d["pt"] == "terraced_house").astype(float)
    d["sub_villaapt"] = (d["pt"] == "villa_apartment").astype(float)
    d["block"] = block_label(d["dlat"], d["dlon"]).to_numpy()
    d["y"] = np.log(d["price"] / (d["idx"] * d["area"]))  # relativ pris pr. m² ift. markedsindeks

    pc = cfg["reporting"]["price_class_bounds_dkk"]
    d["price_class"] = pd.cut(d["price"], [0, pc[0], pc[1], np.inf],
                              labels=[f"under {pc[0]/1e6:g} mio.", f"{pc[0]/1e6:g}-{pc[1]/1e6:g} mio.", f"over {pc[1]/1e6:g} mio."],
                              right=False).astype(str)
    ac = cfg["reporting"]["age_class_bounds_year"]
    d["age_class"] = pd.cut(d["year"], [0, ac[0], ac[1], np.inf],
                            labels=[f"opført før {ac[0]}", f"opført {ac[0]}-{ac[1]-1}", f"opført {ac[1]} eller senere"],
                            right=False).astype(object)
    d["age_class"] = d["age_class"].where(d["year"].notna(), "byggeår ukendt").astype(str)
    return d
