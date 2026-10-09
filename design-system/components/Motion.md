# Motion

Few movements, hard and purposeful, like a press or a signal box: wipes, prints and draws. Rest is still; hover is where things happen.

| Token | Value | Movement |
|---|---|---|
| `dur-wipe` | 240ms | a fill wiping across a button, row, tab or board flap |
| `dur-print` | 560ms | a masthead, picture or menu printing in once (`clip-path`) |
| `dur-draw` | 1200ms | a route drawing itself once (`stroke-dashoffset`), staggered 70ms |
| `ease-press` | cubic-bezier(.7,0,.2,1) | wipes, prints, draws: fast through the middle, a hard stop |
| `ease-out` | cubic-bezier(.2,.8,.2,1) | small shifts on hover: arrows stepping, titles moving |

- Mark things with `data-ld-reveal` (`="up"` to print from below) and `data-ld-draw`; `Ludum.enhance()` runs them as they enter the view.
- `Ludum.enhance()` sets `.ld-js` on `<html>`, and `.ld-motion` only when motion is allowed. Without either, everything is simply there.
- **prefers-reduced-motion:** no reveals, no draws, every transition instant. Hover states still change, without travel.
- Nothing loops. No parallax, no scroll-jacking, no autoplaying video, no counters.
