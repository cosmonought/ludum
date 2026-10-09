# Collage

Ludum's layered plate: a pigment circle, an engraved picture laid over it in multiply, a photographed fragment pinned on top, a stripe and a strip of tape.

**Markup.** `<div class="ld-collage" role="img" aria-label="…">` → `.ld-collage__sun.ld-sun`, `figure.ld-collage__plate` (ink treatment), `figure.ld-collage__chip` (print treatment), `.ld-collage__strip`, `.ld-collage__tape.ld-tape`. Each layer is positioned; override the positions per composition.

- One collage per view. It is decoration with a label, so the whole is one `role="img"` and its parts have empty alt.
- Hover lifts the pinned chip a few pixels: the only movement a collage makes.
- Build collages from Ludum's own imagery (`assets/Imagery/`); 18xx railway for the house, infrastructure (viaducts, routes) for 20 Cosmos — not outer space. Project 18XX brings its own pictures (its title art and boardroom paintings, `assets/Project 18XX/`) and frames them in gilt rather than collaging them.
