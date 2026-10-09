# Prose

Running text in a note: Plex Sans at 18/30 on a 680px measure, with Anton heads, a drop numeral, mono list numbers and margin notes.

**Markup.** `<div class="ld-prose">` around plain HTML: `p`, `h2`, `h3`, `ol`, `ul`, `blockquote`, `code`, `sup > a`, and Ludum blocks (`.ld-figure`, `.ld-ledger`, `.ld-quote`). Margin notes are `<aside class="ld-sidenote"><b>Note 1</b>…</aside>` placed before the paragraph they annotate.

- `h2` is d4 over a 2px rule; `h3` is d5. Never skip from `h2` to body without a sentence.
- `ld-prose--initial` sets the first letter as a `red` Anton initial: notes and essays only, one per page, and never when the text opens with a number.
- Lists: `ol` numbers in mono `red-ink`; `ul` bullets are small `ink` bars.
- Links: the words, underlined 2px in `red`.
- Sidenotes hang in the right margin when the column has room for them (the note's body is a size container: about 940px or more), and otherwise fall into the text under a 2px rule.
- Texture never goes under prose. Keep notes on `paper`.
