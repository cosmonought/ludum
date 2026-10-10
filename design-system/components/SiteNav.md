# SiteNav

The black bar at the top of every Ludum page: the name at the left, Projects · Notes · About, and PLAY at the right edge.

**Markup.** `<header class="ld-nav" data-theme="press">` → `.ld-nav__bar` → `.ld-nav__home` (name + byline), `nav.ld-nav__links#ld-menu` (one `<a>` per section, `aria-current="page"` on the current one; Projects is `.ld-nav__drop`, below), the PLAY action (`.ld-play`, linking to play.netadao.org), and `button.ld-nav__menu` (`aria-controls="ld-menu"`). Call `Ludum.enhance()` once.

- **States.** Links: hover wipes a 6px `red` bar in from the left; the current section keeps a `yellow` bar. Focus: a 3px `yellow` ring set inside the bar. PLAY (`neta-cyan`): hover fills from below with `neta-pink` and the arrow leaves up-right.
- **The Neta line.** A 4px `neta-pink` → `neta-cyan` rule runs under the bar, and a 2px one stands between the name and "Games by Neta DAO": the colours of Neta DAO's own mark, marking the seam between Ludum and its parent. Don't use the pair anywhere Ludum isn't touching Neta DAO.
- **PLAY is a way out, never a page here.** It always links to `https://play.netadao.org` and says so in its label. Ludum never stands between a player and a game.
- **Phone (< 600px).** The bar keeps the name, PLAY and Menu. Menu opens the links as a full black sheet, set at 64px with their numbers, and repeats PLAY at the foot, full width. Escape or Menu closes it; focus returns to the button. Without script the links simply sit in a row under the bar. See the **SiteNavPhone** card.
- The bar sticks to the top of the window as the page scrolls, like every netadao.org site's header; a project's tabs stick just under it, and in-page jumps land below both (`scroll-padding-top`).
- The bar is `frame` in both themes; in Press it sits on the black page with a `rule` hairline under it.
- **Projects opens the games.** `.ld-nav__drop` holds `button.ld-nav__drop-btn` (Projects and a down arrow; `aria-expanded`, `aria-controls="ld-projects"`) and `.ld-nav__sub#ld-projects`: each game by its catalogue line and name, directly (Project 18XX, 20 Cosmos), then All projects. It drops from the bar onto the Neta line in the account menu's vocabulary: `frame`, the yellow flap on hover, a 6px `yellow` edge on the current game. The button toggles it; on a pointer it also opens on hover; Escape, a click outside, tabbing away or a second press closes it, and without script focus opens it. The Projects button keeps the `yellow` bar on the catalogue and on every project page. Third card: open on Project 18XX, 20 Cosmos under the pointer.
- **Phone.** In the sheet, Projects is a row like the others (`.ld-nav__drop-link`, to the catalogue) with the games under it at 30px, no toggle; the current game is `yellow`.
- Don't add items. Ludum has three sections and one way out; the games under Projects are a shortcut, not sections.
