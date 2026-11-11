# Postcode 9000 Aalborg market statistics

Monthly Markedsindeks statistics for postcode 9000 (Aalborg), January
2011 to October 2026: 190 months, five series, no gaps. The snapshot is
`packages/shared/src/data/zip-9000-stats.json`. The calculations are in
`packages/shared/src/analysis/zip-market-stats.ts` and are tested in
`apps/web/src/lib/zip-market-stats.test.ts`.

## Series

| Series key | Address type | Meaning (as reported) |
| --- | --- | --- |
| `per_area_price` | villa | Price per m², DKK |
| `amount_for_sale` | villa | Villas for sale at month end |
| `sold_per_area_price` | villa and terraced house | Average sold price per m², DKK |
| `sold_time_on_market` | villa and terraced house | Average days on market for sold homes |
| `sold_per_area_price_change` | villa and terraced house | Average per-m² discount, DKK (negative) |

Two address types appear in the source. Asking-side series are villa-only, while
sold series include terraced houses. Compare series within the same address type.
The summary does this, with one exception: `amount_for_sale` against `per_area_price`
(both villa) is the supply-to-price check.

## Headline figures (October 2026)

| Measure | Oct 2026 | Year earlier | Change |
| --- | ---: | ---: | ---: |
| Sold price per m² | 25,417 DKK | 24,300 DKK | +4.6% |
| Asking price per m² (villa) | 28,610 DKK | 27,372 DKK | +4.5% |
| Villas for sale | 153 | 203 | −24.6% |
| Days on market (sold) | 103 | 95 | +8.4% |
| Average discount per m² | −762 DKK | −792 DKK | +30 DKK |

Trailing 12 months (November 2025 to October 2026) against the 12 months before:

| Measure | Current | Previous | Change |
| --- | ---: | ---: | ---: |
| Sold price per m² | 25,890 DKK | 23,065 DKK | +12.2% |
| Asking price per m² (villa) | 27,618 DKK | 25,577 DKK | +8.0% |
| Days on market (sold) | 122.3 | 121.9 | +0.3% |
| Average discount per m² | −857 DKK | −776 DKK | −80 DKK |

Longer-run and shape measures:

- **Sold price growth, 2011 to 2025:** 2.9% a year compound, from full-year averages
  (15,691 to 23,440 DKK/m²). 2026 is excluded because it has only ten months.
- **Month-to-month volatility of the sold price:** 3.5 percentage points (sample
  standard deviation of monthly changes).
- **Seasonality:** using full years only, November (+2.5%) and December (+2.2%) are the
  strongest months against their year's mean. February, March, April and August are
  the weakest, with April the lowest (−1.9%). The other months sit within about a
  point of the mean.
- **Full-year averages:** the yearly table in the module (`summarizeZipMarket().yearly`)
  gives every calendar year, marked with its month count.

## Correlations (monthly levels, n = 190)

| Pair | r | Reading |
| --- | ---: | --- |
| Days on market vs sold price | −0.38 | Slower sales go with lower prices, moderately |
| Average discount vs sold price | −0.12 | Weak |
| Villas for sale vs asking price (villa) | −0.24 | Weak; more supply, slightly lower asking prices |

These correlations use levels, and both series share a long upward trend, so
they can overstate a relationship. Treat them as descriptive. Testing the
relationship would need differenced or detrended series.

## Caveats

- **Date range.** The paste was described as November 2013 to September 2026, but its
  data runs from January 2011. The full range is used.
- **Undocumented definitions.** The paste does not say whether `per_area_price` is an
  asking price, how `sold_per_area_price_change` is calculated, or the unit of
  `sold_time_on_market`. The unit is inferred from the name (days). The snapshot's
  descriptions repeat these uncertainties.
- **Sample size.** The paste gives no transaction counts, so single months can swing
  a lot. For example, July 2026 rose 8.2% in one month. Read single-month moves
  against the trailing averages.
- **Gap to the municipal series.** The municipal Aalborg series is 17,109 DKK/m² for August 2026 (villa and terraced
  house). Postcode 9000 shows 27,684 for the same month, 1.62 times as high. The
  ratio has ranged from 1.20 (April 2013) to 1.62, and it has risen over time, so it
  is not a fixed offset. Check this against the live Markedsindeks before using the postcode figures
  to compare with the municipality. It may be a real central-postcode premium or a
  difference in how the two selectors are defined.
- **Revisions.** The 2026-11-11 paste revised recent months against the 2026-10-22 one: sold price Jul to Sep 2026, asking price Nov 2025 to Sep 2026, days on market Jul to Sep 2026, villas for sale Oct 2025 to Sep 2026 (each by 1) and the discount Jul and Sep 2026. Older months were unchanged. Recent months are likely to be revised again.
- **October 2026 is a sharp month.** Sold price fell 8.1% month on month and days on market fell from 151 to 103 in one month. The sold price is an average of relatively few sales, so one month is weak evidence of a turn. The price-rebound phase text on `/stats` is written to handle this.
- **Snapshot age.** The capture time is unknown. The importer did not fetch this data.
  It was pasted into the session on 2026-11-11.

## The /stats page

