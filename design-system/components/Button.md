# Button

Mono, uppercase, square, with an arrow: Ludum's actions inside the site. (Leaving for a game is PLAY, not a button.)

**Markup.** `<a class="ld-btn [ld-btn--secondary|--ink|--yellow] [ld-btn--l|--block]" href>Label<svg class="ld-icon">arrow-right</svg></a>`; a `<button>` takes the same classes.

| Kind | Rest | Hover wipe | Use |
|---|---|---|---|
| primary | `red` / `on-red` | `ink` / `paper` | the one action a section exists for |
| `--secondary` | outline `rule-strong` / `ink` | `ink` / `paper` | View project, the usual action |
| `--ink` | `ink` / `paper` | `red` / `on-red` | Read more, on stock bands |
| `--yellow` | `yellow` / `on-yellow` | `ink` / `paper` | Follow development, on dark fields |

- **States.** Hover: the second colour slides in from the left in `dur-wipe` (240ms, `ease-press`) and the arrow steps 4px. Active: pressed 2px down, wipe held. Focus: 3px `focus` ring, offset 3px. Disabled: `aria-disabled="true"`, hatched, `ink-3`, no wipe.
- Labels are verbs, two or three words: View project · Read the note · Follow development. No "Click here", no "Learn more".
- One primary per view. Inside a project field the secondary takes the field's ink (`--pj-ink`).
- Min height 48px (64px for `--l`). On phones, actions in a stack go full width (`ld-btn--block`).
