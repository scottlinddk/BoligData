# Interaction and loading review

The review focused on search, listing details, private research, recommendations,
dialogs and shared feedback. Motion should explain a change or show that a request
is still running. It should never delay an action or imply data has arrived.

## Implemented

| Area | Behavior |
| --- | --- |
| Listing section links | “Se pris efter liggetid” scrolls smoothly to “Pris efter liggetid”, clears the 80px sticky header and focuses the destination. Direct section URLs work after the listing loads. Research disclosure navigation also moves focus. |
| Search | Loading status stays in the results header, including map view. Matching results remain visible during pagination, with their original range until the new page arrives. Changing filters, drawn area or account clears old results. Pagination scrolls and focuses the results. |
| Listing and gallery images | Placeholders reserve the photo space; loaded images fade in. A failed optimized image tries the original once, then shows the existing no-photo message. The lightbox shows progress and retains keyboard navigation, dismissal and focus restoration. |
| Saving | Favorites and saved searches show pending feedback, prevent duplicate actions and report failure. |
| Listing data | Detail fetches offer retry; comparable homes show loading before an empty result. Empty register sources no longer show an endless loading message. |
| Research | Project profile and statistics show loading placeholders rather than empty/default content. Private research loading uses readable status text; the workspace and switched tab content enter subtly. Saving the project profile shows progress. |
| Recommendations | Profile, clients and recommendation requests distinguish loading, failure and empty results. Retry is available. Send/response actions show progress and retain drafts on error. A send failure remains visible even if its dialog was dismissed. |
| Shared UI | Reusable spinner, status and skeleton components; subtle dialog/toast entrances; focus returns to dialog openers. Auth guards show an accessible loading status. |

## Motion rules

- Entrances last 180ms and move at most 4px; photo fades last 300ms.
- `prefers-reduced-motion: reduce` disables animation, transitions and smooth scrolling.
  Loading text and static placeholders remain visible.
- Spinners indicate pending work only. Empty and failed results use text, not indefinite animation.
- No new runtime dependency or artificial loading delay was added.

## Reviewed and retained

- Dashboard/admin skeletons, form submit labels, navigation hover states and mobile
  menu feedback already exist. The shared reduced-motion rule covers their animations.
- Maps already distinguish initial load, theme updates, viewport queries and errors.
  Their camera/drawing interactions retain existing behavior.
- Native disclosure expansion and dialog dismissal remain immediate. Adding delayed
  exits or height animations needs a separate focus/layout design; there is no value
  in animating every content block.
- Message-thread scroll behavior and route-level scroll restoration merit a separate
  navigation review, especially preserving reading position and returning to search.

## Verification

- Frontend, API and shared-package TypeScript checks.
- Production Vite build.
- 1,111 Vitest tests, including nine query-observer tests covering pagination,
  changed filters/boundaries, account changes and failed refreshes.
- Local Chromium checks with intercepted fixture responses: anchor positioning/focus,
  async deep links, image failure, favorite failure, search states and dialog interaction.
  Normal and reduced motion, desktop and mobile layouts are included. These checks do
  not exercise a production account or write production data.
- Repository lint command currently fails because no ESLint configuration is present.
