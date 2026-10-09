# NoteEntry

A row of the notes index: date and kind in mono, the title at d4, one sentence, and which project it belongs to.

**Markup.** `<ol class="ld-notes">` of `li.ld-note` → `.ld-note__meta` (`time.ld-note__date`, `.ld-note__kind`), `.ld-note__body` (`h3.ld-note__title > a`, `p.ld-note__dek`), `.ld-note__tags` (one `.ld-tag`). `ld-note--lead` adds `figure.ld-note__art` and sets the title at d2 for the newest note.

- Kinds: Design note · Research · Devlog · Essay. One kind per note.
- Tags name a project (`ld-tag--1830` red square, `ld-tag--cosmos` blue, `ld-tag--ludum` yellow for the house).
- The whole row is the link (the title's link is stretched); hover wipes a 4px `red` underline under the title. Focus rings the row.
- Phone: date and kind share one line above the title; the tag sits under the dek.
- The titles here are sample copy.
