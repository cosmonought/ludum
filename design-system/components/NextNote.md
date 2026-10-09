# NextNote

The band at the foot of a note that hands the reader on: an 8px rule, "Next note", the next title at d3 and a big arrow.

**Markup.** `<nav class="ld-next" aria-label="Next note">` → `.ld-next__label`, `p.ld-next__title > a`, the `arrow-right` icon at 48px.

- Hover floods the band `yellow` from below; the arrow steps 8px. The whole band is the link.
- The next note is the next one in the same project, else the next newest.
