# Wordmark

Ludum's name, set live in Anton on the black frame block, with "Games by Neta DAO" spaced out in Plex Mono beneath it.

There is no drawn Ludum logo: the wordmark *is* type. Never outline it, redraw it as an image, stretch it, or set it in another face.

**Markup.** `<a class="ld-wordmark" href="/">` holding `.ld-wordmark__name` (Ludum) and `.ld-wordmark__by` (Games by Neta DAO).

| Variant | Use |
|---|---|
| default (block, 72px) | Covers, the About page, social cards |
| `ld-wordmark--m` (48px) | Inside modules, the footer of a printed sheet |
| `ld-wordmark--xl` (160px) | A poster or a cover only |
| `ld-wordmark--bare` | Ink on `paper` (or cream on Press) when a black block would double a black field |

- The block is `frame` with `on-frame` text in both themes. In the nav bar the name is set bare (`.ld-nav__name`).
- The byline is always "Games by Neta DAO", uppercase, tracked out to the width of the name.
- Hover on a linked wordmark turns only the byline `yellow`.
