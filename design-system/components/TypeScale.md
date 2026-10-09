# TypeScale

Two voices: Anton shouts, IBM Plex speaks. Anton is the heavy compressed gothic of posters and railway bills; Plex Sans carries reading and Plex Mono the apparatus — labels, data, actions.

**Display (Anton, always uppercase).** `d0` 232 · `d1` 144 · `d2` 88 · `d3` 56 · `d4` 36 · `d5` 24 at desktop, stepping down per breakpoint (the card shows all four). In CSS use the classes `.ld-d0`–`.ld-d5` or `var(--ld-d0)`–`var(--ld-d5)`: they resize themselves at 1279, 1023 and 599px.

- d0: a project's numerals, the footer name. d1: page titles, the statement. d2: section heads, a note's title on phones. d3: catalogue titles, verbs, pull quotes. d4: note titles, module heads. d5: the nav, stamps, small heads.
- Line height under 1 (0.82–0.94): display lines touch. Never letterspace Anton wide; never set it in lowercase or italic; never fake bold.

**Text (Plex Sans).** `lede` 22/32 (19/28 on phones), `body` 18/30 (17/28), `body-s` 15/24, `strong` 600. Measure 680px.

**Apparatus (Plex Mono, uppercase where tracked).** `nav-m` 14, `label` 12 at 0.1em, `label-s` 11 at 0.12em, `data` 14/22 sentence case, `button` 14 at 600.

- One picked-out word per heading, in `red` (`.ld-pick`); never two.
- Text is always live type, never set into images.
