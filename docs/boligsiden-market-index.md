# Boligsiden area price comparisons

Open **Mit boligprojekt → Statistik** to compare Denmark with a municipality.
The chart and expandable table use Boligsiden's published monthly sale price per
m² for **Villa/Rækkehus**, matching the [linked Markedsindeks selection](https://www.boligsiden.dk/markedsindeks?locationType=country&locationName=danmark&addressType=villa_raekkehus&statType=sold_per_area_price#statistic-section).

The imported snapshot in `packages/shared/src/data/boligsiden-market-index.json`
contains Denmark, all 98 municipalities, and Christiansø (a separate category in
the source's municipality selector). The initial import on 2 October 2026 covers
January 2011–August 2026: 188 months, 17,630 numeric observations and 1,170 missing
area/month observations. Christiansø and Læsø have no published values in this
extract. An unknown value stays `null`; the chart leaves a gap and the table shows
“Ukendt”. Municipal prices are compared with Denmark in the same calendar month.

The August 2026 values were checked against the rendered source chart:

| Area | Sale price per m² |
| --- | ---: |
| Denmark | 20,210 DKK |
| Aalborg | 17,109 DKK |

These are aggregate market statistics, kept separate from individual registered
sales and property valuation calculations. Boligsiden describes its calculation
and suppression rules in its [Markedsindeks methodology](https://www.boligsiden.dk/information/boligsidens-markedsindeks-aabner-doeren-til-boligmarkedet).

## Refresh

Run from the repository root with Node.js 20+ and curl installed:

```sh
pnpm data:market-index
# Equivalent without pnpm:
node scripts/update-market-index.mjs
```

The command POSTs the 100 existing geographic selectors in one request to
`https://api.boligsiden.dk/cases/stats`. It identifies the project with its usual
User-Agent and uses the public site's Origin/Referer. It needs no API key, browser
cookie or account. This is an undocumented public API; its shape or availability
may change. During verification, Node's native fetch received HTTP 403 while
ordinary curl requests succeeded, so the refresh command uses curl directly
without a shell, with a timeout and bounded output.

Each request asks for `sold_per_area_price`, address type
`villa and terraced house`, and dates from `2011-01-01` through the refresh date.
The response is an array in selector order; each element is an **unsorted** list
of monthly records or `null`. `from`/`to` are calendar month boundaries. Denmark
is returned as `Denmark`, although its request name is `Danmark`.

The importer validates metric, housing type, area identity, dates, values and
duplicate months, sorts observations, and pads missing months with `null`.
Incomplete national history, older coverage, disappearance of a previously
available area, HTTP failure, or invalid JSON stops the refresh and leaves the
previous file intact. Only validated data is written, through a temporary file
and rename. The source timestamp records retrieval time, not the statistics month.

Review and commit the data change, then deploy the frontend normally. The UI
explicitly labels the capture date and that the snapshot does not update
automatically. No scheduler, API function, secret or database migration is added.

## Validation

```sh
node --test scripts/update-market-index.test.mjs
pnpm typecheck
pnpm test
pnpm build
```

Importer tests cover source identity, null series, malformed periods, conflicting
duplicates and failed-refresh protection. Frontend tests cover exact month
alignment and gaps. Browser checks should verify municipality selection, the
latest month, the full month table, and an unavailable area such as Læsø.
