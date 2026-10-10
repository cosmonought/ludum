# Epigraph

A reader on play, quoted: the line in Plex Sans italic, the reader and the work under it. Four are set on Ludum, each once.

**Markup.** `<figure class="ld-epigraph [ld-epigraph--panel]"><blockquote><p>“…”</p></blockquote><figcaption><span class="ld-epigraph__who">Name</span><span class="ld-epigraph__work"><cite>Work</cite> (year)</span></figcaption></figure>`.

- **Panel** (`ld-epigraph--panel`): how a page closes. Centred on stock, alone, with no rule above it. The line at 44px (34px on tablets, 26px on phones) in `ink`, running nearly the panel's width (balanced when it takes two lines); under it, 28px down, the reader's name in mono capitals and the work and year in Plex Sans, both centred. One per page, the last thing before the footer, in a `ld-section--close`: 48px above and below (32px on phones), and the section before it ends 48px short too, so the line fills the panel rather than the space around it.
- **Side** (the default): beside prose in a side column, at 16px in `ink-2`, the source under it in one mono line.

| Reader | Line | Where |
|---|---|---|
| Friedrich Schiller, *On the Aesthetic Education of Man* (1795, Letter XV) | "… he is only wholly Man when he is playing." | **Home**, the closing panel |
| Walter Benjamin, *Toys and Play* (1928) | "For play and nothing else is the mother of every habit." | **About**, the closing panel |
| Sigmund Freud, *Creative Writers and Day-Dreaming* (1908) | "The opposite of play is not what is serious but what is real." | **About**, beside "What Ludum is" |
| Alain Badiou, *The Concept of Model* (1969) | "the model is that which allows us to think through participation" | **About**, beside the statement "Games are models you can enter." (22px, on the frame) |

- Never a pull quote, never in the footer. A pull quote is Ludum's own words; an epigraph is someone else's.
- Quote exactly and cite the work and year.
