# MiljøGIS listing noise maps

Verified 28 September 2026 against the public [noise map](https://miljoegis.mim.dk/spatialmap?profile=noise) and [Miljøstyrelsen's mapping explanation](https://mst.dk/erhverv/rent-miljoe-og-sikker-forsyning/stoej/kortlaegning-af-stoej).

This panel queries the **2022 Danish Nord2000 layers at 1.5 m**, separately for Lden (annual average with evening/night penalties) and Lnight (annual night average, 22–07). It does not combine source contributions or convert bands into an exact dB value. It does not replace the historical/project-specific Tredjekort panel or feed the legacy scalar `noise_exposure` risk score. The old optional WFS enrichment remains separate; no guessed Plandata layer is used here.

## Verified native service

The public map's `SpatialServer.Datasource.execute` implementation in `/clientapi/minimap2/2.14.x/minimap.js` selects `spatialserver.datasource.execute-wkt-filter` for a WKT filter. Its vector loader uses `maxrow` and treats a result at that limit as incomplete. The adapter uses the same native process, a single EPSG:25832 `POINT`, and `maxrow=20`:

```text
https://miljoegis.mim.dk/spatialmap?profile=noise&page=spatialserver.datasource.execute-wkt-filter&datasource=ds_dk_2022_noise_vej_1_5m&command=read&wkt=POINT%28555000%206320000%29&filterWithWkt=true&maxrow=20&outputformat=json&jsonformat=compact
```

An actual point response from the urban-road Lden layer contained one polygon with `isov1:53`, `isov2:58`, `ogc_fid:16964`, `shape_wkt:POLYGON (...)`. The fixture `apps/web/server/lib/miljoegis-noise/fixtures/urban-road-2022.json` preserves its complete polygon and band attributes, removing unrelated attributes. The source schema is also exposed through `page=spatialserver.datasource.get&datasource=...`. The first successful point lookup took 13 seconds; subsequent public-service probes timed out at 20 seconds, so production lookups allow 40 seconds within the existing 60-second function budget. Unavailability is displayed explicitly.

Final adapter smoke checks ran sequentially after that research, using the implemented projection, native request, row cap and independent geometry/band parsing:

| Listing/map point (latitude, longitude) | Selected layer | Actual adapter result | Duration |
| --- | --- | --- | --- |
| Aalborg test point (57.0202, 9.90598) | Urban roads, Lden | 53–58 dB(A) | 12.429 s |
| Slåenvej 18, 9000 Aalborg (57.03966723, 9.86901381) | Urban roads, Lden | No matching contour; noise level remains unknown | 15.597 s |
| Aalborg test point (57.0202, 9.90598) | Urban roads, Lnight | 45–50 dB(A) | 14.613 s |

The Slåenvej coordinates independently resolve through DAWA to `[552733.74, 6322137.06]` in EPSG:25832; the adapter's projection agrees within 0.02 m. These probes verify the day/night point workflow, not nationwide availability of every layer.

The profile's `/rest/profile/noise/themes/all` lists these datasets and their metadata. That endpoint and the legends accept the anonymous `Session-id` token set by the public map page; the verified point process also answered without a session. The adapter does not collect cookies or require a secret/key.

| Source | Datasource suffix (prefix `ds_dk_2022_noise_`) | Lden bands, dB(A) |
| --- | --- | --- |
| Roads in mapped urban areas | `vej_1_5m` | 53–58, 58–63, 63–68, 68–73, over 73 |
| Major state roads | `stoerre_veje_1_5m` | same road bands |
| Sund & Bælt roads | `sogb_veje_1_5m` | same road bands |
| Railways | `jernbane_1_5m` | 54–59, 59–64, 64–69, 69–74, over 74 |
| Metro, light rail and local railways | `mll_bane_1_5m` | same rail bands |
| Sund & Bælt railways | `sogb_bane_1_5m` | same rail bands |

For all six Lnight layers, insert `_nat` before `_1_5m`. Their legends show **45–50, 50–55, 55–60, 60–65, over 65**. All twelve legend images were checked individually using `/wms?servicename=noise&service=WMS&request=GetLegendGraphic&version=1.1.1&format=image/png&layer=<datasource>&sessionid=<anonymous-session>`. Native numeric encoding of the open top categories has **not** been verified, so equal or unexpected bounds return an unknown result instead of an invented top band.

## Scope and limits

- Only one selected source/metric is queried at a time, defaulting to urban roads Lden. The selector and result explain this scope. Aircraft, industrial noise, EU CNOSSOS/4 m layers and older rounds remain available in the official map, outside this panel.
- A missing contour means no matching contour in this selected dataset. It is not a coverage certificate, quiet classification, below-threshold value, or a measured zero.
- The listing's stored map coordinate is projected to UTM32/GRS80. No caller-supplied coordinate or arbitrary layer URL is accepted. This is mapping precision, not a survey, façade maximum or prediction at every part of the property.
- Exact polygon containment is checked independently, including holes and multiple polygons. Points within one metre of a returned contour boundary and overlapping distinct bands are marked uncertain.
- Server requests are authenticated through the existing property route and user-scoped database client. HTTP responses are private/no-store. Per-process results cache for 15 minutes, failures for 15 seconds, capped at 128 entries; identical in-flight lookups are deduplicated. Client query keys include the user, property, source and metric. No automatic retry fan-out occurs.
- Full responses are bounded at 4 MiB, individual geometries at 500,000 characters and results at 20 features. A response at the requested row cap is unknown, never an empty/missing contour. Malformed geometry, invalid bands, HTTP errors and timeouts stay distinct from no-hit.
- The public native process is used by the map but has no documented availability SLA. It can be slow; official source links remain available in failure states. Tests use a captured source fixture and mocked failures, without contacting MiljøGIS in CI.
