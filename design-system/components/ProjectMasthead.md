# ProjectMasthead

The poster at the top of a project page, in that project's own identity: its numerals at d0, its picture, its verbs, its facts and its PLAY.

**Markup.** `<section class="ld-mast ld-pj ld-pj--1830 ld-grain" data-theme="stock">` (20 Cosmos: `ld-mast ld-mast--cosmos ld-pj ld-pj--cosmos ld-grain`, `data-theme="press"`) → `.ld-mast__edge`, `.ld-wrap.ld-mast__grid` → `.ld-mast__kicker`, `.ld-mast__status` (stamp), `h1.ld-mast__title` (`.ld-mast__num`, `.ld-mast__name`; 20 Cosmos adds `.ld-mast__word`), `.ld-mast__art`, `.ld-mast__verbs` (a MechanicsStack), `p.ld-mast__dek`, `.ld-mast__foot` (MetadataStrip + `.ld-mast__play`).

- **The field pins its theme.** 1830 is always cream stock with coal ink and `red`; 20 Cosmos is always the night chart. The page's theme switch never re-tints a project.
- **1830: Juno Edition** — `p1830-stock`, numerals in `p1830-red`, the rail collage in print treatment, the verbs BUY · SELL · OPERATE · WITHHOLD · RUST · BANKRUPT. These are the original 1830's real actions; don't add mechanics the Juno Edition hasn't published.
- **20 Cosmos** — see **ProjectMasthead20**: `p20c-night`, "20" in `p20c-yellow`, the network chart (RouteMap) in place of a picture, themes not mechanics.
- **Phone, recomposed:** a 10px stripe crosses the top; numerals, then the name; the stamp; the picture bleeds edge to edge as a 4:3 band; the dek; the verbs as a 2 × 3 board; facts in two columns; PLAY full width.
- Grain sits on the field (`ld-grain`); the picture prints in once (`data-ld-reveal`).
