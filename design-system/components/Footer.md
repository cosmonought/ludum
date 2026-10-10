# Footer

The footer every Neta DAO site shares — netadao.org, the Academy, Fork and Ludum — set in Ludum's frame: one line under the Neta band.

**Markup.** `<footer class="ld-footer" data-theme="press">` → `.ld-footer__band`, `.ld-wrap.ld-footer__inner` → `a.ld-footer__name` (Ludum, home), `nav.ld-footer__nav` → `ul.ld-footer__sites` (Academy · Fork · Ludum, the current site with `aria-current`) and `ul.ld-footer__marks` (X and Discord as `a.ld-footer__icon` with their own marks, then `a.ld-footer__neta` with Neta DAO's animated mark, to netadao.org), and `p.ld-footer__print` (© 2026 Neta DAO).

- **The same on every Neta DAO site.** The same contents in the same order — the site's name, the family's addresses, X, Discord, Neta DAO's mark, the copyright — each site drawing it in its own type and colours.
- **Marks, not words, where marks exist.** X and Discord are their own glyphs, and netadao.org is Neta DAO's mark. The Academy, Fork and Ludum have no marks of their own, so they are words.
- **The animated mark on dark footers.** `assets/Logos/neta-mark-loop.webp` is Neta DAO's own loop, from netadao.org; on the frame it sits with `mix-blend-mode: lighten`. A light footer uses `neta-mark-paper.png` instead. Copy the mark, link it to netadao.org, never redraw or recolour it.
- Nothing the nav already carries: no section links, no PLAY, no tagline, and no account or governance links.
- Laptop: the copyright drops to its own line. Phone: the addresses and the marks share one row under the name.
