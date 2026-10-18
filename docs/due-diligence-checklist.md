# Due-diligence checklist sources

Checked live on 18 October 2026. Before this change every item on a listing came back "?" because the crawl never reached the registers: DAWA answers `410 Gone`, the Datafordeler DAR fallback query was invalid (`adgangspunkt` has no subfields, `adresseringsvejnavn` is not a filter field), so no listing got a husnummer, so BBR was never asked. Noise had no configured layer and the soil endpoint answered HTTP 406. In the database: 0 of 990 listings had BBR data, 4 had a noise value.

| Item | Source | Answer | Verified |
|---|---|---|---|
| Address (prerequisite) | Adressevælger search `adressevaelger.dk/husnumre/soeg`, then `/husnumre/{id}` | Husnummer id, coordinates, municipality code. Only an exact street + number + postcode match is accepted | Live, 5 Nordjylland listing addresses |
| Noise | Miljøstyrelsen WFS `wfs2-miljoegis.mim.dk/stoej/ows`, 7 Lden 1.5 m layers (roads in town, major roads, rail in town, major rail) | The loudest mapped band, e.g. 60–64 dB, as a warning (every band reaches the 58 dB guideline). No band on any layer: "not in a mapped noise zone" (ok). A failed layer: unknown | Live: Vesterbro 75+, Boulevarden 65–69, Kastetvej 60–64, Nibe none. About 1 s |
| Encumbrances | none (tinglysning.dk has no open API) | Always a warning with a link to tinglysning.dk | n/a |
| Sewer separation | none nationwide | Always a warning with the municipality's site | n/a |
| Building cases | WebLager (Aalborg only) | Link | unchanged |
| Oil tank | BBR heating via Datafordeler GraphQL, keyed by the husnummer | `oliefyr` warning. District heating, heat pump, electric, gas, solid fuel: ok, naming the heating. Central heating or stoves with no fuel recorded: unknown | **Not verified live** (no API key in the development sandbox). Production logs show the key is accepted by Datafordeler |
| Soil contamination | Danmarks Miljøportal WFS `jord.miljoeportal.dk/geo/wfs`, `DKJord:View_V1Flader` and `View_V2Flader` | V1/V2 warning with the site's name and the register's attest link. Neither: ok. A failed layer: unknown | Live: the V2 gasworks site on Nyhavnsgade, a V1 site on Vesterbro, clear points elsewhere |

## Choices and limits

- **Noise uses the EU mapping layers (2017 rail, roads undated/2020), not the 2022 Danish Nord2000 maps.** The 2022 maps are only reachable through MiljøGIS's own map process, which took 12 to 37 seconds per layer and up to 6.7 MB per answer in the same test. The EU layers cover the four largest towns (including Aalborg) and major roads and railways everywhere; smaller roads outside those towns are not mapped, which the checklist's source line says. The listing page's separate noise panel still shows the 2022 maps.
- **Soil is the address point, not the whole parcel.** A parcel mapped only away from its address point reads as clear, so the source line keeps the map link.
- **The oil tank answer is the heating, not the tank register.** BBR's technical installations (`BBR_TekniskAnlaeg`, which records oil tanks and their decommissioning) can only be filtered by its own id, so it cannot be reached from an address in one query.
- **Listing pages show live answers.** The page's register lookup now builds the flags for listings too, and each item takes the live answer when there is one and the crawl's stored answer otherwise (`mergeRiskFlags`).
- **Stored rows heal on the next crawl.** `enrichmentNeedsRefresh` already re-enriches a listing whose register status is not `real`, so every listing the crawl sees gets the new answers. The crawl also no longer overwrites a stored husnummer, matrikel or BFE with null when this run's lookup fails.

## Refreshing stored listings

The crawl only enriches listings the feed returns, a few at a time, so rows that have left the feed would keep their old "?" answers. The **Backfill due-diligence checklist** workflow (`.github/workflows/backfill-risk-flags.yml`, `server/lib/crawl/backfill-risk-flags.ts`) re-answers every stored property from the registers:

- It is a dry run unless `write` is ticked. A dry run queries the registers and prints counts of what answered for real (`noiseReal`, `soilReal`, `bbrReal`), and writes nothing.
- It writes only `risk_flags`, `bbr_data`, `public_valuation` (when a register answered), the register keys of `source_status` and `enriched_at`. Sold-price history and the other enrichment columns are kept. On `properties` it only fills empty `id_lokalid`, `matrikelnr`, `ejerlav`, `zone` and `bfe_nummer`, never replaces one.
- A property without live provenance (`data_mode` other than `real`) is never searched by address. Its stored husnummer id is used.
- `only_stale` (default on) skips properties whose noise, soil and BBR already answered for real, so it can be re-run.

## BBR in production

Stored enrichment rows show BBR failing with `Failed to parse URL from services.datafordeler.dk/BBR/BBRPublic/1/rest/GetInstance?apiKey=...`. No such address exists in this repo, so it comes from the `DATAFORDELER_BBR_API_BASE` environment variable, set to a legacy REST address without a scheme. The client treats an explicit base as deliberate and never probes around it, so every BBR lookup failed. Now a base that is not an https GraphQL endpoint is ignored and the default version walk applies. Errors from `fetch` itself also no longer quote the request URL, which carried the API key into `enrichments.source_status`.
