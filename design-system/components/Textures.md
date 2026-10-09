# Textures

The surface of printed matter, drawn in CSS so it costs nothing to load: grain, halftone, hatch, torn edges.

- `ld-grain` lays a fractal-noise grain over a field: dark specks multiplied on stock, light specks screened in Press — chosen by the nearest `[data-theme]`; `ld-grain--light` forces light specks. Use it on project fields, mastheads and features — never on notes or anything with running text.
- `ld-halftone` is a 6px dot screen; `ld-treat--screen` lays a finer one over a picture.
- `ld-hatch` (and `--soft`) is the diagonal fill for water on maps and for unavailable states.
- `ld-torn` is a torn-paper edge (`<span class="ld-torn">` with an SVG polygon in `currentColor`); flip it with `ld-torn--up`. One per page, between two fields.
- The paper textures in the reference sheets are mood, not assets: don't tile photographs of paper under the page.
