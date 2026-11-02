# House search (`/house-search`)

A household's shared log of the individual listings it has looked at, with statistics and a heatmap of where the family is searching. The goal is to understand what the family wants, not only to store addresses.

## What it does

- **Log a listing**: pick an address from the autocomplete (so it can be placed on a map), date seen, asking price, rooms, status (interested / viewed / rejected), a 1 to 5 rating and notes. Price and rooms are optional.
- **Shared**: a user creates a household and sends the invite code to their partner. Everyone in the household sees and edits the same list.
- **Map**: a heatmap or pins. Two weightings: *Where we look* (every listing counts the same) and *Where we want to live* (weighted by rating, rejected listings barely count).
- **Statistics**: count, median price and rooms, price distribution, rooms, postcodes, listings per month.
- **What you seem to want**: the middle half (25th to 75th percentile) of price and rooms among listings rated 4 or 5 and not rejected, plus a rejected-versus-kept comparison. It is only shown with at least 3 such listings; before that it says how many more ratings are needed.
- **Filters** (status, date range) apply to the map, statistics and list, and live in the URL so a filtered view can be shared.
- Each listing links to `/address/:husnummerId` for the register facts (BBR, valuation).

## Design decisions

- **No new serverless function.** `api/` is at the Hobby plan's cap of 12 (`server/api-function-budget.test.ts`). The client talks to Supabase directly and row-level security does the access control.
- **Coordinates come from the browser.** After the address is picked, `lib/house-search-geocode.ts` reads the access point from Adressevælger (open, CORS enabled) and converts EPSG:25832 to WGS84. The converter moved to `packages/shared/src/utils/etrs89-utm32.ts`; `server/lib/geo/etrs89-utm32.ts` re-exports it, so server code is unchanged.
- **A failed coordinate lookup never blocks saving.** The entry is kept, counted in the statistics, and marked "not on map". The map says how many listings it shows.
- **Price input is strict.** `3.495.000`, `3 495 000` and `3495000 kr.` are accepted. `3.5` and `3,5 mio` are rejected rather than read as 35 or 3, and anything under 10,000 DKK is flagged as a likely typo.
- **The heatmap is not trusted with few points.** Under 15 located listings the page warns that a density map can exaggerate chance clusters and suggests pins.
- **Popups use `textContent`**, never `innerHTML`: addresses and notes are user input.

## Database (migration `033_house_search.sql`)

Tables: `households`, `household_members` (one household per user), `house_search_entries` (unique per household, house and day).

All policies use `is_household_member()` (security definer, avoids policy recursion). Clients cannot write households or memberships directly: they call `create_household(name)` or `join_household(code)`.

**Apply migration 033 before deploying.** It has not been applied to any database by the implementation task.

## Known limits

- Invite codes cannot be rotated, and there is no "leave household" or "remove member" yet. Joining is capped at 6 members. The code is 12 hex characters from a CSPRNG (about 48 bits) and there is no rate limit on `join_household`.
- The address of an entry is fixed. To move one, delete and re-add it.
- Rooms are typed in. BBR could prefill them, but a lookup spends one of the account's 30 register lookups per hour, so it is not automatic.
- One list read returns at most 1000 entries (PostgREST default). Far above a family's use, but not paginated.
- The page is in the header navigation. The mobile tab bar has five slots already, so on a phone it is reached through the menu.

## Verification

- `src/lib/house-search.test.ts`: form parsing, geocoding, statistics, heatmap weighting, filters and database mapping (34 tests).
- Exercised in Chromium against a **mocked backend** (fake Supabase REST, address API and map style): household creation, validation, geocoding, duplicate handling, popup, edit, delete, statistics, URL filters, dark theme and a 390px viewport.
- **Not verified:** the migration and RLS policies against a real Supabase database, and real Adressevælger and map-tile responses. Check these after applying 033: sign in with two accounts, join with the code, and confirm a third account sees nothing.
