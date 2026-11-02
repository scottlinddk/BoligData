from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class Fold:
    label: str
    train: pd.DataFrame
    test: pd.DataFrame
    train_end: pd.Timestamp


def dev_and_holdout(df: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    cut = pd.Timestamp(cfg["splits"]["final_holdout_from"])
    return df[df["sold_date"] < cut].copy(), df[df["sold_date"] >= cut].copy()


def drop_straddling(train: pd.DataFrame, test: pd.DataFrame) -> pd.DataFrame:
    """Samme bolig må ikke ligge i både træning og test. Gensalg i testen fjerner boligens ældre salg fra træningen."""
    return train[~train["pid"].isin(set(test["pid"]))]


def rolling_origin(dev: pd.DataFrame, cfg: dict) -> list[Fold]:
    folds = []
    for year in cfg["splits"]["rolling_test_years"]:
        start = pd.Timestamp(year=year, month=1, day=1)
        test = dev[dev["sale_year"] == year]
        train = drop_straddling(dev[dev["sold_date"] < start], test)
        if test.empty or len(train) < cfg["splits"]["min_train_rows"]:
            continue
        assert train["sold_date"].max() < test["sold_date"].min(), "træning må ligge før test"
        assert not set(train["pid"]) & set(test["pid"]), "samme bolig i både træning og test"
        folds.append(Fold(str(year), train, test, start))
    return folds


def calibration_split(train: pd.DataFrame, train_end: pd.Timestamp, months: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Kernen tilpasser modellen. De seneste `months` måneder før train_end bruges kun til at kalibrere intervallet."""
    start = train_end - pd.DateOffset(months=months)
    return train[train["sold_date"] < start], train[train["sold_date"] >= start]


def block_folds(dev: pd.DataFrame, cfg: dict) -> list[Fold]:
    """Leave-one-block-out inden for 9000 (NØ, NV, SØ, SV om centrum).

    Måler IKKE generalisering til nye byer eller postnumre. Der er kun ét postnummer i data.
    """
    folds = []
    for b in sorted(dev["block"].unique()):
        test = dev[dev["block"] == b]
        train = dev[dev["block"] != b]
        if len(test) and len(train) >= cfg["splits"]["min_train_rows"]:
            folds.append(Fold(b, train, test, pd.Timestamp(dev["sold_date"].max()) + pd.Timedelta(days=1)))
    return folds
