# TitleCards

Project 18XX's three tables, each by its own title card: the game's gilded art in a gilt frame, the table's number, its name and one sentence.

**Markup.** `<ul class="ld-titlecards">` of `li.ld-titlecard` → `figure.ld-giltframe > img.ld-titleart` (alt "Title card: …"), `.ld-label-s` (Table 01…), `h3`, `p`.

- The cards are the game's own art (`assets/Project 18XX/p18-table-*.webp`), shown whole (`object-fit: contain`) on `p18-panel`: never cropped, re-lettered or recoloured. The screen blend drops their black into the frame.
- The three tables, in the game's words: **18XX** — the classic game, the map and tile tray as printed; **18XX+** — a larger map, for higher player counts or less blocking at lower ones; **18XX+: A Level Playing Field** — a rebalanced map with additional tiles, private companies and railroads.
- Names are `p18-gold` Anton at d4; the sentence is `p18-text-dim` (8.9:1 on the ground).
- Three across from laptop up, two on tablet, one on phones. The cards are information, not links, until each table opens on play.netadao.org.
- Project 18XX only. Another game shows its variants with its own art, or as a Ledger.
