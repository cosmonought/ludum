# Responsive

Four breakpoints, and a rule: on smaller screens compositions are **recomposed**, not stacked. The order and emphasis change so the poster still reads as a poster at 390px.

| Name | Width | Margin | What happens |
|---|---|---|---|
| desktop | ≥ 1280 | 48 | full compositions; display at full size |
| laptop | 1024–1279 | 32 | display one step down; the year leaves catalogue rows |
| tablet | 600–1023 | 24 | pictures move beside or under titles; verbs become boards; sidenotes fall into the text |
| phone | < 600 | 16 | four columns; stripes cross the top; pictures bleed edge to edge; boards go 2 × 3; actions span the width; the nav becomes a sheet |

- Display sizes step through `--ld-d0` … `--ld-d5` (set in bundle.css per breakpoint).
- Touch targets are at least 48px on every width; PLAY at least 56px.
- Phone cards for the Home, project and note templates are in **Pages · phone**.
