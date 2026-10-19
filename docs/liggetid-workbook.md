# Historical liggetid price reference

The supplied `02-Boligsalg_liggetidsintervaller_2026-09-27-1-.xlsx` is read as source
data. Its notes describe provenance and limitations; they are not instructions
to the application or the importer. The original workbook is never modified.

The extraction preserves all **437** `Grunddata` records, including original row
numbers, source URLs, status/reason fields, prior-episode flags and full saved
history. Exactly **281** records are eligible under the workbook's original
rules: a documented, positive first-asking/sale-price pair, a nonnegative latest
episode duration whose sale date matches, and a sale in 2024–2026. The exclusions
are 103 missing price pairs, 17 uncertain price pairs and 36 missing/mismatching
listing durations. Excluded records stay in the audit data.

## Files and reproduction

- `packages/shared/src/data/liggetid-transactions-2026-09-27.json`: complete audit
  records and original column mapping. Server-side seed consumers may use its
  `records[].sourceUrl`; importing this large file into UI components is unnecessary.
- `packages/shared/src/data/liggetid-price-reference-2026-09-27.json`: compact
  metadata, ten pooled brackets from `Intervaller!B10:K19`, and an all-sales
  aggregate calculated directly from the 281 eligible raw records, used by the UI.
- `packages/shared/src/analysis/workbook-price-reference.ts`: pure calculator.

Python 3.10+ with `openpyxl` is needed only when importing a workbook. From the
repository root, run:

```sh
python scripts/import-liggetid-workbook.py /path/to/02-Boligsalg_liggetidsintervaller_2026-09-27-1-.xlsx
python scripts/import-liggetid-workbook.py /path/to/02-Boligsalg_liggetidsintervaller_2026-09-27-1-.xlsx --check
```

The second command verifies committed outputs without writing files. The importer
checks the workbook's cached eligibility flags and independently recalculates
every pooled count, mean, median, inclusive-interpolation quartile, and sensitivity
count/median. The all-sales aggregate is independently calculated from every
eligible raw discount, rather than averaging the differently sized groups. Stale
or missing formula caches fail before writing. No generated
timestamp is used, so output is deterministic. The expected source SHA-256 is
`b78c3020fe41bac9523cc3972e639c5231da73231c6748020834a8b2f892fab1`.

## Interpretation

The card calculates **Burde koste from the original asking price only**. The current
asking price, including an already reduced price, is never the calculation basis. The displayed amount is always rounded to the
nearest DKK 10,000. The original workbook used DKK 50,000; that source setting is
retained separately as `sourceRoundingDkk`. `calculationVersion` identifies the
application's scenario rules independently of the dated source snapshot. A small
positive scenario may round to zero; the UI labels this as below the rounding
threshold, rather than a free property. A zero asking-price input is still invalid.

The original-price evidence follows this order:

1. A documented original asking price is preferred. A first price reconstructed
   from a reliable Boligsiden asking-price change remains explicitly approximate:
   `askingAtObservation / (1 + changePercent / 100)`. The price and percentage
   must come from the same source observation for the current listing episode.
   That pair can recover the original even if today's asking price has since
   changed; a newer unknown or conflicting observation is never skipped. This
   reverses the source-reported change to recover the original basis; it does not
   apply the historic discount to the reduced/current amount itself.
2. If the original price cannot be established, no krone amount is invented.
   The calculator returns `missing_first_asking` and still exposes the historical
   discounts and sale count for the selected time group or all-sales aggregate.

The adapter rejects conflicting, future, incomplete or otherwise unreliable
original-price evidence. That evidence must not be replaced by today's asking
price. The calculator reports `priceBasis: first_asking` and `baselinePrice` when
the original price is available; both fields are null otherwise. The inputs and
listing chronology are never changed.

