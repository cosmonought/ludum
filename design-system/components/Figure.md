# Figure

A picture with its number and caption: the plate, then a hairline, then `Fig. 02` and one or two sentences in mono.

**Markup.** `<figure class="ld-figure">` → `.ld-figure__plate.ld-treat.ld-treat--<treatment>` holding the `<img>`, then `<figcaption>` with `.ld-figure__no` and the caption.

- Treatments are in **ImageTreatments**: print (colour on stock), ink (engraving), night (on dark fields), duo (one pigment).
- Number figures through a page. Captions say what the picture is *for*, not only what it shows.
- Alt text describes the picture plainly; the caption is not a substitute.
- No rounded corners, no shadows, no borders unless the plate sits on a picture of the same tone (`ld-treat--framed`).
