import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from boligpris.audit import dedupe
from boligpris.config import load_config
from boligpris.features import add_market_index
from boligpris.intervals import conformal_halfwidth
from boligpris.methods import TrailingMedian, VurRatio
from boligpris.metrics import metrics, paired_bootstrap_median_diff
from boligpris.splits import calibration_split, drop_straddling, rolling_origin

CFG = load_config()


def sales(rows):
    return pd.DataFrame(rows, columns=["pid", "sold_date", "price"]).assign(sold_date=lambda d: pd.to_datetime(d["sold_date"]))


def test_dedupe_drops_ambiguous_and_near_duplicates_but_keeps_resales():
    df = sales([
        (1, "2020-01-10", 1_000_000), (1, "2020-01-10", 1_200_000),   # samme dag, forskellig pris: begge ud
        (2, "2020-03-01", 900_000), (2, "2020-03-20", 900_000),       # samme pris inden for 60 dage: behold første
        (3, "2015-05-01", 800_000), (3, "2021-05-01", 800_000),       # samme pris men år imellem: ægte gensalg
    ])
    out, info = dedupe(df, 60)
    assert info == {"ambiguous_same_day_diff_price": 2, "near_duplicates": 1}
    assert sorted(out["pid"].tolist()) == [2, 3, 3]
    assert out[out["pid"] == 2]["sold_date"].iloc[0] == pd.Timestamp("2020-03-01")


def test_market_index_uses_previous_month_only():
    idx = pd.Series({pd.Period("2020-01", "M"): 100.0, pd.Period("2020-02", "M"): 200.0, pd.Period("2020-03", "M"): 300.0})
    out = add_market_index(pd.DataFrame({"sold_date": pd.to_datetime(["2020-03-15", "2020-01-02"])}), idx)
    assert out["idx"].iloc[0] == 200.0      # marts bruger februar
    assert math.isnan(out["idx"].iloc[1])   # januar 2020 har ingen forudgående måned i serien


def test_rolling_origin_has_no_time_or_property_leakage():
    rng = np.random.default_rng(0)
    n = 400
    df = pd.DataFrame({"pid": rng.integers(0, 150, n),
                       "sold_date": pd.to_datetime("2012-01-01") + pd.to_timedelta(rng.integers(0, 365 * 12, n), "D")})
    df["sale_year"] = df["sold_date"].dt.year
    cfg = {"splits": {"rolling_test_years": [2020, 2021], "min_train_rows": 20}}
    folds = rolling_origin(df, cfg)
    assert folds
    for f in folds:
        assert f.train["sold_date"].max() < f.test["sold_date"].min()
        assert not set(f.train["pid"]) & set(f.test["pid"])


def test_drop_straddling_removes_whole_property_from_train():
    train = sales([(1, "2015-01-01", 1), (2, "2015-01-01", 1)])
    test = sales([(1, "2021-01-01", 1)])
    assert drop_straddling(train, test)["pid"].tolist() == [2]


def test_calibration_split_is_chronological_and_disjoint():
    t = sales([(i, f"20{10+i//12:02d}-{i%12+1:02d}-01", 1) for i in range(120)])
    core, calib = calibration_split(t, pd.Timestamp("2020-01-01"), 12)
    assert core["sold_date"].max() < calib["sold_date"].min()
    assert len(core) + len(calib) == len(t)


def test_conformal_halfwidth_finite_sample_rule():
    r = np.arange(1, 11) / 10  # n=10
    assert conformal_halfwidth(r, 0.2) == pytest.approx(0.9)   # k = ceil(11*0.8) = 9
    assert math.isinf(conformal_halfwidth(r[:3], 0.2))         # n=3: k=4 > n, ikke informativt
    assert math.isinf(conformal_halfwidth(np.array([]), 0.2))


def test_metrics_bias_sign_and_mdape():
    price = np.array([100.0, 100.0, 100.0])
    ph = np.array([110.0, 90.0, 120.0])
    m = metrics(price, ph, ph * 0.8, ph * 1.3)
    assert m["mdape"] == pytest.approx(0.10)
    assert m["bias"] == pytest.approx(0.10)          # median af +10 %, -10 %, +20 %
    assert m["coverage"] == pytest.approx(1.0)


def test_metrics_without_intervals_reports_no_coverage():
    m = metrics([100.0, 200.0], [110.0, 190.0], np.array([np.nan, np.nan]), np.array([np.nan, np.nan]))
    assert m["coverage"] is None


def test_trailing_median_uses_only_earlier_sales_and_needs_min_n():
    train = pd.DataFrame({"sold_date": pd.to_datetime(["2019-01-01"] * 5 + ["2021-06-01"]),
                          "price": [1000.0] * 5 + [5000.0], "area": [1.0] * 6})
    m = TrailingMedian(CFG).fit(train)
    test = pd.DataFrame({"sold_date": pd.to_datetime(["2019-06-01", "2019-01-01"]), "area": [10.0, 10.0]})
    p = m.predict(test)
    assert p[0] == 10_000.0       # kun de fem 2019-salg før datoen; 2021-salget ses ikke
    assert math.isnan(p[1])       # intet salg STRENGT før datoen


def test_vur_ratio_is_nan_without_valuation():
    train = pd.DataFrame({"sold_date": pd.to_datetime(["2019-01-01"] * 9), "price": [2.0] * 9, "vur": [1.0] * 9})
    m = VurRatio(CFG).fit(train)
    test = pd.DataFrame({"sold_date": pd.to_datetime(["2019-06-01"] * 2), "vur": [1_000_000.0, np.nan]})
    p = m.predict(test)
    assert p[0] == 2_000_000.0 and math.isnan(p[1])


def test_paired_bootstrap_detects_clear_difference():
    rng = np.random.default_rng(1)
    a = rng.uniform(0.05, 0.10, 60)
    b = a + 0.10
    res = paired_bootstrap_median_diff(a, b, np.arange(60), 300, 1, 0.9)
    assert res["hi"] < 0