`currentAsking` is used **only** for the gap comparison. With the same original
asking price and duration, changing today's price cannot change Burde koste or its
historical range. A missing current price removes the gap, not the calculation.
The card shows current asking and **Burde koste** side by side, with an explicit
above/below/equal comparison in DKK and percent of current asking. Current asking
remains visible when the original-price evidence is missing; no estimate or gap
is invented in that state.

Time matching follows three explicit paths:

- **Matched bracket** (`matched_bracket`): whole, nonnegative latest-episode days
  within the observed 2–797 days select the matching inclusive time group.
- **Nearest observed bracket** (`nearest_bracket`): 0–1 days use the first group;
  more than 797 days use the last group. The actual listing duration is preserved
  in `latestEpisodeDays`, even when greater than the workbook's last artificial
  bin endpoint. Only the lookup is bounded. This reuses observed outcomes without
  extending a fitted trend or inventing a replacement duration.
- **All sales** (`all_sales`): unknown, negative, noninteger or nonfinite duration
  uses the distribution of **all 281 eligible raw discounts**. No day is invented
  (`latestEpisodeDays` stays null), and the result is not presented as matched to
  the listing's duration. Medians and quartiles are calculated over the original
  observations, never as a mean or median of the ten bracket medians.

The subject's duration follows the scope of its original asking price. When that
original is a verified total-marketing-period price (`priceScope:
total_marketing_period`, for example after a broker change), the lookup uses the
source's total days (`timeOnMarket.total.days`), so the duration and the price
basis cover the same period. Otherwise it uses the current listing's days. The
calculator field keeps the name `latestEpisodeDays`; the adapter's `timeScope`
records which duration was used. The workbook's own durations are Boliga
latest-episode days, and 62 of the 281 eligible sales had an earlier period, so
the historical side is not total-period throughout. This is a known limitation
of the dataset, not something the subject lookup can correct.

Each eligible sale has equal weight. The calculation is
`baselinePrice × (1 − median historical total price fall)`. Q3 of the discount
produces the lower scenario price; Q1 produces the upper price. Sales above
asking retain negative discounts. The gap is current asking minus the scenario;
its percentage uses current asking as denominator and can be negative.

At 188 days, first asking DKK 5.5m and current asking DKK 5.2m, the 181–240 day
group (22 trades) gives DKK **4.81m**, a middle-half range of **4.66–5.08m**, and a
current-price gap of **390,000** (7.5%). Reducing current asking to DKK 4.5m leaves
Burde koste at **4.81m** and changes only the gap to **−310,000**. With unknown
duration and original asking DKK 5.5m, the all-sales median discount of
approximately **5.9894%** gives **5.17m**, with **4.80–5.35m** as the middle-half
historical range. If the original asking price is missing, these historical
statistics remain available without substituting today's price.

The workbook's ten groups were originally pooled to at least 15 trades. This is
source metadata, not a display requirement. Any nonempty, valid sample can produce
a scenario; small sample counts must be shown. Empty samples, invalid quartiles,
invalid rounding, invalid observed bounds and ambiguous group matches still fail
closed. All ten historical groups remain available in the evidence disclosure.

These are selected **villa** trades from the original **Aalborg/Hasseris map
area**. Villas in postcode 9000 match this coarse sample scope; other or unknown
types/postcodes receive an explicitly labelled **broad historical scenario**.
There is no minimum number of local comparable sales for this workbook scenario.
The original polygon is unavailable, so matching the postcode does not establish
that a house was inside that selected area. This is not all Aalborg sales or a
national model, and the sample never claims to be locally matched sales for other
areas or property types. It does not match on condition, floor area, plot or
precise location; 2026 is incomplete. First asking and latest episode can describe
different listing periods. The middle-half range describes historical price
falls, not uncertainty about this home's market value or seller acceptance.

The historical calibration retains its dated identity when the weekly runner
refreshes live listing observations. A newly fetched asking price is not a new
completed sale and must not silently alter the sale-discount distribution.
Updating the historical calibration requires reviewed completed-sale evidence
and a new versioned snapshot.
