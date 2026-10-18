# ProjectPalettes

How colour is shared out: one house palette, and a field of its own for each game.

**The house.** `paper` (cream stock) and `ink`, framed by `frame` black; four pigments — `red`, `yellow`, `blue`, `green` — and `grey` for the archive. Pigments are fills, marks and large type; small coloured text uses `red-ink` / `blue-ink`.

**The family line.** Neta DAO's own colours — `neta-pink` → `neta-cyan`, the bar of its mark — appear only where Ludum meets its parent: the 4px rule under the nav, the bar between the wordmark and "Games by Neta DAO", the footer's band, and PLAY (`neta-cyan`, hover `neta-pink`), because play.netadao.org is Neta DAO's. They never colour a game, a stamp or a headline.

**A project field** sets five roles with one class:

| Role | Project 18XX (`ld-pj--p18`) | Steel Meridian (`ld-pj--meridian`) | 20 Cosmos (`ld-pj--cosmos`) |
|---|---|---|---|
| `--pj-ground` | `p18-ground` | `sm-steel` | `p20c-night` |
| `--pj-ink` | `p18-paper` | `sm-plat` | `p20c-cream` |
| `--pj-accent` (numerals, the sun) | `p18-gold` | `sm-red` (house `red`) | `p20c-yellow` |
| `--pj-accent-2` (highlighter, second pigment) | `p18-gilt` | `sm-blue` | `p20c-blue` |
| `--pj-signal` (small marks, routes) | `p18-gold` | `sm-vermilion` | `p20c-line` |

- The field carries its theme: every game pins `data-theme="press"`. A project never re-tints with the site's theme.
- **Project 18XX** is the gilded boardroom of its own title art and paintings: near-black and walnut, gold leaf, paper-white text (`p18-text-dim` and `p18-text-muted` for second and third ink). The colours are the game's own, taken from its repository (its palette, board data and art); its gold is not the house `yellow`, and its gilt gradient (`ld-gilt`) is its alone. The board's colours — dark-green land, the tile tiers yellow → green → brown → grey, off-board red, coal — appear only on the board and in charts.
- Steel Meridian is railways, rivers and industry across the American interior: blued steel, plat white, and one colour, the house `red`, for the glow in its pictures, the red I of MERIDIAN, the range-pole edge, seals and off-boards. Small red marks use `sm-vermilion`. Rivers and water on its board are blue.
- 20 Cosmos is robber barons in the internet age, not outer space: night navy, cream linework, a yellow signal, zone blue, a light channel blue.
- A new project chooses its accent from the house pigments first. Two projects never share both ground and accent.
