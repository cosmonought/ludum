# Rules

Structure is drawn with rules, not boxes or shadows: black lines of fixed weights, square corners everywhere, circles only for pieces.

| Token | Weight | Use |
|---|---|---|
| `rule-hair` | 1px `rule` | between rows of a table, list or ledger |
| `rule-2` | 2px `rule-strong` | module edges, control borders, the rule over a section head |
| `rule-4` | 4px | over a metadata strip, under the nav's current item |
| `rule-bar` | 8px | above the next-note band, the footer's band |
| `rule-band` | 16px | a stripe band on a project field's edge |

One rule per boundary: a rule opens a section or separates two rows. Nothing closes with a rule (a table, list or strip ends with its last row), and nothing set straight under a section head draws a rule of its own.

- `.ld-rule` (`--hair`, `--4`, `--bar`) for a standalone rule; components draw their own.
- Bands: stripes (`ld-band--stripes`) and rungs mark a field's edge; `ld-band--pigment` sets Ludum's four pigments in a row (once per page at most); `ld-band--neta` is the Neta line, used only where Ludum meets Neta DAO (under the nav, the footer, the wordmark's byline).
- **Corners:** `radius-0` for fields, buttons, stamps, images, panels. `radius-token` only for drawn pieces, stations, the hub and the red sun.
- **No shadows.** Sheets are set apart by `rule-strong`, not elevation.
