# Ludum

Ludum is Neta DAO's game publisher — ludum.netadao.org. The games themselves run on play.netadao.org.

**Status:** design system and page templates, for review. Nothing here is deployed; the live site is built after the system is approved.

## What's here

| Path | What |
|---|---|
| `design-system/README.md` | The brand book: Ludum and Play, voice, colour, project identities, type, layout, rules, texture, imagery, diagrams, motion, states, icons |
| `design-system/tokens.json` | The tokens: colours (Stock and Press themes, Project 18XX and 20 Cosmos palettes), type, spacing, radius, rules, layout, timing |
| `design-system/css/ludum.css` | Everything a page needs to look right: the compiled tokens plus every component's styles (`tokens.css` is the tokens alone) |
| `design-system/js/ludum.js` | A small enhancer: reveals, route drawing, the phone menu, tabs, filters, map tracing. Call `Ludum.enhance()` once |
| `design-system/fonts/` | Anton and IBM Plex (Sans, Mono), subset, with their OFL licences |
| `design-system/components/*.md` | Guidelines for each component, foundation card and page template |
| `templates/` | The seven page templates as static HTML: `index.html` (Home), `projects.html`, `project-18xx.html`, `20-cosmos.html`, `notes.html`, `note.html`, `about.html` |
| `assets/img/`, `assets/logos/`, `assets/project-18xx/` | Imagery cropped from the reference sheets (placeholders until final photography), Neta DAO's supplied mark, and Project 18XX's own art from its repository |

## Look at it locally

From the repository's root:

```
python3 -m http.server 8000
```

then open http://localhost:8000/templates/ — every page works at desktop, tablet and phone widths (resize the window).

## Ground rules

- PLAY always leaves for play.netadao.org. Both games are **In development**, so their pages show the in-development PLAY plate; switch a game to a linked PLAY and a PLAYABLE stamp in the same change, the day it opens.
- Say only what is settled: Project 18XX's facts (actions, tables, house rules, trains) come from its own repository; 20 Cosmos's rules are unpublished, so its pages describe its world and themes only.
- Names: the first game is Project 18XX. Don't name another publisher's 18xx title, designer or edition anywhere in Ludum, and keep real railroads' names and heralds off Ludum's plates, pieces and pictures.
- Note titles, dates and the sample note in `templates/` are illustrative copy.
- The Neta DAO mark is Neta DAO's artwork: never redraw or recolour it.
- Fonts: Anton and IBM Plex are under the SIL Open Font License (see `design-system/fonts/`).
