# PlayAction

PLAY is Ludum's signature action and its only way out: it leaves for play.netadao.org, where the games run. It wears Neta DAO's cyan, because Play is Neta DAO's — the same cyan netadao.org uses to open it.

Ludum is the publisher's house. Projects, notes and research live here; the games live on play.netadao.org. Every PLAY says where it goes, and nobody is ever made to come through Ludum to reach a game.

**Markup.**
- Global: `<a class="ld-play" href="https://play.netadao.org" aria-label="Play, on play.netadao.org"><span class="ld-play__word">Play</span><svg class="ld-icon">arrow-out</svg></a>`.
- A game: add `<span class="ld-play__what">Project 18XX</span>` and point `href` at that game's address on play.netadao.org (`ld-play--l` in mastheads).
- **Not yet playable:** `<p class="ld-play ld-play--soon">` with the word struck through and the game's status, "… · not yet on play.netadao.org" (`play_soon(size, words)`). It is a plate, not a control: no link, no hover, no focus.

Colours: `neta-cyan` with `on-neta` text and a 2px `frame` edge (cyan alone reads 1.7:1 on stock), the same in every theme and every project field. States: hover fills from below with `neta-pink` and the arrow leaves up-right; active presses 2px; focus is the 3px ring (`frame`, set inside, in the nav).

**Today.** Project 18XX is Experimental, a playable prototype, so its feature and masthead carry a linked PLAY to play.netadao.org. 20 Cosmos is Research and shows `ld-play--soon` ("Research · not yet on play.netadao.org"). The nav still carries the global PLAY. Switch a game to the linked form the day it runs there, and change its stamp with it.

Don't: label PLAY with anything but "Play"; use it for a page on Ludum; show a linked PLAY for a game that isn't running.