`/stats` (signed-in users) shows the snapshot as KPI cards, a four-panel timeline, a
year table, written remarks and relationship charts. The route is `apps/web/src/routes/stats.tsx`.

How the pieces fit:

| Layer | File | Role |
| --- | --- | --- |
| Statistics | `packages/shared/src/analysis/zip-market-relationships.ts` | 12-month changes, lagged correlation, phase summaries, relationship report |
| Remarks | `apps/web/src/lib/zip-market-remarks.ts` | Danish and English text. Fixed wording, figures read from the computed data |
| View model | `apps/web/src/lib/zip-market-view.ts` | KPI, yearly and seasonal numbers for the page |
| Charts | `apps/web/src/components/stats/` | SVG charts, no chart library |

Choices that affect how to read it:

- **Changes, not levels.** Relationships use 12-month changes, with annual averages as a
  cross-check. Levels share a long trend, which is why the level correlations above are
  only descriptive.
- **Discount as a size.** The snapshot stores the discount as a negative number. The
  analysis module and the page present it as a positive size, so "up" means a larger discount.
- **Phases.** Eight phases bounded by turning points in the price series (`MARKET_PHASES`).
  They describe, they do not assign a cause. Mentions of covid-19 and 2022-23 mortgage rates
  are context only, because the snapshot holds no such data.
- **Conservative strength labels.** Each remark's badge uses the weaker of the best-lag and
  the annual-average correlation.

### Refreshing the snapshot

The remarks quote numbers from the data, but their wording makes claims such as "supply is
the strongest companion of the asking price". `zip-market-relationships.test.ts` and
`zip-market-view.test.ts` pin each claim. If a refresh breaks one, the test fails and the
matching text in `zip-market-remarks.ts` or `stats.tsx` needs rewriting. Do not loosen the
test to make it pass.

## Refresh

No importer exists for this postcode yet. To update, obtain a new extract with the
same five series and month keys, replace the JSON file, and run the tests. The
integrity check fails on a missing, duplicated or out-of-period month. The UI does
not use this snapshot yet. See the module for the available calculations.

```sh
pnpm --filter web test -- zip-market-stats
pnpm typecheck
```

## Buyer timing guide

The "best time to buy" section on `/stats` is built by
`packages/shared/src/analysis/zip-market-timing.ts` and tested in
`apps/web/src/lib/zip-market-timing.test.ts`.

- Each series is detrended against a centred 2x12 moving average, so a rising market
  is not read as a season. The first and last six months have no trend value, which
  leaves 14-15 observations per calendar month.
- A month's signal is **reliable** when at least 10 years back it, at least 70% of
  the years agree on the direction, and the mean is at least two standard errors
  from zero. Everything else is shown but marked uncertain.
- **Negotiating power** averages the favourability of days on market and discount.
  **Choice** is the favourability of homes for sale. Favourability is the z-score of
  the month's mean across the twelve calendar months, signed so higher is better
  for a buyer. A month counts as high or low at a z-score of +/-0.5.
- Prices are shown but not scored: the sold-price season is about 3% peak to trough
  and fails the reliability test.
- Days on market is measured at the sale, so winter figures partly reflect homes
  listed in the autumn.

## Forecast tab (`/stats?tab=forecast`)

A 12-month outlook for the sold price per m², from the monthly history alone. Code: `packages/shared/src/analysis/zip-market-forecast.ts`, tests in `apps/web/src/lib/zip-market-forecast.test.ts`.

- **Three simple candidates** share one skeleton, level (last three months, season removed) x growth x season. Growth is 0 (*flat*), the long-run compound growth (*longrun*), or half the latest 12-month change plus half the long run (*momentum*). Their **plain average** (*blend*) is the fourth.
- **Backtest.** Rolling origin, expanding window: from each month (from 72 months of history) the method sees only earlier data and forecasts the next 12 months. 107 origins, but they overlap, so roughly 8 independent years.
- **Which one is shown** is fixed in advance: the blend, unless a single method has at least 10% lower mean absolute error. On the current snapshot the three are within 0.6 percentage points, and *flat* is as good as the others, so the forecast is **not clearly better than "prices stay where they are now"**. The page says so.
- **The range** is the 10th to 90th percentile of the errors the shown method made in the backtest, per distance ahead. It is empirical, not a model assumption.
- **Two changes are reported** because they answer different questions: against the last 12 months' average (+7.1%, mostly already happened) and against today's seasonally adjusted level (+2.3%, range -5.4% to +10.1%).

Not included: interest rates, income, construction, tax changes. Two regimes (the 2020 to 2022 boom and the 2022 to 2023 rate shock) dominate the history. Re-run the tests after refreshing the snapshot: the text on the page is generated from the numbers, but the "not clearly better than flat" wording is conditional and will change if the backtest does.

## Findings added to "best time to buy"

`apps/web/src/lib/zip-market-findings.ts` reads the hedonic results and the forecast: family sales sit far below the market level (houses 56%, ordinary sales 94%), houses sold at a median 1.5 times the public valuation, no model beat the simple baseline, and the forecast change from today's level next to the seasonal spread. Descriptive, from 815 cleaned sales, small samples for family sales.
