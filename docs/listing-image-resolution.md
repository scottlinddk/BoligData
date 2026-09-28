# Listing image resolution

The Boligsiden search feed puts image dimensions in
`images[].imageSources[].size.{width,height}`. The old mapper read flat
dimensions and persisted only the first URL, usually a 100×80 thumbnail.
The UI then requested arbitrary CDN sizes, received HTTP 403 and fell back
to that thumbnail, including in the fullscreen gallery.

The mapper now retains the supplied sizes (and accepts older flat payloads).
The UI selects the smallest variant covering the requested size, capped at
the largest source image. Responsive `srcset` widths describe actual pixels.
Already stored Boligsiden thumbnail-only rows recover the verified 300×200,
600×400 and 1440×960 presets at render time, with no database mutation or
recrawl required. Original URLs remain error fallbacks. New feed variants
take precedence over the legacy preset recovery.

## Live verification — 2026-09-28

- Public feed: <https://api.boligsiden.dk/search/cases?per_page=1&page=1>
- Observed case: `552375e5-9f48-4445-ae48-bba7c8e74b51`
- Observed image: `120596e0-16d2-41e7-b029-831d20c04e61.webp`
- CDN path: `https://images.boligsiden.dk/images/case/<case>/<size>/<image>`
- Advertised sizes 100×80, 143×118, 300×200, 600×400, 600×600 and 1440×960
  all returned HTTP 200 and `image/webp`.
- The 100×80 response was 1,832 bytes; 600×400 was 39,438 bytes;
  1440×960 was 176,066 bytes. WebP headers confirmed the actual decoded
  dimensions matched all three URLs.
- Previously requested 800×500, 1800×1200 and 2000×1333 returned HTTP 403.

Only the exact Boligsiden CDN host and known case-image path qualify for
legacy recovery. Other image providers keep their supplied URLs/variants.
The public Boliga API returned a Cloudflare challenge during verification;
no unverified Boliga resizing rules were introduced. This change cannot
restore detail beyond the largest image the source provides.
