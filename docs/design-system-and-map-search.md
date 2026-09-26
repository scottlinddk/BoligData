# Listing design and drawn-area search

BoligData now follows the supplied listing-page reference: a white background, navy text, royal-blue actions, compact rounded filters, photo-led cards and a charcoal footer. The existing brand, research tools, sign-in requirements and account roles remain available. Shared light/dark tokens live in `apps/web/src/index.css`; Tailwind maps components to these tokens. Inter is the main typeface with system fallbacks. Status colors retain their original meanings.

The search page shows a two-column listing grid beside a full-height sticky map on screens at least 900px wide. The list toggle expands the listing grid. Phones have separate list/map views with the same filters and boundary. Advanced filters use a native modal dialog for focus containment, Escape dismissal and returning focus to the opener. Header navigation collapses below 1024px. Reduced-motion preferences and visible keyboard focus are supported.

## Search a drawn area

1. Sign in, open the map and choose **Tegn område / Draw area**.
2. Click or tap at least three corners. The dashed preview shows the proposed area. **Undo point** removes the latest corner; **Cancel** or Escape keeps the previously committed area.
3. Choose **Finish area** to search. The solid blue boundary and translucent fill remain visible while panning or zooming. **Use visible map area** offers a keyboard-accessible rectangular selection using the map's current bounds.
4. **Remove area** clears the polygon while keeping the other filters. A new drawing replaces the committed boundary only after successful validation.

The polygon is part of the URL and saved-search filters. API requests intersect it with ordinary text/type/price/size/date filters and, for map markers, the visible viewport. Exact spatial filtering runs in PostGIS before sorting, pagination and counting; it is never applied only to the currently loaded list page. Price pills and clustered counts describe the retrieved viewport. If the server's page cap limits the markers, the map displays a count and zoom-in hint.

Rings accept 3–64 distinct longitude/latitude points, with an optional closing coordinate. Collinear, self-crossing, out-of-range and ambiguous world-spanning shapes are rejected. Concave polygons and boundary points are supported. Invalid URL/API shapes return an error instead of silently widening the search. A geometry GiST index and `ST_Covers` use the same coordinate semantics, and the RPC runs as the caller so table RLS continues to apply. Existing anonymous API responses remain address-only.

## Deployment and verification

Apply `packages/supabase/migrations/024_drawn_search_boundary.sql` after the existing migrations and **before deploying the new API**. It adds the geometry index and `properties_in_boundary` function. This implementation does not apply it to a production database. There are no additional Vercel API functions or runtime dependencies.

Run the normal typechecks, test suite and production build. The CI workflow also runs `scripts/verify-search-boundary.sql` in a disposable PostgreSQL/PostGIS service: it verifies the actual migration, concavity, edge inclusion, input rejection, RLS, filters, counts and pagination, then rolls back the fixture transaction. The script refuses to run where the application's properties table already exists.

For browser checks, start the local web server with `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --mode production` from `apps/web`, then run `node scripts/map-search-browser-smoke.cjs` from the repository root. The test uses the real MapLibre canvas with synthetic listings, images, geography and auth; all remote requests are intercepted. It exercises drawing, invalid shapes, undo/cancel, panning, URL reload, saving/removal, desktop/tablet/mobile layouts, touch input, keyboard dialog behavior and dark mode. `scripts/research-browser-smoke.cjs` checks the research workflow against the shared design tokens.
