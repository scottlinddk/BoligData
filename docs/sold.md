# Sold houses (`/sold`)

Sign-in required. Shows 159 sales in Kærby (38, from an XLSX) and Gl. Hasseris (121, from a CSV): averages, every sale in a sortable table, and a map with three switchable heat layers (original listing price, discount %, time on market).

## Data
- `packages/shared/src/data/sold-properties.json`, built by `analysis/sold/build_sold_data.py` from the two supplied files. Missing values stay `null`; nothing is estimated.
- **Discount %** = (listing − sold) / listing × 100, derived in `lib/sold-stats.ts`. Positive = sold under listing. It reproduces the workbook's own average (6.84 % on 27 Kærby sales, 4.57 % without Åvangen 14).
- Averages use only sales that have the figure (n shown). Gl. Hasseris has no time on market and a listing price on only some rows, so discount rests on 47 sales and time on market on 27 (Kærby only).
- Five sales are flagged as outliers (part sales, a teardown, a ruin) and can be switched off with "Ekskl. afvigende". Two sales with disputed area are left out of m² and price/m².

## Map
- Colour is a kernel-weighted **average** (`lib/sold-surface.ts`), not MapLibre's density heatmap, which would make crowded streets look "hotter" whatever the value. Cell opacity shows how much evidence is nearby. Scale: 5th–95th percentile.
- Coordinates are looked up in the browser from Adressevælger (like `/house-search`) and cached in `localStorage`. Not verified against the live API from the build sandbox.

## Known gaps
- Gl. Hasseris "ask" is used as supplied; whether it is the original or last listing price is not stated in the CSV (one row's ask was derived from a price cut).
- Tyttebærvej 16 (66 m²) and Jagtvej 16 (88 m²) have unusually high kr/m² and may have wrong areas; they are not flagged.
