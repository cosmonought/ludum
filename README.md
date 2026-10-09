# Ludum

Ludum is Neta DAO's game publisher — ludum.netadao.org. The games themselves run on play.netadao.org.

**Status:** live at https://ludum.netadao.org, served by GitHub Pages from this repository's root (`main`, `/`). The design system and its guidelines live alongside it.

## What's here

| Path | What |
|---|---|
| `design-system/README.md` | The brand book: Ludum and Play, voice, colour, project identities, type, layout, rules, texture, imagery, diagrams, motion, states, icons |
| `design-system/tokens.json` | The tokens: colours (Stock and Press themes, Project 18XX and 20 Cosmos palettes), type, spacing, radius, rules, layout, timing |
| `design-system/css/ludum.css` | Everything a page needs to look right: the compiled tokens plus every component's styles (`tokens.css` is the tokens alone) |
| `design-system/js/ludum.js` | A small enhancer: reveals, route drawing, the phone menu, tabs, filters, map tracing. Call `Ludum.enhance()` once |
| `design-system/fonts/` | Anton and IBM Plex (Sans, Mono), subset, with their OFL licences |
| `design-system/components/*.md` | Guidelines for each component, foundation card and page template |
| `index.html`, `projects/`, `about/`, `404.html` | The live site: Home, the projects index, Project 18XX, 20 Cosmos, About, and a 404 page. Generated from the design system's page templates; Notes are held back until real notes exist |
| `CNAME`, `.nojekyll` | GitHub Pages: the custom domain, and no Jekyll processing |
| `assets/img/`, `assets/logos/`, `assets/project-18xx/`, `assets/20-cosmos/` | Imagery cropped from the reference sheets, Neta DAO's supplied mark, and each game's own pictures |

## Look at it locally

From the repository's root:

```
python3 -m http.server 8000
```

then open http://localhost:8000/ — every page works at desktop, tablet and phone widths (resize the window). Paths are absolute, so serve the repository root.

## Ground rules

- PLAY always leaves for play.netadao.org. Both games are **In development**, so their pages show the in-development PLAY plate; switch a game to a linked PLAY and a PLAYABLE stamp in the same change, the day it opens.
- Say only what is settled: Project 18XX's facts (actions, tables, house rules, trains) come from its own repository; 20 Cosmos's rules are unpublished, so its pages describe its world and themes only.
- The Neta DAO mark is Neta DAO's artwork: never redraw or recolour it.
- Fonts: Anton and IBM Plex are under the SIL Open Font License (see `design-system/fonts/`).
