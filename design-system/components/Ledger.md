# Ledger

Tables as a railway would keep them: an Anton caption, a black head row, mono cells, hairlines between the rows. No rule closes the table: it ends with its last row.

**Markup.** `<figure class="ld-ledger [ld-ledger--stack]">` → `figcaption.ld-ledger__cap` (`.ld-ledger__title` + a label), `.ld-ledger__scroll > table` (`th scope`, `.is-num` right-aligned, `.is-key` for the row's name), optional `p.ld-ledger__note`.

- Numbers are tabular and right-aligned. Rows highlight in `paper-2` on hover.
- In the Project 18XX field the head row is `p18-gold` with dark text; in the 20 Cosmos field the head row inverts to cream on night. On stock it is the black head.
- **Phone:** with `--stack`, each row becomes a block — the key in Anton, then label/value lines read from each cell's `data-label`.
- Say where figures come from; mark illustrative tables as such in the caption or note.
