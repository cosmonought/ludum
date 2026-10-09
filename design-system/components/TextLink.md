# TextLink

A lighter action: mono caps over a 2px underline, with an arrow. Use it beside section heads ("All projects"), in footers and in rows.

**Markup.** `<a class="ld-link" href>All projects<svg class="ld-icon">arrow-right</svg></a>`; add `ld-link--out` and the `arrow-out` icon for anything that leaves Ludum (play.netadao.org, netadao.org, the Academy).

- Hover: `red-ink` and the arrow steps (out-links step up-right). Focus: the 3px ring.
- In running text use `.ld-inline` (or any `<a>` inside `.ld-prose`): the words themselves, a 2px `red` underline, `red-ink` on hover.
- An out-link always names where it goes: "play.netadao.org", not "Play here".
