from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .splits import calibration_split


def conformal_halfwidth(abs_log_resid: np.ndarray, alpha: float) -> float:
    """Split-konform kvantil af |log(pris/estimat)|: den ceil((n+1)(1-α))'te mindste værdi.

    Garantien (dækning ≥ 1-α) gælder kun ved udskiftelige data. Her er data tidsafhængige og
    kalibreringsvinduet lille, så dækningen skal måles på senere data og kan ikke antages.
    Returnerer inf, hvis n er for lille til at give et interval (så er intervallet ikke informativt).
    """
    r = np.sort(np.asarray(abs_log_resid, float))
    r = r[np.isfinite(r)]
    n = len(r)
    k = math.ceil((n + 1) * (1 - alpha))
    if n == 0 or k > n:
        return math.inf
    return float(r[k - 1])


def interval_predictions(factory, train: pd.DataFrame, test: pd.DataFrame, train_end: pd.Timestamp, cfg: dict):
    """Punktestimat fra modellen tilpasset på hele træningssættet. Intervalbredde fra residualer på de seneste
    12 mdr. før train_end, målt med en model tilpasset KUN på data før dette vindue.
    Kalibreringsdata bruges altså ikke til at vurdere dækningen. Dækning måles på testdata."""
    core, calib = calibration_split(train, train_end, cfg["splits"]["calibration_months"])
    resid = np.array([])
    if len(core) and len(calib):
        ph_cal = factory().fit(core).predict(calib)
        with np.errstate(divide="ignore", invalid="ignore"):
            resid = np.abs(np.log(calib["price"].to_numpy(float) / ph_cal))
    q = conformal_halfwidth(resid, cfg["intervals"]["alpha"])
    ph = factory().fit(train).predict(test)
    lo, hi = ph * math.exp(-q) if math.isfinite(q) else np.zeros_like(ph), ph * math.exp(q) if math.isfinite(q) else np.full_like(ph, np.inf)
    n_cal = int(np.isfinite(resid).sum())
    return ph, lo, hi, {"n_calibration": n_cal, "halfwidth_log": None if not math.isfinite(q) else q}
