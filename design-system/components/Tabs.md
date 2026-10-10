# Tabs

A row of mono labels over a 2px rule: project tabs that move between a page's parts, and filters that narrow a list.

**Markup.** `.ld-tabs` holding `<a>`s (with `aria-current` on the current one) or `<button>`s (`aria-pressed`). For filters add `data-ld-filter="<list id>"` and `data-value` on each button; list items carry `data-ld-status`. For true tab panels use `data-ld-tabs`, `role="tab"` buttons with `aria-controls`; arrows, Home and End move between them.

- **States.** Rest: `ink-3`. Hover: `ink`, a 6px `red` bar wipes in under the label. Current / pressed / selected: `ink` with an `ink` bar. Focus: the 3px ring set inside the tab.
- Counts sit in the label (`.ld-tabs__count`), never as badges.
- On project pages wrap the row in `<div class="ld-tabs-bar"><div class="ld-wrap">…</div></div>`: it sticks to the top while the page scrolls, on the project's ground.
- Phone: the row scrolls sideways with snap; it never wraps into two lines.
- The profile's tabs (`.ld-rectabs`) are the first section's rule: its head sits straight under them, with no gap and no second rule.
