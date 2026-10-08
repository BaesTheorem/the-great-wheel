# The Great Wheel

A 3D map of the D&D multiverse. It starts with the Prime Material Plane: Realmspace, the crystal sphere of the Forgotten Realms, and the other crystal spheres of Spelljammer. Open it at <https://baestheorem.github.io/the-great-wheel/>.

The [roadmap](ROADMAP.md) adds the rest of the Great Wheel: the Ethereal and Astral planes, the Inner Planes, the Outer Planes and the planes beyond them.

It shows Realmspace in full, with the bodies from *Realmspace* (TSR, 1991): the sun, the eight planets, their moons, the Tears of Selûne, Comet K'Thoutek, the Skull of the Void and more. They move on their orbits for the date that you choose on the Calendar of Harptos.

Between the spheres is the phlogiston, with all 50 crystal spheres that published D&D material names. The map shows the currents and travel times that the books give, and three groups: the Known Spheres, the Arcane Inner Flow and the Vodoni Empire. So far, only Realmspace has its worlds on the map.

A switch changes the cosmology from 2e (crystal shells in the rainbow phlogiston) to 5e (wildspace systems in the silver Astral Sea). Each item gives the book and the pages for its facts. Each item also links to its page on the Forgotten Realms Wiki or the Spelljammer Wiki.

## Use the map

- Drag to turn the view. Scroll or pinch to zoom. Click a sphere, body, current or group to see its information.
- The View tiles: World flies to the selected world, Sphere shows the full sphere, and Phlogiston (Astral Sea in 5e) shows the map between the spheres. On that map, double-click a sphere to go into it.
- The time bar moves the orbits forward or back. Campaign date returns to the date in Settings.
- Share copies a link to the current view, date and edition.
- Add `?embed` to the address to put the map in a page of your own. The map then waits for a click before it takes the mouse wheel, and the page can scroll past it.

## Edit the map

There are two ways to edit. The published website has no edit mode.

### On GitHub

Edit `site/data/atlas.json` in the GitHub web editor (the pencil icon), or send a pull request. A check runs on each push and each pull request. When a change to `main` passes the check, GitHub Pages publishes it in approximately a minute. A change that fails the check does not go live.

### With the local editor

The site is static: `site/` is the full website, with no build step. To edit the map on your computer, run the editor server (Python 3.9 or newer, no packages needed):

```sh
bin/orrery serve --open
```

The server first pulls the latest changes from GitHub, so edits made on GitHub show in the editor. Click Edit in the top bar. On the phlogiston map, the edit bar adds spheres and currents. In each view, Body adds a planet, moon, asteroid field, ring, comet, nebula, structure, ship, dead-magic zone, portal, floating island or dead god. Select an item and click Edit in its panel to change it or delete it. Save writes the atlas, and Publish commits and pushes it.

### DM notes and secrets

Each item has DM notes, DM links and a Secret switch. They do not go into the public atlas. When the folder `private/` exists, the editor keeps them in `private/overlay.json`, which holds only private data: the notes, keyed by item, and the secret items. The editor joins the overlay with the public atlas when it loads, and splits the two again on each save. Thus an edit on GitHub and an edit in the editor never overwrite each other's data. Git ignores `private/`, so you can make it a private repository of its own for your campaign.

## The data

`site/data/atlas.json` holds the map. Distances are in miles and periods are in days. `phase_deg` is the position of a body on its orbit on 1 Hammer 1492 DR, which is day 0 of the clock. A body has an `orbit` (`radius_mi`, or `peri_mi` and `apo_mi`) or a `fixed` position (`r_mi`, `lon_deg`, `lat_deg`). `"approx": true` marks a position that is a guess. A current is `one-way`, `two-way` or `route`, where `route` means that the books name the link but not its direction.

Every item has `sources` (the book and the pages) and `wiki` (a Forgotten Realms Wiki title such as `"Glyth"` or `"Glyth#Haven"`, or a full URL). A field in `by_edition` replaces the base field in one edition, for example `"by_edition": {"5e": {"summary": "..."}}`.

Sphere positions on the phlogiston map come from `tools/layout.py`, a 3D force layout that follows the known currents and groups. The books give no positions in the phlogiston, so the distances between spheres are not to scale. A sphere with `"pinned": true` in its `map` keeps its position.

## Commands

| Command | What it does |
| --- | --- |
| `bin/orrery serve [--port 5027] [--open]` | Pulls from GitHub, then runs the map with edit mode on this computer only |
| `bin/orrery check` | Checks the atlas for missing parents, unknown kinds, bad ids and bad currents |
| `bin/orrery fmt` | Writes the atlas files in a stable format |
| `bin/orrery deploy [--no-push] [-m MSG]` | Commits and pushes this repo and `private/`, the same as the Publish button |
| `bin/orrery new-sphere ID --name NAME [--pos X,Y,Z]` | Adds an empty sphere |
| `tools/smoke.py [--shots DIR] [--tour]` | Opens each view in headless Chromium and fails on a page error (needs Playwright) |
| `tools/test_layers.py` | Tests the split into the public atlas and the private overlay |
| `tools/layout.py [--new] [--seed N]` | Lays the spheres out in 3D from their currents and groups; `--new` places only new spheres |
| `tools/make-app.sh` | Builds a macOS app that starts the local editor with a double-click |
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
