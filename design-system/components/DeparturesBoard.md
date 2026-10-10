# DeparturesBoard

Ludum's games as a station board: number, game, family and status, on the black frame. It sits beside the homepage statement so the games are the first thing a visitor can reach.

**Markup.** `<section class="ld-board" data-theme="press">` → `.ld-board__head` (h2 "Departures", clock line), `.ld-board__cols`, `ol.ld-board__rows` of `li.ld-board__row` (`.ld-board__no`, `a.ld-board__title` + `.ld-board__kind`, `.ld-board__status`), `.ld-board__foot` ("Platform: play.netadao.org" + All projects).

- **Each game's row is in its own colour** (`ld-board__row--p18`, `--cosmos`): Project 18XX in `p18-gold`, 20 Cosmos in its channel blue `p20c-line`. The colour carries the number, the statuses (mono caps with a square) and the hover flap; both hold 6.5:1 or better on `frame`. A row without a game colour falls back to `yellow`; PLAYABLE switches to the light red `#FF6B5E`.
- Hover drops the row's flap and turns its text `frame` black; the first row here shows it. The whole row is the link.
- Rows are the projects in catalogue order; nothing else goes on the board.
- Phone: the column heads go; status moves under the title.
