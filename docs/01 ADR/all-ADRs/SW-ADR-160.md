# SW-ADR-160 — Four client libraries for motion: Lenis, GSAP, Vanta (with three.js), React Bits

| Field | Value |
|---|---|
| ADR | `SW-ADR-160` |
| Pack | `SPENDWISE_V1` |
| Type | ARCHITECTURE |
| Decision status | **APPROVED** |
| Decision outcome | APPROVED_FOR_IMPLEMENTATION |
| Decided by | **CLIENT**, instruction 2026-10-21 |
| Decision date | 2026-10-21 |
| Release decision | RELEASE |
| Release status | RELEASED |
| Extends | `SW-ADR-016` (the stack lock: these are additions to the client, not substitutions) |
| Sources | owner instruction 2026-10-21 · `SW-ADR-016` · `SW-ADR-158` · `SW-ADR-159` |

## Context

`SW-ADR-016` locks the stack, and its consequences say a change is "a new superseding ADR with the
client's ruling". On 2026-10-21 the owner asked for four libraries by name:

- **Lenis**, for smooth scrolling;
- **GSAP**, for animation and text effects;
- **Vanta**, for interactive 3D backgrounds;
- **React Bits**, a collection of copy-paste React components.

None of them replaces anything the lock names. React 18, Vite and plain CSS stay, with no UI
framework, so this record **extends** `SW-ADR-016` rather than superseding it.

## Decision

1. Added to `client/package.json`, each pinned to an exact version at least two weeks old when added:
   - `lenis` 1.3.26, MIT;
   - `gsap` 3.15.0, under GSAP's Standard "no charge" license, which is free for commercial use but
     is not an open-source licence;
   - `vanta` 0.5.24, MIT;
   - `three` 0.134.0, MIT.
2. `three` is pinned to r134 on purpose. Vanta's last release (2022) targets three.js of that era,
   and newer three.js removes APIs some Vanta effects use. Any future direct use of three.js
   inherits this pin, or a new record changes it.
3. **React Bits is not an npm dependency.** It is a source of components copied in one at a time
   when a design calls for one. Its plain-CSS variants are used, never its Tailwind ones (plain CSS
   is locked). Each copied component is credited in a comment with its origin and licence. It
   follows the project's rules on tokens (no raw hex), reduced motion and accessibility, like any
   other component.
4. Installing does not change what ships. Vite bundles only what is imported, and nothing imports
   these yet. Each later use states its reduced-motion behaviour, and on a phone it must keep the
   smoothness bar of `SW-ADR-159` (a steady 60 fps measured).
5. `npm audit --omit=dev` reported 0 vulnerabilities after the install.

## Consequences

- The motion stack is now CSS, View Transitions (`SW-ADR-158`) and canvas (`SW-ADR-159`), plus
  these. GSAP and Lenis must not fight the existing CSS entrances or the theme flood. The first
  use of each says which one owns which motion.
- Vanta with three.js is heavy, roughly 150 to 600 KB depending on the effect. It loads only on
  the page that uses it, ideally split into its own chunk with a dynamic `import()`.
