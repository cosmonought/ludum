# DeparturesBoard

Ludum's games as a station board: number, game, family and status, on the black frame. It sits beside the homepage statement so the games are the first thing a visitor can reach.

**Markup.** `<section class="ld-board" data-theme="press">` → `.ld-board__head` (h2 "Departures", clock line), `.ld-board__cols`, `ol.ld-board__rows` of `li.ld-board__row` (`.ld-board__no`, `a.ld-board__title` + `.ld-board__kind`, `.ld-board__status`), `.ld-board__foot` ("Platform: play.netadao.org" + All projects).

- Statuses are mono caps in `yellow` with a square (PLAYABLE switches to the light red `#FF6B5E`, which holds 7:1 on `frame`).
- Hover drops a `yellow` flap over the row and turns its text `on-yellow`; the first row here shows it. The whole row is the link.
- Rows are the projects in catalogue order; nothing else goes on the board.
- Phone: the column heads go; status moves under the title.
