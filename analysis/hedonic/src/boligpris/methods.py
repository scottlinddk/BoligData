from __future__ import annotations

import itertools

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

METHOD_LABELS = {
    "a1": "Baseline A1: median pris pr. m², seneste 12-36 mdr.",
    "a2": "Baseline A2: /stats-indeks × areal",
    "b": "Baseline B: offentlig vurdering × lokal salg/vurdering",
    "ridge": "Challenger: regulariseret log-lineær (ridge)",
    "gbm": "Challenger: gradient boosting",
}


def ape(price, ph):
    price, ph = np.asarray(price, float), np.asarray(ph, float)
    return np.abs(ph - price) / price


class Method:
    """Fælles grænseflade. predict returnerer NaN, hvor metoden ikke kan vurdere en handel."""
    name = "?"

    def fit(self, train: pd.DataFrame) -> "Method":
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        raise NotImplementedError


class TrailingMedian(Method):
    """Baseline A1. Median pris pr. m² for segmentets handler i de seneste 12 mdr. før handelsdatoen.

    Vinduet udvides til 24 og 36 mdr., hvis der er for få handler. Bruger kun træningshandler FØR datoen.
    """
    name = "a1"

    def __init__(self, cfg):
        self.windows = cfg["baselines"]["trailing_windows_months"]
        self.min_n = cfg["baselines"]["trailing_min_n"]

    def fit(self, train):
        t = train[["sold_date", "price", "area"]].sort_values("sold_date")
        self.dates = t["sold_date"].to_numpy()
        self.pp = (t["price"] / t["area"]).to_numpy()
        return self

    def predict(self, df):
        out = np.full(len(df), np.nan)
        for k, (d, a) in enumerate(zip(df["sold_date"].to_numpy(), df["area"].to_numpy())):
            for m in self.windows:
                lo = np.datetime64(pd.Timestamp(d) - pd.DateOffset(months=m))
                sel = (self.dates < d) & (self.dates >= lo)
                if sel.sum() >= self.min_n:
                    out[k] = np.median(self.pp[sel]) * a
                    break
        return out


class IndexTimesArea(Method):
    """Baseline A2. Det publicerede /stats-niveau for måneden før salget gange boligens areal."""
    name = "a2"

    def __init__(self, cfg):
        pass

    def predict(self, df):
        return (df["idx"] * df["area"]).to_numpy(float)


class VurRatio(Method):
    """Baseline B. Offentlig vurdering kendt på salgstidspunktet × lokal median salgspris/vurdering."""
    name = "b"

    def __init__(self, cfg):
        self.window = cfg["baselines"]["vur_ratio_window_months"]
        self.min_n = cfg["baselines"]["vur_ratio_min_n"]

    def fit(self, train):
        t = train[train["vur"].notna()][["sold_date", "price", "vur"]].sort_values("sold_date")
        self.dates = t["sold_date"].to_numpy()
        self.ratio = (t["price"] / t["vur"]).to_numpy()
        return self

    def predict(self, df):
        out = np.full(len(df), np.nan)
        for k, (d, v) in enumerate(zip(df["sold_date"].to_numpy(), df["vur"].to_numpy(float))):
            if not np.isfinite(v):
                continue
            lo = np.datetime64(pd.Timestamp(d) - pd.DateOffset(months=self.window))
            sel = (self.dates < d) & (self.dates >= lo)
            if sel.sum() >= self.min_n:
                out[k] = np.median(self.ratio[sel]) * v
        return out


def inner_splits(train: pd.DataFrame, n_years: int = 2, min_train: int = 20, min_val: int = 5):
    """Kronologisk tuning kun inden for træningsdata: valider på de seneste hele salgsår, træn på det foregående."""
    for vy in sorted(train["sale_year"].unique())[-n_years:]:
        tr, va = train[train["sale_year"] < vy], train[train["sale_year"] == vy]
        if len(tr) >= min_train and len(va) >= min_val:
            yield tr, va


class _Challenger(Method):
    """Forudsiger y = log(pris pr. m² / markedsindeks). Pris = exp(ŷ) × indeks × areal."""

    def __init__(self, cfg, seed):
        self.cfg, self.seed = cfg, seed
        self.feats = cfg["models"]["features"]
        self.min_rows = cfg["splits"]["min_train_rows"]
        self.est = None

    def grid(self):
        raise NotImplementedError

    def build(self, params):
        raise NotImplementedError

    def X(self, df):
        return df[self.feats].astype(float)

    def _pred_price(self, est, df):
        return np.exp(est.predict(self.X(df))) * df["idx"].to_numpy(float) * df["area"].to_numpy(float)

    def _fit_est(self, train, params):
        est = self.build(params)
        est.fit(self.X(train), train["y"].to_numpy(float))
        return est

    def fit(self, train):
        self.est = None
        if len(train) < self.min_rows:
            return self
        best, best_score = None, np.inf
        for params in self.grid():
            errs = [np.median(ape(va["price"], self._pred_price(self._fit_est(tr, params), va)))
                    for tr, va in inner_splits(train)]
            score = float(np.mean(errs)) if errs else np.inf
            if score < best_score:
                best, best_score = params, score
        self.params = best if best is not None else self.grid()[0]
        self.est = self._fit_est(train, self.params)
        return self

    def predict(self, df):
        if self.est is None:
            return np.full(len(df), np.nan)
        return self._pred_price(self.est, df)


class RidgeLog(_Challenger):
    name = "ridge"

    def grid(self):
        return [{"alpha": a} for a in self.cfg["models"]["ridge_alphas"]]

    def X(self, df):
        x = df[self.feats].astype(float).copy()
        x["age_sq"] = x["age"] ** 2 / 100.0
        x["dist_sq"] = x["dist_km"] ** 2
        return x

    def build(self, params):
        return Pipeline([("imp", SimpleImputer(strategy="median", add_indicator=True)),
                         ("sc", StandardScaler()),
                         ("ridge", Ridge(alpha=params["alpha"]))])


class Gbm(_Challenger):
    name = "gbm"

    def grid(self):
        m = self.cfg["models"]
        return [{"max_depth": d, "max_iter": i} for d, i in itertools.product(m["gbm_max_depth"], m["gbm_max_iter"])]

    def build(self, params):
        m = self.cfg["models"]
        return HistGradientBoostingRegressor(
            loss="absolute_error", max_depth=params["max_depth"], max_iter=params["max_iter"],
            learning_rate=m["gbm_learning_rate"], min_samples_leaf=m["gbm_min_samples_leaf"],
            l2_regularization=m["gbm_l2"], early_stopping=False, random_state=self.seed)


def factories(cfg: dict) -> dict:
    seed = cfg["project"]["seed"]
    return {
        "a1": lambda: TrailingMedian(cfg),
        "a2": lambda: IndexTimesArea(cfg),
        "b": lambda: VurRatio(cfg),
        "ridge": lambda: RidgeLog(cfg, seed),
        "gbm": lambda: Gbm(cfg, seed),
    }
