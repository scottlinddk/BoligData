# Original asking price across broker changes

Verified against public Boligsiden address and timeline responses on 29 September 2026. The reduced snapshots, observation timestamps, source identities, and independently checked expectations are saved in `apps/web/server/lib/crawl/fixtures/boligsiden-original-price.market-period.json` and exercised by `boligsiden-market-period.test.ts`.

| Listing | Current / total source days | Original asking price | Opening date |
| --- | --- | --- | --- |
| [Bakkevænget 20](https://www.boligsiden.dk/adresse/bakkevaenget-20-9000-aalborg) | 187 / 346 | 6,498,000 kr. | 2025-09-30 |
| [Årestrupsvej 4, st. th.](https://www.boligsiden.dk/adresse/aarestrupsvej-4-0-th-9000-aalborg) | 96 / 96 | 875,000 kr. | 2026-06-25 |
| [Estlandsgade 1, 2. mf.](https://www.boligsiden.dk/adresse/estlandsgade-1-2-mf-9000-aalborg) | 393 / 393 | 1,595,000 kr. | 2025-09-01 |
| [Peder Skrams Gade 35, st. tv.](https://www.boligsiden.dk/adresse/peder-skrams-gade-35-0-tv-9000-aalborg) | 495 / 495 | 1,695,000 kr. | 2025-05-22 |
| [Samsøgade 19, 1. tv.](https://www.boligsiden.dk/adresse/samsoegade-19-1-tv-9000-aalborg) | 253 / 429 | 1,295,000 kr. | 2025-07-21 |
| [Hasserishøj 2](https://www.boligsiden.dk/adresse/hasserishoej-2-9000-aalborg) | 732 / 732 | 20,000,000 kr. | 2024-09-27 |

## Bakkevænget regression

The address timeline records an opening at 6,498,000 kr. on 30 September 2025 and removal on 8 March 2026: 159 calendar days. It reopens with the new broker at 6,250,000 kr. on 26 March, followed by reductions to 5,995,000 kr. on 2 June and 5,795,000 kr. on 7 August. At observation, the current broker accounts for 187 days and the source total is 346 days. The 18-day handover gap contributes no days. Subtracting either 187 or 346 days from the observation date misses the September opening.

The resolver first verifies the current listing identity and price history, then accounts for the earlier 159-day period to locate the original opening. The source percentage describes the current broker's price reductions; it must not be used to reconstruct the full original price.

## Other boundaries

Estlandsgade and Peder Skrams Gade have apparent removals and reopenings within the source's current duration. Those pauses must not be subtracted from that verified span. Boligsiden's [duration guide](https://www.boligsiden.dk/guides/boligsalg/det-skal-du-vide-om-liggetider-og-salgstider) explains current versus total duration and that time marketed privately after a public listing can still count.

The older Elme Alle 12 snapshot also verifies a one-day broker overlap: the previous broker's 378 days plus the current 28 days overlap by one, matching the source total of 405. Its original is 5,995,000 kr. on 19 August 2025, rather than the latest broker's 5,598,000 kr.

The seventh fresh snapshot, [Hasserisvej 124B](https://www.boligsiden.dk/adresse/hasserisvej-124b-1-mf-9000-aalborg), remains unresolved. Its 221-day total includes older periods that do not reconcile to complete opening-to-closing spans in the rolling three-year window. The resolver reports a duration conflict rather than labelling the current broker's price as a proven total-period original. Missing older openings, contradictory totals, sales between periods, and indistinguishable zero-day periods similarly remain explicit failures.

These checks verify source interpretation and local code. Production requires deployment followed by the audit/write/re-audit procedure in [original-asking-price-backfill.md](original-asking-price-backfill.md).
