# SW-ADR-159 — The landing scene: a gloomy dusk, a glass floor, ground mist

| Field | Value |
|---|---|
| ADR | `SW-ADR-159` |
| Pack | `SPENDWISE_V1` |
| Type | DESIGN_SYSTEM |
| Decision status | **APPROVED** |
| Decision outcome | APPROVED_FOR_IMPLEMENTATION |
| Decided by | **CLIENT**, instructions 2026-10-20 |
| Decision date | 2026-10-20 |
| Release decision | RELEASE |
| Release status | RELEASED |
| Amends | `SW-ADR-156` (the landing page's composition and atmosphere) · `SW-ADR-158` (the sun is removed) |
| Sources | owner instructions 2026-10-20 · `SW-ADR-016` · `SW-ADR-117` |

## Context

The owner rejected the bright poster atmosphere ("that fog and the sun") and asked for:
- a gloomy scene;
- mist that lurks on the ground and moves across the whole landing page, over the words too;
- the tree at the centre, with very little text either side;
- a glassy flat floor for proper grounding, seen from a raised camera. The owner's measure was a
  10cm tree shot from about 8cm up, "an elevation type", not straight down;
- generic details that appear as the page is scrolled.

## Decision

1. **Scene.**
   - The landing is an overcast dusk, the same in both themes, like the brand inks. It uses new
     constant tokens `--sw-dusk-*`.
   - The edges fall into a vignette. *(A pale fog glow behind the canopy was removed later on
     2026-10-20: the owner rejected it as a white halo around the tree.)*
   - Type is the dimmed ivory `--sw-dusk-ink`, well past 7:1 on the dark edges. The quiet line,
     `--sw-dusk-ink-quiet`, measures about 5.8:1 on `--sw-dusk-mid`.
2. **Composition.** Three columns: the headline (right-aligned, left of the tree), the tree, then
   one line and the action. On a phone they stack in one column.
3. **Floor.**
   - A frosted glass ellipse whose top edge is where the trunk enters it, so the roots are seen
     blurred through the glass.
   - It has a lit rim, a front lip for thickness, and the trunk mirrored faintly in it.
   - `--floor-ratio` sets the camera height. The owner compared samples at 4cm, 8cm and 14cm up on
     a 10cm tree and chose **14cm** (0.37: the floor dips about 22 degrees below the eye).
   - The tree picture itself stays side-on. Only the floor, reflection and shadow carry the camera
     height.
4. **Mist.**
   - `Fog.jsx` is a canvas of soft banks drawn at half resolution.
   - About 70% of the fog lies on the floor and the rest is thin wisps higher up. It drifts across
     the whole first screen, the words included.
   - One still frame under reduced motion. It pauses off screen.
   - **Revised by the owner later on 2026-10-20**, from two reference pictures: the fog is
     *billowed*, clumps heaped like rolling smoke, lit along their tops and dark underneath. It
     lies only around the trunk and the lowest branches, while the crown and the sky above stay
     clear. There are two layers. One sits behind the tree, so mist shows between the trunk and the
     branches. The other sits in front and thins over the trunk, leaving a clearer path down the
     middle. The high wisps are gone. This replaces the 70/30 split above.
   - **Revised again the same evening.** The owner found the painted clumps fake and asked for
     "simulation clouds which can react to the mouse". `Smoke.jsx` is now a real-time fluid
     simulation (stable fluids with vorticity confinement) in WebGL2. It uses no library, because
     three.js would add about 150 KB and give nothing the browser's own WebGL lacks
     (`SW-ADR-016`). Sources along the floor keep pouring smoke in. The smoke is wiped out above the
     lowest branches and below the floor's near edge, and a moving pointer stirs it. The painted
     `Fog.jsx` remains as the fallback for reduced motion and for browsers without WebGL2 float
     targets. Measured at 60 frames a second on a desktop GPU.
   - The tree's own mist, sun, orbits and spark stars are off here. Its motes are faint ivory dust.
5. **Below the fold.**
   - Four plain statements about what the product does, plus a closing call to action.
   - Each blurs in as it scrolls into view (the `SW-ADR-158` entrance) and is visible at once under
     reduced motion.
   - No testimonial, figure or claim that is not true of the product.

## Tests

The landing's existing browser tests (the front door, the 375px fit) are unchanged and apply to the
new page.
