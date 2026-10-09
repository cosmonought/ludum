# RouteMap

Maps are drawn, not pictured: live SVG in each project's palette, with a legend that names every mark.

**1830 · the hex map.** Flat-topped hexes (`.ld-hex`, phase fills `--yellow` `--green` `--brown` `--grey`, water hatched in `blue`), coordinates in mono, track in 7px coal (`.ld-track`), cities as cream circles, towns as bars, revenue values in Anton inside rings (`.ld-value`), company stations in `red` (`.ld-token`).

**20 Cosmos · the network chart.** On `p20c-night` with a 100px chart grid. Zones are fields of small hexes: core (`p20c-blue`), alliance (`p20c-yellow`), emerging (cream hatch), frontier (mist crosshatch), neutral. Routes run octilinear, like a transit diagram: main (`p20c-line`, 7px), branch (`p20c-yellow`, 5px), rival (`p20c-red`, 5px, once per chart), proposed (cream dots), interchain link (a cased double line). Stations are rings; the hub is a filled disc with a halo.

- **Motion:** inside `data-ld-draw` the routes draw themselves once (`dur-draw`, staggered) as the map enters the view. With `data-ld-trace`, pointing at or focusing a station lights its routes and the stations they reach and dims the rest.
- **Names are abstract.** Stations are railway words (Hub, Gate, Yard, Depot, Junction…), zones are numbered. Never real chain names or logos on a Ludum chart.
- **Accessible:** the SVG carries `role="img"` (hex map) or `role="group"` with focusable stations (network); a caption says the chart is illustrative.
- Phone: the network chart crops around the hub (`ld-map--crop`) and its legend panel drops below.
