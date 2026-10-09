# SiteNav

The black bar at the top of every Ludum page: the name at the left, Projects · Notes · About, and PLAY at the right edge.

**Markup.** `<header class="ld-nav" data-theme="press">` → `.ld-nav__bar` → `.ld-nav__home` (name + byline), `nav.ld-nav__links#ld-menu` (one `<a>` per section, `aria-current="page"` on the current one), the PLAY action (`.ld-play`, linking to play.netadao.org), and `button.ld-nav__menu` (`aria-controls="ld-menu"`). Call `Ludum.enhance()` once.

- **States.** Links: hover wipes a 6px `red` bar in from the left; the current section keeps a `yellow` bar. Focus: a 3px `yellow` ring set inside the bar. PLAY (`neta-cyan`): hover fills from below with `neta-pink` and the arrow leaves up-right.
- **The Neta line.** A 4px `neta-pink` → `neta-cyan` rule runs under the bar, and a 2px one stands between the name and "Games by Neta DAO": the colours of Neta DAO's own mark, marking the seam between Ludum and its parent. Don't use the pair anywhere Ludum isn't touching Neta DAO.
- **PLAY is a way out, never a page here.** It always links to `https://play.netadao.org` and says so in its label. Ludum never stands between a player and a game.
- **Phone (< 600px).** The bar keeps the name, PLAY and Menu. Menu opens the links as a full black sheet, set at 64px with their numbers, and repeats PLAY at the foot, full width. Escape or Menu closes it; focus returns to the button. Without script the links simply sit in a row under the bar. See the **SiteNavPhone** card.
- The bar sticks to the top of the window as the page scrolls, like every netadao.org site's header; a project's tabs stick just under it, and in-page jumps land below both (`scroll-padding-top`).
- The bar is `frame` in both themes; in Press it sits on the black page with a `rule` hairline under it.
- Don't add items. Ludum has three sections and one way out.
