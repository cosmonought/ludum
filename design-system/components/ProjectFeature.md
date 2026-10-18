# ProjectFeature

A game on the homepage, at full width and in its own identity: kicker and stamp, the name at d0, one sentence, facts, View project, and the PLAY state.

**Markup.** `<article class="ld-feature ld-feature--p18 ld-pj ld-pj--p18 ld-grain" data-theme="press">` (or `ld-feature--cosmos ld-pj--cosmos`) → `.ld-wrap.ld-feature__grid` → `.ld-feature__head`, `h3.ld-feature__title > a`, `p.ld-feature__dek`, `.ld-feature__meta`, `.ld-feature__actions`, `figure.ld-feature__art`.

- One feature per game, stacked: this is a publisher's list, not a store grid. Never tile games as small cards.
- The whole block is the link to the project page (the title's link is stretched); PLAY sits above it and goes to play.netadao.org — or, as today, shows the in-development plate.
- **Hover** is more active than rest: the picture leans in (scale 1.04; Project 18XX's gold line drawing brightens instead, so its glow comes up), the name steps right and View project wipes. Focus rings the whole block.
- Art: Project 18XX shows a gold line drawing on black (the board meeting: financiers around the glowing map, the most inviting first sight of the game); 20 Cosmos shows a steel-blue engraving of the internet age (a robber baron in a server farm), never space. Both fade their edges into the field with `ld-lineart`. Steel Meridian shows a tonal steel engraving of the work on the Mississippi bridge (The crossing), a red forge and a red-hot rivet its only colour. A strip of tape names a place in the game (The boardroom, The crossing, The server farm) in the game's own colour: `p18-gold` for Project 18XX, `sm-vermilion` for Steel Meridian, the channel blue `p20c-line` for 20 Cosmos, never a status colour.
- Project 18XX sets PROJECT in Anton at d3 and 18XX in gilt (`ld-gilt`, a gold-leaf gradient clipped to the type) at d0. That gilt is Project 18XX's alone; the house never borrows it.
- Steel Meridian sets STEEL at d2 over MERIDIAN at d1, its first I in red (`ld-redi`); MERIDIAN steps right on hover.
- 20 Cosmos sets "20" at d0 and COSMOS at d1 beneath it, so the lockup fits six columns.
- Tablet: the picture goes under the title at 16:9. Phone: numerals stack, the picture bleeds square, actions go full width.
