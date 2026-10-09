Ludum is Neta DAO's game publisher, and this is its house style: radical game publishing — cream stock, a black frame, four saturated pigments, heavy compressed capitals, and each game in an identity of its own. It should feel like a printed games catalogue from a small press with opinions, not a store, a museum shop or a crypto launchpad.

## Ludum and Play

- **ludum.netadao.org** is the publisher's house: projects, notes, research, why games.
- **play.netadao.org** is where the games run.
- Every PLAY on Ludum leaves for play.netadao.org and says so. Ludum never stands between a player and a game, and nobody has to come through Ludum to play. PLAY wears Neta DAO's cyan (`neta-cyan`), because Play is Neta DAO's.
- Homepage priority is fixed: **the games first, then what can be played, then the writing.**
- Today both games — **Project 18XX** and **20 Cosmos** — are **In development**. Nothing is playable yet, so every project shows the in-development PLAY plate (`ld-play--soon`) while the nav and footer keep the global PLAY. Switch a game to a linked PLAY and a PLAYABLE stamp in the same change, the day it opens.

## Content fundamentals

- **Voice.** Plain, confident, specific; a publisher talking about its list. Short declarative sentences. Third person for the house ("Ludum publishes…"), never "we're excited to…".
- **Say only what is true and settled.** Project 18XX's facts come from its own repository: its actions (buy, sell, operate, withhold, rust, bankrupt), its three tables, its house rules, its train roster. 20 Cosmos has no published rules: describe its world and themes, never its mechanics. No dates, prices or player counts until they are real. A diagram or table that isn't the game's own says "illustrative".
- **Statuses are promises.** PLAYABLE · IN DEVELOPMENT · EXPERIMENTAL · RESEARCH · ARCHIVE, and nothing else ("Coming soon", "Beta" and "New" don't exist).
- **Casing.** Display type is always uppercase (Anton). Running text is sentence case. Mono labels and actions are uppercase and tracked; mono data is sentence case.
- **Names.** The first game is **Project 18XX**; its tables are 18XX, 18XX+ and 18XX+: A Level Playing Field.
- **Never.** Hype words ("revolutionary", "next-gen", "the future of"), "Web3", rocket-and-moon talk, emoji, exclamation marks, real chain names or logos on 20 Cosmos material.
- **Real lines to reuse.** "Serious games for a more interesting world." · "Games are models you can enter." · "Railways for a multichain world." · "Railways built empires. Blockchains connect them." · "Nothing is playable yet."
- Sample copy in the templates (note titles, dates, bylines) is illustrative and marked so in each card.

## Visual foundations

**Colour.** Ground is `paper` (cream stock); `ink` for type and rules; `frame` black for the nav, footer, the departures board and table heads. Four pigments at full strength — `red`, `yellow`, `blue`, `green` — plus `grey` for the archive. Pigments are fills, marks and large type; small coloured text uses `red-ink` or `blue-ink`; text on a fill uses its `on-…` token. Two themes: **Stock** (cream, the default) and **Press** (black). See **ProjectPalettes**.

**The family line.** Neta DAO's colours — `neta-pink` → `neta-cyan`, the bar of its mark (`on-neta` text on either) — appear only where Ludum meets its parent: the 4px rule under the nav, the bar between the wordmark and "Games by Neta DAO", the footer's 8px band, and PLAY (cyan, pink on hover), since play.netadao.org is Neta DAO's. They never colour a game, a stamp or a headline, and never sit as text on `paper` (cyan reads 1.7:1 there; PLAY carries a 2px `frame` edge).

**Project identities.** A project field sets five roles with one class and pins its own theme, so the site's theme never re-tints a game:
- `ld-pj--p18` + `data-theme="press"` — the gilded boardroom, taken from the game's own art and code: `p18-ground` near-black, `p18-paper` text, `p18-gold` with a gilt gradient (`ld-gilt`) for its numerals, walnut and sepia on its plates, and on the board its own land and tile tiers (`p18-land`, `p18-tile-*`). Its name is set in Anton with 18XX in gilt (`ld-gilt`); its feature and masthead pictures are gold line drawings on black whose edges fade into the field (`ld-lineart`); the title cards of its three tables are shown as made in gilt frames (`ld-giltframe`).
- `ld-pj--cosmos` + `data-theme="press"` — robber barons in the internet age: the 18xx system with blockchains for railroads, validators for trains, and IBC channels, relayers and bridges for track. `p20c-night` ground, `p20c-cream` linework, `p20c-yellow` signal, `p20c-blue` zones, `p20c-line` channels; its pictures are steel-blue engravings of internet-age machinery and money on night navy (`assets/20 Cosmos/`), faded into the field (`ld-lineart`). No trains or rails, and not outer space: no planets, nebulae or starfields.
- A new project takes its accent from the house pigments first; two projects never share both ground and accent.

**Type.** Anton (display, uppercase, `d0`–`d5`, line height under 1) and IBM Plex — Sans for reading (`lede`, `body`, `body-s`), Mono for the apparatus (`label`, `label-s`, `data`, `button`, `nav-m`). Display sizes step down at 1279 / 1023 / 599px through `--ld-d0`…`--ld-d5` and the `.ld-d0`–`.ld-d5` classes. One picked-out word per heading, in `red`. Text is always live type, never set into pictures. See **TypeScale**.

**Layout.** 12 columns from tablet up, 4 on phones; margins 48 / 32 / 24 / 16; gutters 24 (16 from tablet down); frame max 1600px; reading measure 680px. Compositions overlap and bleed on purpose (numerals over pictures, pictures off the edge); reading text never does. Spacing `space-1`…`space-10` (4 → 128). See **Grid** and **Responsive**.

**Rules, corners, shadows.** Structure is drawn with rules: `rule-hair` 1px between rows, `rule-2` for modules and controls, `rule-4` over metadata, `rule-bar` 8px, `rule-band` 16px stripe bands on field edges. `radius-0` everywhere; `radius-token` only for drawn pieces, stations, the hub and the red sun. No shadows: sheets are set apart by `rule-strong`.

**Texture.** Print, not decoration: `ld-grain` on fields and mastheads, `ld-halftone`/`ld-hatch` for fills, one `ld-torn` edge per page at most. Never under running text; never animated.

**Imagery.** Pictures are printed onto the stock: `ld-treat--print` (colour, multiply), `--ink` (engraving), `--night` (on dark fields), `--duo` (one pigment), `--screen`. The house uses railway engraving, the 18xx board, pieces and certificates; Project 18XX uses gold line drawings on black and its title cards (`assets/Project 18XX/`), untreated; 20 Cosmos uses steel-blue engravings of the internet age — data centres, glass towers, network charts — untreated. Hard crops, square corners, no cards. The files in `assets/Imagery/` are crops of the supplied reference sheets standing in until final photography. See **ImageTreatments**, **Collage**, **Figure**.

**Diagrams.** Drawn as live SVG in the project's palette, every mark in a legend: flat-topped hexes on dark-green land, tile tiers and dark track for Project 18XX; hex-field zones, octilinear routes and ringed stations for 20 Cosmos, with abstract names (Hub, Gate, Yard…; Zone 1…). See **DiagramStyle** and **RouteMap**.

**Motion.** Rest is still; hover acts. Hard wipes (`dur-wipe` 240ms, `ease-press`) on buttons, rows, tabs and board flaps; prints (`dur-print` 560ms) and route draws (`dur-draw` 1200ms) once as things enter the view. `prefers-reduced-motion` turns every transition instant and hides nothing. See **Motion**.

**States.** Hover: a wipe in the second colour, arrows step (out-links step up-right), rows fill `paper-2`, pictures print in. Active: pressed 2px. Focus: a solid 3px `focus` ring offset 3px — `ink` on stock, `yellow` in Press, on the frame and in the 20 Cosmos field. Disabled: hatched, `ink-3`. Every text pair named in the tokens holds 4.5:1 (3:1 for display); checked in both themes.

## Iconography

A small drawn set (22 icons) in the bundle: 24px grid, 2px square-capped strokes on `currentColor` — `Ludum.icon(name, cls, label)` returns the SVG; `Ludum.icons` holds them. `arrow-out` always means "this leaves Ludum". Icons go beside words; an icon alone carries a label. No emoji, no brand or chain logos. Anton has no ↗ glyph, so arrows are always these SVGs. See **Icons**.

The **Neta DAO mark** in `assets/Logos/` is Neta DAO's supplied artwork: copy it, link it to netadao.org, never redraw or recolour it (`neta-mark-paper.png` on stock, `neta-mark-night.png` on the frame). Ludum has no drawn logo: its **Wordmark** is the name set live in Anton.

## Using the system

- Load `tokens.css`, `components/bundle.css` and `components/bundle.js`; put `class="ld-page"` on `<body>`; call `Ludum.enhance()` once. Without the script every page still reads and works.
- Components are HTML patterns with `ld-` classes; each card's guidelines give the markup, states, responsive behaviour and do's and don'ts.
- Page templates: **Home**, **ProjectsIndex**, **Project18XX**, **Project20Cosmos**, **NotesIndex**, **Note**, **About** at 1440px, and phone cards that show the same markup recomposed at 390px.
- Accessibility is part of each component: a skip link, real headings in order, labelled landmarks, stretched links with row focus rings, `aria-current`/`aria-pressed`, captions on diagrams, alt text on every picture that isn't decoration.
