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
  metadata and ten pooled brackets from `Intervaller!B10:K19`, used by the UI.
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
count/median. Stale or missing formula caches fail before writing. No generated
timestamp is used, so output is deterministic. The expected source SHA-256 is
`b78c3020fe41bac9523cc3972e639c5231da73231c6748020834a8b2f892fab1`.

## Interpretation

The reference prefers the **documented first asking price**, multiplied by one minus
the median **total** price fall from first asking to eventual sale in the relevant
latest-episode duration bracket. Each trade has equal weight. The result is
rounded to the nearest DKK 10,000. The original workbook used DKK 50,000;
that source setting is retained separately as `sourceRoundingDkk`. Q3 of the
historical discount produces the lower price; Q1 produces the upper price. Sales above asking retain negative discounts.
The gap is current asking minus the reference; its percentage uses current asking
as denominator and can be negative.

When documented first-price evidence is unavailable, the listing card can show
an explicitly **approximate scenario** reconstructed from Boligsiden's reported
asking-price percentage: `currentAsking / (1 + changePercent / 100)`. The source
percentage is rounded, so the reconstructed amount is not a documented first
asking price. It is stored as separate source evidence and is not inserted into
listing chronology or historical sale records. The card labels the scenario and
its source observation date. Mismatching current prices, incomplete history,
conflicting latest source evidence, relisted campaigns and future observations
prevent this fallback.

The workbook example, 188 days with first asking DKK 5.5m and current asking DKK
5.2m, falls in the 181–240 day group (22 trades). With the application's 10,000-kr
rounding it gives DKK **4.81m**, an interquartile price range of **4.66–5.08m**,
and a current-price gap of **390,000** (7.5%). The detailed 181–210 day group has
only nine trades; the application uses the ten pooled groups instead.

The calculator requires at least 15 trades and stays within the observed **2–797
days**, even though the last bracket is labelled 366+. Day inputs must be whole
numbers. Missing first asking, missing latest-episode days, insufficient samples,
and invalid models produce explicit unavailable results. If the first asking
price is missing but time is known, the observed discount and transaction count
remain visible without a made-up price. All historical groups are available in
the evidence disclosure for every listing. It never substitutes today's asking
price, cumulative active days or a technical first-seen date for missing inputs.

These are selected **villa** trades from the original **Aalborg/Hasseris map
area**. Villas in postcode 9000 match this coarse sample scope; other or unknown
types/postcodes receive an explicitly labelled **broad historical scenario**.
There is no minimum number of local comparable sales for this workbook scenario.
The original polygon is unavailable, so matching the postcode does not establish
that a house was inside that selected area. This is not all Aalborg sales or a
national model, and the sample never claims to be locally matched sales for other
areas or property types. It does not match on condition, floor area, plot or
precise location; 2026 is incomplete. First asking and latest episode can describe
different listing periods. The interquartile range describes historical price
falls, not uncertainty about this home's market value.

The historical calibration retains its dated identity when the weekly runner
refreshes live listing observations. A newly fetched asking price is not a new
completed sale and must not silently alter the sale-discount distribution. Updating
the historical calibration requires reviewed completed-sale evidence and a new
versioned snapshot.
