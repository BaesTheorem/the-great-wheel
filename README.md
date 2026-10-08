# Wildspace Orrery

A 3D map of Realmspace, the crystal sphere of the Forgotten Realms, and of the other crystal spheres of Spelljammer. Open it at <https://becomingstronger.github.io/wildspace-orrery/>.

It shows Realmspace in full, with the bodies from *Realmspace* (TSR, 1991): the sun, the eight planets, their moons, the Tears of Selûne, Comet K'Thoutek, the Skull of the Void and more. They move on their orbits for the date that you choose on the Calendar of Harptos.

Between the spheres is the phlogiston, with all 50 crystal spheres that published D&D material names. The map shows the currents and travel times that the books give, and three groups: the Known Spheres, the Arcane Inner Flow and the Vodoni Empire. So far, only Realmspace has its worlds on the map.

A switch changes the cosmology from 2e (crystal shells in the rainbow phlogiston) to 5e (wildspace systems in the silver Astral Sea). Each item gives the book and the pages for its facts. Each item also links to its page on the Forgotten Realms Wiki or the Spelljammer Wiki.

## Use the map

- Drag to turn the view. Scroll or pinch to zoom. Click a sphere, body, current or group to see its information.
- The View tiles: World flies to the selected world, Sphere shows the full sphere, and Phlogiston (Astral Sea in 5e) shows the map between the spheres. On that map, double-click a sphere to go into it.
- The time bar moves the orbits forward or back. Campaign date returns to the date in Settings.
- Share copies a link to the current view, date and edition.
- Add `?embed` to the address to put the map in a page of your own. The map then waits for a click before it takes the mouse wheel, and the page can scroll past it.

## Run it and edit it

The site is static: `site/` is the full website, with no build step. To edit the map, run the editor server (Python 3.9 or newer, no packages needed):

```sh
bin/orrery serve --open
```

Click Edit in the top bar. On the phlogiston map, the edit bar adds spheres and currents. In each view, Body adds a planet, moon, asteroid field, ring, comet, nebula, structure, ship, dead-magic zone, portal, floating island or dead god. Select an item and click Edit in its panel to change it or delete it. Save writes the atlas, and Publish commits and pushes it, after which GitHub Pages rebuilds the site.

Without the server, add `?edit` to the address. Your edits then stay in the browser until you download the atlas.

### DM notes and secrets

Each item has DM notes, DM links and a Secret switch. When the folder `private/` exists, the editor keeps the full atlas in `private/atlas.json` and writes a public copy to `site/data/atlas.json`. The public copy has no DM notes, no DM links and no secret items. Git ignores `private/`, so you can make it a private repository of its own for your campaign. Without `private/`, `site/data/atlas.json` is the only atlas.

## The data

`site/data/atlas.json` holds the map. Distances are in miles and periods are in days. `phase_deg` is the position of a body on its orbit on 1 Hammer 1492 DR, which is day 0 of the clock. A body has an `orbit` (`radius_mi`, or `peri_mi` and `apo_mi`) or a `fixed` position (`r_mi`, `lon_deg`, `lat_deg`). `"approx": true` marks a position that is a guess. A current is `one-way`, `two-way` or `route`, where `route` means that the books name the link but not its direction.

Every item has `sources` (the book and the pages) and `wiki` (a Forgotten Realms Wiki title such as `"Glyth"` or `"Glyth#Haven"`, or a full URL). A field in `by_edition` replaces the base field in one edition, for example `"by_edition": {"5e": {"summary": "..."}}`.

Sphere positions on the phlogiston map follow the known currents and groups. The distances between spheres are not to scale.

## Commands

| Command | What it does |
| --- | --- |
| `bin/orrery serve [--port 5027] [--open]` | Runs the map with edit mode on this computer only |
| `bin/orrery check` | Checks the atlas for missing parents, unknown kinds, bad ids and bad currents |
| `bin/orrery fmt` | Writes the atlas files in a stable format |
| `bin/orrery deploy [--no-push] [-m MSG]` | Writes the public atlas, then commits and pushes this repo and `private/` |
| `bin/orrery new-sphere ID --name NAME [--pos X,Y,Z]` | Adds an empty sphere |
| `tools/smoke.py [--shots DIR] [--tour]` | Opens each view in headless Chromium and fails on a page error (needs Playwright) |
| `tools/assets/fetch_models.py`, `tools/assets/build_models.py` | Downloads the source models, then makes the web models with headless Blender |

## Add a sphere from a sourcebook

1. Put the scan in `sources/`. Git ignores that folder.
2. If the scan has no text layer, run OCR: `ocrmypdf --skip-text scan.pdf scan-ocr.pdf`, then `pdftotext -layout scan-ocr.pdf book.txt`.
3. Find the stat blocks (`PLANET NAME`, `PLANET TYPE`, `PLANET SIZE`, `SATELLITES`, `DAY LENGTH`, `YEAR LENGTH`, `DISTANCE/TIME FROM`).
4. Add the bodies in the editor, with the book and the pages in Sources and the wiki page in the wiki field.
5. Set the sphere to Charted, run `bin/orrery check`, then click Publish.

## Credits

See [CREDITS.md](CREDITS.md) for every asset and its license. In short:

- Planet surfaces and the Sun: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.
- Rocks, the cliff, the fort and the bark: [Poly Haven](https://polyhaven.com), CC0.
- The skull: "High quality skull" by Mariano Coretti on [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:High_quality_skull.stl), CC BY-SA 4.0.
- The galleon outline: Lorc, [game-icons.net](https://game-icons.net), CC BY 3.0.
- Maps of Toril: World Map of Toril by Adam Whitehead ([Atlas of Ice and Fire](https://atlasoficeandfireblog.wordpress.com/)), with Faerûn from the Wizards of the Coast 3E map.
- Code: [three.js](https://threejs.org/), [Beer CSS](https://www.beercss.com/), [Inter](https://rsms.me/inter/), [Material Symbols](https://fonts.google.com/icons).

The code is under the MIT license (see [LICENSE](LICENSE)). Spelljammer, the Forgotten Realms and the other settings belong to Wizards of the Coast. This is a fan project and is not affiliated with Wizards of the Coast.
