# SiteNavPhone

The SiteNav at phone width, closed and open: the open sheet is the same `nav.ld-nav__links`, recomposed, not a second menu.

- Closed: name, PLAY (compact) and Menu.
- Open: numbered links at 64px on `frame`, each over a `rule`; the current one carries the `yellow` bar; PLAY repeats at the foot with "Ludum publishes. The games run on play.netadao.org."
- The open sheet covers the page below the bar (`100dvh` less the bar) and scrolls on its own.
- `ld-nav--open-demo` exists only to show the open state in this card; the site toggles `is-open` from the Menu button.
