# CatalogueEntry

A row of the projects index: catalogue number, title at d3 with one sentence, family, status, year and an arrow. The first row here shows hover.

**Markup.** `<ol class="ld-catalogue">` of `li.ld-entry[data-ld-status]` → `.ld-entry__no`, `.ld-entry__main` (`h3.ld-entry__title > a`, `p.ld-entry__dek`), `.ld-entry__kind`, `.ld-entry__status` (small stamp), `.ld-entry__year`, `.ld-entry__go`, `.ld-entry__thumb > img`.

- Catalogue numbers are permanent: LUD—01 is Project 18XX, LUD—02 is 20 Cosmos. A retired project keeps its number.
- **Hover:** `paper-2` wipes across the row, the title steps 12px, and the project's picture prints in over the row's right end, tilted, like a card slipped into a ledger. The picture is the one the homepage gives the game: the boardroom for Project 18XX (kept on the man standing at the head of the table, `ld-focal`), the server farm for 20 Cosmos. **Focus** rings the row. The whole row is the link.
- Archive rows set their title in `ink-3`.
- Rows are divided by 2px rules; none under the last.
- Laptop drops the year; tablet drops family and the picture; **phone recomposes** into number + stamp, title + sentence, family + year.
