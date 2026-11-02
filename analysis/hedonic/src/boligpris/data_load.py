from __future__ import annotations

import json

import pandas as pd

from .config import resolve

SALES_COLUMNS = ["pid", "sold_date", "price", "sale_type", "pt", "sqm", "rooms", "year", "lat", "lon",
                 "resarea", "area_as_of", "vur", "vury"]
LISTING_COLUMNS = ["lid", "asking", "pt", "sqm", "rooms", "year", "lat", "lon"]


def _check(df: pd.DataFrame, columns: list[str], name: str) -> None:
    missing = set(columns) - set(df.columns)
    if missing:
        raise ValueError(f"{name}: mangler kolonner {sorted(missing)}")


def load_sales(cfg: dict) -> pd.DataFrame:
    """Rå handelseksport. Ingen rettelser her. Alle filtre og rettelser sker i audit.py."""
    df = pd.read_csv(resolve(cfg, cfg["data"]["sales_csv"]), parse_dates=["sold_date", "area_as_of"])
    _check(df, SALES_COLUMNS, "sales")
    if df["sold_date"].isna().any() or df["price"].isna().any():
        raise ValueError("sales: sold_date og price må ikke mangle i eksporten")
    return df


def load_listings(cfg: dict) -> pd.DataFrame:
    df = pd.read_csv(resolve(cfg, cfg["data"]["listings_csv"]))
    _check(df, LISTING_COLUMNS, "listings")
    return df


def load_market_index(cfg: dict) -> pd.Series:
    """Månedlig gennemsnitlig salgspris pr. m² i postnummer 9000 fra /stats-snapshottet (DKK/m²)."""
    snap = json.loads(resolve(cfg, cfg["data"]["stats_snapshot"]).read_text(encoding="utf-8"))
    points = snap["series"][cfg["data"]["market_index_series"]]["points"]
    s = pd.Series(points, dtype=float)
    s.index = pd.PeriodIndex(s.index, freq="M")
    return s.sort_index()
