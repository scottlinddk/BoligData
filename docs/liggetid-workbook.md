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

The card shows a historical price scenario whenever a positive, finite first or
current asking price is available. The displayed amount is always rounded to the
nearest DKK 10,000. The original workbook used DKK 50,000; that source setting is
retained separately as `sourceRoundingDkk`. `calculationVersion` identifies the
application's scenario rules independently of the dated source snapshot. A small
positive scenario may round to zero; the UI labels this as below the rounding
threshold, rather than a free property. A zero asking-price input is still invalid.

The price basis follows this order:

1. A documented first asking price is preferred. A first price reconstructed from
   Boligsiden's rounded asking-price change remains an explicitly approximate
   scenario: `currentAsking / (1 + changePercent / 100)`.
2. If neither is available, the calculator uses the current asking price as an
   explicitly labelled **current-price scenario**. It does not treat this amount
   as the original asking price, insert it in listing chronology, or claim that
   any resulting reduction is still available from the seller. Prior reductions
   may effectively be counted again, so the scenario is an assumption.
3. Without either positive price, there is no invented krone amount. The
   historical data remain accessible.

The adapter remains responsible for rejecting conflicting, future, incomplete or
otherwise unreliable first-price evidence. Rejecting that evidence does not
prevent a separately labelled scenario based on the listing's current price.
The calculator reports `priceBasis` (`first_asking` or `current_asking`) and the
actual `baselinePrice` used, without changing the input evidence.

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

Each eligible sale has equal weight. The calculation is
`baselinePrice × (1 − median historical total price fall)`. Q3 of the discount
produces the lower scenario price; Q1 produces the upper price. Sales above
asking retain negative discounts. The gap is current asking minus the scenario;
its percentage uses current asking as denominator and can be negative.

At 188 days, first asking DKK 5.5m and current asking DKK 5.2m, the 181–240 day
group (22 trades) gives DKK **4.81m**, a middle-half range of **4.66–5.08m**, and a
current-price gap of **390,000** (7.5%). If the first asking price is missing, the
same group applied to current asking gives an explicitly hypothetical **4.55m**
scenario. With unknown duration and current asking DKK 5.2m, the all-sales median
discount of approximately **5.9894%** gives **4.89m**, with **4.53–5.06m** as the
middle-half historical range.

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
