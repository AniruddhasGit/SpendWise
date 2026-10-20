# SW-ADR-160 — The signed-out scene: an instant front, a styled arrival, the tree carried to sign-in

| Field | Value |
|---|---|
| ADR | `SW-ADR-160` |
| Pack | `SPENDWISE_V1` |
| Type | DESIGN_SYSTEM |
| Decision status | **APPROVED** |
| Decision outcome | APPROVED_FOR_IMPLEMENTATION |
| Decided by | **CLIENT**, instructions 2026-10-21, approved by wireframe |
| Decision date | 2026-10-21 |
| Release decision | RELEASE |
| Release status | RELEASED |
| Extends | `SW-ADR-016` (two client libraries: GSAP, Lenis) |
| Amends | `SW-ADR-159` (the landing's arrival; light mode for the scene) · `SW-ADR-156` (the sign-in page joins the scene) |
| Sources | owner instructions 2026-10-21 · wireframe "Flow" board · `SW-ADR-014` · `SW-ADR-020` |

## Context

On Render's free plan the server sleeps after about 15 minutes idle. A visitor then sees Render's
own "waking up" page for 30 to 60 seconds. The owner chose the free fix: an always-on front. They
also asked for the following:

- the tree and fog to appear instantly, with a countdown until the site opens;
- the rest of the landing page to pop in "smoothly with some style" when it opens;
- smooth scrolling everywhere;
- one light/dark switch on the landing and sign-in pages, dark by default, with matching colours;
- the same tree carried to the sign-in or create-account page. The tree shrinks smoothly while the
  old words leave and the new ones arrive dramatically, and the fog draws in round the tree.

The owner also ruled: **no reduced-motion fallback** on these pages. They said "do not want that
reduced motion thing".

## Decision

1. **Libraries.** `gsap` 3.15.0 (Standard no-charge licence, free for commercial use, not open
   source) and `lenis` 1.3.26 (MIT), both exact pins at least two weeks old. They are added to the
   client, not substituted, so `SW-ADR-016` is extended. Their source repositories are not copied
   into this repo: the owner's reusable skills for them live in `D:\Project\claude_leash`.
2. **The instant front.**
   - The page shows the tree and fog at once. `lib/scene.js` asks `/healthz` every 2.5s while a
     visitor waits. That endpoint touches no database, so Neon is not polled, and it stops once
     the server answers, so it is not a keep-awake ping.
   - The countdown starts at 45s and appears only after 350ms, so a server that is already awake
     never flashes it. It opens the moment the server answers, and past zero it reads "Almost
     there" rather than going negative.
   - The session check (`/api/auth/me`) waits for the server.
3. **The arrival.** A GSAP timeline, about 1.5s: the bar slides down, the headline is split into
   letters that rise through a 3D turn, the line sharpens up, the button springs in, then the
   scroll cue. Below the fold, ScrollTrigger lifts and sharpens each detail as it is scrolled to.
   This replaces the `.sw-focus` blur-in on the landing.
4. **Smooth scroll everywhere.** Lenis runs on GSAP's ticker, one loop shared with ScrollTrigger.
   The expense panel and the side rail scroll natively (`data-lenis-prevent`).
5. **One scene, one switch.**
   - The landing and sign-in pages share the scene and a sun/moon switch.
   - The scene is **dark unless light was chosen**, so "System", the app's default, shows dark
     there.
   - While signed out, the whole document wears the scene's theme, so the card and inputs match.
     Signing in restores the person's own choice.
   - Light mode is the same scene at dawn: new `--sw-dawn-*` tokens, which the dusk tokens are
     pointed at.
6. **Carrying the tree.**
   - The words leave first: the headline's letters scatter, the side text slides off, the bar
     lifts away.
   - The browser's own View Transitions then morph the tree picture (`sw-tree`) from the landing
     to its sign-in spot in 950ms. The glass floor fades as the tree leaves it.
   - The landing fog sinks and dissolves while the sign-in page's fog gathers in round the tree.
     The fog is a pool there (`<Fog pool>`).
   - The sign-in words then arrive one after another. "Back to the home page" plays the same move
     in reverse.
7. **Motion preference.** On the signed-out scene the tree, the fog and these animations run
   whatever the visitor's `prefers-reduced-motion` setting, by the owner's ruling. The signed-in
   app keeps its existing reduced-motion behaviour.
8. **Hosting.** The front is a Render free static site serving the same `client/dist`. Rewrites
   send `/api/*` and `/healthz` to the web service, so the browser stays same-origin (no CORS,
   `SW-ADR-020`), and it carries the API's security headers. **Created 2026-10-21 with the owner's
   permission:** `spendwise-front`, service `srv-dbbu5rg473hc73cias3g`,
   https://spendwise-front.onrender.com. Verified through it: the page and its security headers,
   `/healthz` (200, empty), a GET to `/api/auth/me` (401 JSON), and a POST to `/api/auth/login`
   (401 JSON, shown as "Wrong email or password" in a real browser). A real sign-in carrying the
   session cookie through the rewrite was not tested by the build session (no test credentials),
   so it is **unverified until the owner signs in there**. It does not auto-deploy: deploy it
   alongside the web service.

## Consequences

- The front lives at a new `*.onrender.com` address. The old address keeps working, but a visit
  to it while the server sleeps still shows Render's page.
- The owner's motion ruling means people who ask their device for reduced motion get the full
  animation on these two pages. It is recorded so it can be reversed with one instruction.
- Browsers without View Transitions (older Firefox) switch pages instantly, with the entrances
  still played.

## Tests

The browser suite passed in full, 57/57, after the change. On the first run two tests failed
intermittently; both passed when run alone and in a second full run. Flow screenshots were checked
for: the countdown under a simulated sleeping server, the arrival, the carry-over both ways, light
mode, a 390px phone (no overflow), and a steady 60 fps on the landing.
