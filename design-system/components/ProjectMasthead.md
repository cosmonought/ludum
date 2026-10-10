# ProjectMasthead

The poster at the top of a project page, in that project's own identity: its title, its picture, its verbs, its facts and its PLAY. This card shows Project 18XX; **ProjectMasthead20** shows 20 Cosmos.

**Markup.** `<section class="ld-mast ld-mast--p18 ld-pj ld-pj--p18 ld-grain" data-theme="press">` (20 Cosmos: `ld-mast ld-mast--cosmos ld-pj ld-pj--cosmos ld-grain`, also `press`) → `.ld-mast__edge`, `.ld-wrap.ld-mast__grid` → `.ld-mast__kicker`, `.ld-mast__status` (stamp), `h1.ld-mast__title` (Project 18XX: `.ld-mast__name` PROJECT over `.ld-mast__num.ld-gilt` 18XX; 20 Cosmos: `.ld-mast__num`, `.ld-mast__word`, `.ld-mast__name`), `figure.ld-mast__art` (Project 18XX: `.ld-lineart`), `p.ld-mast__dek`, `.ld-mast__verbs` (a MechanicsStack, `ld-mech--row ld-mech--six`), `.ld-mast__foot` (MetadataStrip + `.ld-mast__play`).

- **The field pins its theme.** Project 18XX is always the gilded boardroom (`p18-ground`, gold, paper text); 20 Cosmos is always the night chart. The page's theme switch never re-tints a project.
- **Project 18XX** — the name set as the feature sets it: PROJECT in Anton at d2, 18XX in gilt (`ld-gilt`) at d0. The picture is the gold line drawing of the locomotive breaking through a share certificate (`assets/Project 18XX/p18-breakthrough.webp`), set to the right of the title, and `ld-lineart` fades its edges into `p18-ground` so no rectangle shows. (The board meeting, the more inviting of the two, opens the game on the homepage.) The verbs BUY · SELL · OPERATE · WITHHOLD · RUST · BANKRUPT in `p18-gold` are the rules the game plays; don't add mechanics it doesn't have.
- **20 Cosmos** — see **ProjectMasthead20**: `p20c-night`, "20" in `p20c-yellow`, the network chart (RouteMap) in place of a picture, themes not mechanics.
- **Phone, recomposed:** a 10px gilt-ruled stripe crosses the top; the title; the stamp; the drawing bleeds edge to edge as a 4:3 band, cropped to the figures; the dek; the verbs as a 2 × 3 board; facts in two columns; PLAY full width.
- Grain sits on the field (`ld-grain`); the picture prints in once (`data-ld-reveal`).
