# ImageTreatments

How pictures sit on Ludum's paper. Wrap the `<img>` in `.ld-treat` with one treatment:

| Class | What it does | Use |
|---|---|---|
| `ld-treat--print` | multiply, full colour | board photography, pieces, collages already in colour |
| `ld-treat--ink` | greyscale, contrast up, multiply | engravings and black-and-white photographs on stock |
| `ld-treat--night` | greyscale, screen | engravings on the 20 Cosmos night or the frame |
| `ld-treat--duo` (`-yellow`, `-blue`) | greyscale picture multiplied into one pigment | section openers, one per page |
| `ld-treat--screen` | adds a halftone over any of the above | a picture that needs to recede |
| `ld-giltframe` (not a treatment) | a gold double rule on `p18-panel`; the picture untouched | Project 18XX's own paintings and title cards, and nothing else |

- **In Press** (and inside any `data-theme="press"` field) `--print` stops multiplying and `--ink` inverts and screens, so an engraving prints as cream lines on black. The behaviour follows the nearest `[data-theme]`.
- House imagery comes from `assets/Imagery/` (crops of the supplied sheets, standing in until final photography): railway engraving, the 18xx board and pieces; the viaduct and route linework for 20 Cosmos.
- Project 18XX's pictures come from its own repository (`assets/Project 18XX/`): the title art, three title cards and two boardroom paintings. Show them as made — never print-treated, duotoned, screened or collaged.
- No space imagery for 20 Cosmos (the reference sheet's planets and starfields are out of brief). No stock photos of screens, coins or "blockchain" graphics, anywhere.
- Crop hard. A picture bleeds off an edge or sits square on the grid; it is never rounded, shadowed or floated in a card.
