# PlayBand

The homepage's second section: what can be played, and where. It names play.netadao.org and lists each game's state honestly.

**Markup.** `<section class="ld-playband" data-theme="press">` → `.ld-playband__inner` → the word (`.ld-playband__word`, `neta-cyan`, d0) with its host line, and `.ld-playband__body`: a sentence, `.ld-playband__list` (one `<li>` per game: name + small stamp), and the global PLAY.

- The sentence says the truth of the day. Today: nothing is playable; both games are in development and open on play.netadao.org first.
- When a game opens, its row's stamp becomes PLAYABLE and the row gains its own PLAY; the band moves above the games on the homepage only if most games are playable.
- Tablet and phone: the word sits above the body.
