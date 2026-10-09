# Footer

The black field that closes every page, kept compact: the Neta band, the name and the line beside four columns, the print line.

**Markup.** `<footer class="ld-footer" data-theme="press">` → `.ld-footer__band`, `.ld-wrap.ld-footer__inner` → `.ld-footer__top` (`.ld-footer__name`, `.ld-footer__line`), `.ld-footer__cols` (Projects, Ludum, Play, A Neta DAO project), `.ld-footer__print`.

- The band is the Neta line at full strength (8px, `neta-pink` → `neta-cyan`, the bar of Neta DAO's mark): the footer is where Ludum signs as a Neta DAO project.
- The Neta DAO mark is Neta DAO's own artwork (`assets/Logos/neta-mark-night.png` on the black field; `neta-mark-paper.png` on stock). Copy it, link it to netadao.org, never redraw or recolour it.
- The name is set at d3 with the line under it at d5, in a column beside the four columns: a sign-off, not a poster.
- Under the line, one epigraph on play, small and quiet (`.ld-footer__epigraph`: Plex Sans italic 15px, the source in mono). Three readers take turns across the pages, so each page closes with one of them: Schiller (*On the Aesthetic Education of Man*, 1795, Letter XV), Benjamin (*Toys and Play*, 1928), Freud (*Creative Writers and Day-Dreaming*, 1908). Never more than one per page, and never anywhere else as decoration.
- Footer links are Anton at 20px; hover turns them `yellow`. The Play column always carries the play.netadao.org link.
- Tablet: the name and line sit above the columns, which go two by two. Phone: the same, at the phone's d3.
