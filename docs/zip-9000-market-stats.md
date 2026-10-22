# Postcode 9000 Aalborg market statistics

Monthly Boligsiden Markedsindeks statistics for postcode 9000 (Aalborg), January
2011 to September 2026: 189 months, five series, no gaps. The snapshot is
`packages/shared/src/data/boligsiden-zip-9000-stats.json`. The calculations are in
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

## Headline figures (September 2026)

| Measure | Sep 2026 | Year earlier | Change |
| --- | ---: | ---: | ---: |
| Sold price per m² | 27,690 DKK | 24,091 DKK | +14.9% |
| Asking price per m² (villa) | 28,021 DKK | 27,150 DKK | +3.2% |
| Villas for sale | 161 | 193 | −16.6% |
| Days on market (sold) | 150 | 98 | +53.1% |
| Average discount per m² | −865 DKK | −825 DKK | −40 DKK |

Trailing 12 months (October 2025 to September 2026) against the 12 months before:

| Measure | Current | Previous | Change |
| --- | ---: | ---: | ---: |
| Sold price per m² | 25,807 DKK | 23,031 DKK | +12.1% |
| Asking price per m² (villa) | 27,484 DKK | 25,368 DKK | +8.3% |
| Days on market (sold) | 121.7 | 122.4 | −0.6% |
| Average discount per m² | −858 DKK | −768 DKK | −90 DKK |

Longer-run and shape measures:

- **Sold price growth, 2011 to 2025:** 2.9% a year compound, from full-year averages
  (15,691 to 23,440 DKK/m²). 2026 is excluded because it has only nine months.
- **Month-to-month volatility of the sold price:** 3.4 percentage points (sample
  standard deviation of monthly changes).
- **Seasonality:** using full years only, November (+2.5%) and December (+2.2%) are the
  strongest months against their year's mean. February, March, April and August are
  the weakest, with April the lowest (−1.9%). The other months sit within about a
  point of the mean.
- **Full-year averages:** the yearly table in the module (`summarizeZipMarket().yearly`)
  gives every calendar year, marked with its month count.

## Correlations (monthly levels, n = 189)

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
- **Gap to the municipal series.** The municipal Aalborg series in
  `boligsiden-market-index.json` is 17,109 DKK/m² for August 2026 (villa and terraced
  house). Postcode 9000 shows 27,754 for the same month, 1.62 times as high. The
  ratio has ranged from 1.20 (April 2013) to 1.62, and it has risen over time, so it
  is not a fixed offset. Check this against the live Markedsindeks before using the postcode figures
  to compare with the municipality. It may be a real central-postcode premium or a
  difference in how the two selectors are defined.
- **Snapshot age.** The capture time is unknown. The importer did not fetch this data.
  It was pasted into the session on 2026-10-22.

## Refresh

No importer exists for this postcode yet. To update, obtain a new extract with the
same five series and month keys, replace the JSON file, and run the tests. The
integrity check fails on a missing, duplicated or out-of-period month. The UI does
not use this snapshot yet. See the module for the available calculations.

```sh
pnpm --filter web test -- zip-market-stats
pnpm typecheck
```
