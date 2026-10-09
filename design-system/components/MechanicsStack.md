# MechanicsStack

A project's verbs, in Anton, each with one line of what it means: the game explained by what players do.

**Markup.** `<ol class="ld-mech [ld-mech--words|--row]">` of `<li><span class="ld-mech__no">01</span><span class="ld-mech__verb">Buy</span><p class="ld-mech__gloss">…</p></li>`.

- Full stack: number, verb at d3, gloss in `body-s`. `--words`: a tight column of verbs only. `--row`: three across with numbers (20 Cosmos's masthead); `--row --six`: six across (Project 18XX's masthead).
- Hover wipes a highlighter bar (`--pj-accent-2`: `yellow` in the house, `p18-gilt` in Project 18XX) behind the verb; the verb turns `on-yellow`.
- Verbs are real. For Project 18XX they are the game's own actions. Where a game's rules aren't published (20 Cosmos) use themes and say so in the section head.
- Phone: the gloss drops under the verb; `--words` becomes a 2 × 3 board.
