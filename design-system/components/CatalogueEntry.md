# CatalogueEntry

A row of the projects index: catalogue number, title at d3 with one sentence, family, status, year and an arrow. The first row here shows hover.

**Markup.** `<ol class="ld-catalogue">` of `li.ld-entry[data-ld-status]` → `.ld-entry__no`, `.ld-entry__main` (`h3.ld-entry__title > a`, `p.ld-entry__dek`), `.ld-entry__kind`, `.ld-entry__status` (small stamp), `.ld-entry__year`, `.ld-entry__go`, `.ld-entry__thumb > img`.

- Catalogue numbers are permanent: LUD—01 is Project 18XX, LUD—02 is 20 Cosmos. A retired project keeps its number.
- **Hover:** `paper-2` wipes across the row, the title steps 12px, and the project's picture prints in over the row's right end, tilted, like a card slipped into a ledger. **Focus** rings the row. The whole row is the link.
- Archive rows set their title in `ink-3`.
- Laptop drops the year; tablet drops family and the picture; **phone recomposes** into number + stamp, title + sentence, family + year.
