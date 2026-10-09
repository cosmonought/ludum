# Footer

The black field that closes every page: the Neta band, the name at poster size, the line, four columns, the print line.

**Markup.** `<footer class="ld-footer" data-theme="press">` → `.ld-footer__band`, `.ld-wrap.ld-footer__inner` → `.ld-footer__top` (`.ld-footer__name`, `.ld-footer__line`), `.ld-footer__cols` (Projects, Ludum, Play, A Neta DAO project), `.ld-footer__print`.

- The band is the Neta line at full strength (8px, `neta-pink` → `neta-cyan`, the bar of Neta DAO's mark): the footer is where Ludum signs as a Neta DAO project.
- The Neta DAO mark is Neta DAO's own artwork (`assets/Logos/neta-mark-night.png` on the black field; `neta-mark-paper.png` on stock). Copy it, link it to netadao.org, never redraw or recolour it.
- Footer links are Anton at 24px; hover turns them `yellow`. The Play column always carries the play.netadao.org link.
- Tablet: the top stacks and the columns go two by two. Phone: the name runs the full width (31vw).
