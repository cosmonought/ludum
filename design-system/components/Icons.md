# Icons

A small drawn set, in the bundle as `Ludum.icon(name, cls)` and `Ludum.icons`: 24px, 2px strokes, square caps, mitred joins, `currentColor`.

| Group | Icons |
|---|---|
| Actions | `arrow-right` (onward), `arrow-out` (leaves Ludum: PLAY, play.netadao.org, netadao.org), `arrow-left`, `arrow-down`, `plus`, `minus`, `close`, `menu` |
| Maps | `hex`, `station`, `hub`, `route`, `network` |
| Objects | `train`, `rust`, `share`, `token`, `epoch`, `govern`, `note` |
| Motifs | `star`, `target` |

- Inline as `<svg class="ld-icon" viewBox="0 0 24 24" aria-hidden="true">…</svg>`; sizes `ld-icon--16/20/32/48`.
- An icon goes with a word. An icon alone must carry `role="img"` and a label (`Ludum.icon(name, cls, label)`).
- `arrow-out` always means "this leaves Ludum".
- No emoji, no brand icons, no chain logos. Anton has no ↗ glyph: arrows are always these SVGs.
