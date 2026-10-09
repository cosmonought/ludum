# ImageTreatments

How pictures sit on Ludum's paper. Wrap the `<img>` in `.ld-treat` with one treatment:

| Class | What it does | Use |
|---|---|---|
| `ld-treat--print` | multiply, full colour | board photography, pieces, collages already in colour |
| `ld-treat--ink` | greyscale, contrast up, multiply | engravings and black-and-white photographs on stock |
| `ld-treat--night` | greyscale, screen | engravings on the 20 Cosmos night or the frame |
| `ld-treat--duo` (`-yellow`, `-blue`) | greyscale picture multiplied into one pigment | section openers, one per page |
| `ld-treat--screen` | adds a halftone over any of the above | a picture that needs to recede |
| `ld-lineart` (not a treatment) | the picture untouched, its edges faded into the field with a mask | Project 18XX's gold line drawings on black |
| `ld-giltframe` (not a treatment) | a gold double rule on `p18-panel`; the picture untouched | Project 18XX's title cards, and nothing else |

- **In Press** (and inside any `data-theme="press"` field) `--print` stops multiplying and `--ink` inverts and screens, so an engraving prints as cream lines on black. The behaviour follows the nearest `[data-theme]`.
- House imagery comes from `assets/Imagery/` (crops of the supplied sheets, standing in until final photography): railway engraving, the 18xx board, pieces and certificates. 20 Cosmos's engravings live in `assets/20 Cosmos/`.
- Project 18XX's pictures live in `assets/Project 18XX/`: two gold line drawings (feature and masthead) and the three title cards from its repository. Show them as made — never print-treated, duotoned, screened or collaged.
- No space imagery for 20 Cosmos (the reference sheet's planets and starfields are out of brief). No stock photos of screens, coins or "blockchain" graphics, anywhere.
- Crop hard. A picture bleeds off an edge or sits square on the grid; it is never rounded, shadowed or floated in a card.
