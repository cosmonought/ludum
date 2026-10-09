# Grid

A 12-column frame on every width from tablet up, 4 columns on phones; margins `margin-desktop` 48 · `margin-laptop` 32 · `margin-tablet` 24 · `margin-phone` 16; gutters 24 (16 from tablet down); the frame stops at `frame-max` 1600px.

| Breakpoint | Width | Columns | Margin | Gutter |
|---|---|---|---|---|
| desktop | ≥ 1280 | 12 | 48 | 24 |
| laptop | 1024–1279 | 12 | 32 | 24 |
| tablet | 600–1023 | 12 | 24 | 16 |
| phone | < 600 | 4 | 16 | 16 |

- `.ld-wrap` gives the frame and margins; `.ld-grid` the columns. Components lay out on the same 12 tracks with explicit lines.
- Spacing steps: `space-1` 4 … `space-10` 128. Modules sit `space-8` (64) apart; sections `space-9` (96; 64 on tablet, 48 on phones).
- Pictures, fields and the frame bleed to the window edge; text never leaves its columns.
