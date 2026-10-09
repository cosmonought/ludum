# ImageTreatments

How pictures sit on Ludum's paper. Wrap the `<img>` in `.ld-treat` with one treatment:

| Class | What it does | Use |
|---|---|---|
| `ld-treat--print` | multiply, full colour | board photography, pieces, collages already in colour |
| `ld-treat--ink` | greyscale, contrast up, multiply | engravings and black-and-white photographs on stock |
| `ld-treat--night` | greyscale, screen | engravings on the 20 Cosmos night or the frame |
| `ld-treat--duo` (`-yellow`, `-blue`) | greyscale picture multiplied into one pigment | section openers, one per page |
| `ld-treat--screen` | adds a halftone over any of the above | a picture that needs to recede |

- **In Press** (and inside any `data-theme="press"` field) `--print` stops multiplying and `--ink` inverts and screens, so an engraving prints as cream lines on black. The behaviour follows the nearest `[data-theme]`.
- Imagery comes from `assets/Imagery/` (crops of the supplied sheets, standing in until final photography): railway engraving, the 18xx board, pieces and certificates for 1830; the viaduct and route linework for 20 Cosmos.
- No space imagery for 20 Cosmos (the reference sheet's planets and starfields are out of brief). No stock photos of screens, coins or "blockchain" graphics, anywhere.
- Crop hard. A picture bleeds off an edge or sits square on the grid; it is never rounded, shadowed or floated in a card.
