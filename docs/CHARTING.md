# Charting a sphere

This is how a sphere goes from a sourcebook to the map. The same steps charted every sphere after Realmspace.

## 1. Make text from the book

Put your own copy of the book in `sources/` (git ignores that folder, so no book goes into the repo). Then:

```sh
ocrmypdf --skip-text book.pdf book-ocr.pdf          # only when the PDF has no text layer
tools/columns.py book-ocr.pdf book.cols.txt          # the text in reading order, column by column
```

`book.cols.txt` marks each page with `=== PDF PAGE n ===`. Sources cite the printed page numbers, so find the offset between PDF pages and printed pages from a printed folio or the table of contents.

## 2. Write a chart file

One JSON file per sphere, in the format below. Every body has a source page and a wiki link. Only orbits can be estimates, and estimates carry `"approx": true`.

### The chart file

```json
{
  "sphere_id": "greyspace",
  "sphere": { "summary": "...", "facts": [["Shell diameter", "16,000 million miles"]], "sources": [{"title": "SJR6 Greyspace", "pages": "3-7"}], "shell_radius_mi": 8000000000 },
  "bodies": [ ... ],
  "notes": "Estimates, doubts and conflicts between sources (not merged into the atlas)."
}
```

`sphere` holds only the sphere fields to change: `summary` (2 to 3 sentences), `facts`, `sources`, and when the book gives them `shell_radius_mi` (half the diameter), `aka` (other names, a list), `stars` (the number of star points to draw on the shell; default 6500; a dark sphere gets fewer). Do not change the sphere's id, name, wiki, editions, region or map.

### Bodies

One object per body. Include every named body the book describes as part of the sphere: the primary, every planet, every named moon, asteroid belts and fields, comets, named asteroids, nebulae, dead-magic zones (sargassos), structures in space (castles, stations) and other named phenomena that have a place in space. Do not include ships, people, or cities and places on a planet's surface (name important ports in the planet's facts).

Fields, in this order:

| Field | Value |
| --- | --- |
| `id` | lowercase words joined by hyphens, unique in the sphere: `"oerth"`, `"the-grinder"` |
| `name` | the name as the book prints it |
| `kind` | `star`, `planet`, `moon`, `asteroid`, `asteroid-field`, `ring`, `comet`, `nebula`, `structure`, `sargasso`, `island`, `dead-god`, `portal`, `black-hole`, `other` |
| `parent` | the id of the body it orbits; `null` for the primary only (exactly one body has `null`) |
| `element` | `earth`, `air`, `fire`, `water`, `live`, `other` (from the book's body type: "Spherical earth body" = earth) |
| `shape` | `sphere`, `disc` (flat), `hemisphere` (a dome with its flat side to the sun), `cluster` (a group of rocks that count as one body; for a star, a knot of fire bodies), `irregular`, `cylinder`, `crescent`, `ellipsoid` (stretch it with `look.stretch: [x, y, z]`), `torus`, `cube`, `tetrahedron`, `tree` (a tree that fills the sphere, with a branch to each body that has a fixed place on it), `other` |
| `size_class` | the book's size letter, `A` to `J` |
| `orbit` | see Orbits |
| `fixed` | instead of `orbit`, for a body that stays still: `{"r_mi": 2400000000, "lon_deg": 150, "lat_deg": 14, "approx": true}` |
| `day_hours` | the book's day length in hours (a number) |
| `ring` | for kind `ring` only: `{"inner": 1.5, "outer": 2.4, "tilt_deg": 20}` (radii as multiples of the parent's radius) |
| `field` | for an asteroid field: `{"count": 900, "spread": 0.06}` (count of dust points, 400 to 2000; spread = width as a fraction of the orbit radius). Add `"shell": true` for a hollow shell of rocks all around the parent, or `"fill": true` for rocks all through the sphere out to the orbit radius (then `parent` can be `null`) |
| `cloud` | for a nebula: `{"colors": ["#7fd3ff", "#c58bff"], "length_mi": 2000000, "shape": "cloud"}` |
| `diameter_mi` | when the book gives an exact diameter |
| `look` | see Looks |
| `summary` | 1 to 3 sentences, see Writing |
| `facts` | 3 to 7 pairs `["Label", "Value"]`: Type, Size, Day, Year, Distance from (the primary), Satellites, Population, and 1 or 2 notable facts (for example Spelljamming ports) |
| `sources` | `[{"title": "SJR6 Greyspace", "pages": "7-9"}]` printed pages |
| `wiki` | a Spelljammer Wiki URL (`https://spelljammer.fandom.com/wiki/Oerth`) or a Forgotten Realms Wiki page title (`"Oerth"`); `"Page#Section"` for a section. Prefer the page about this body. If there is none, use the sphere's page with a section anchor, or the sphere's page |
| `editions` | copy the sphere's editions, normally `["2e", "5e"]` |

### Orbits

`"orbit": {"radius_mi": 100000000, "period_days": 365, "phase_deg": 40, "incl_deg": 0}`

- `radius_mi`: the distance from the parent in miles, as the book gives it ("100 million miles" = 100000000). For a distance that varies, use `peri_mi` (nearest) and `apo_mi` (farthest) instead of `radius_mi`.
- `period_days`: the year length in days (the time for one orbit). If the book gives none, estimate it with Kepler's third law from a body in the same system with a known distance and year: P = P_ref * (r / r_ref)^1.5. With no such body, use P = 365 * (r / 93,000,000)^1.5. Then add `"approx": true`.
- `phase_deg`: where on the orbit the body is at day 0. The books do not give this: pick a different value from 0 to 359 for each body, so the bodies spread around their orbits.
- `incl_deg`: 0, unless the book gives a tilt (then give it). `node_deg` turns the tilted orbit around the vertical axis (0 to 359).
- Moons orbit their planet: `radius_mi` is the distance from the planet. If the book gives none, pick a believable value (100,000 to 400,000 miles for small moons) and add `"approx": true`.
- A geocentric system (a world at the center, the sun in orbit around it) is normal in Spelljammer: the world is the primary (`parent: null`) and the sun is a body with `parent` = that world and an orbit.
- Never invent anything but orbits. For orbits, estimate when you must, set `"approx": true`, and say what you estimated in `notes`.

### Looks

`look.color`: one hex color that stands for the body (used for its label and orbit line). `look.atmosphere`: a hex color for a visible air envelope (only worlds with air). Then one surface choice:

1. **`look.proc`** (preferred for planets and large moons): a world painted on the GPU from noise. `{"style": "terran", "sea": 0.55, "ice": 0.12, "clouds": 0.4}`.
   - `style`: `terran` (seas and land), `ocean` (mostly water), `jungle` (green, little sea), `desert`, `ice`, `lava`, `gas` (a banded giant), `cloud` (a world of thick clouds, good for air bodies), `rock` (bare stone), `crystal` (faceted), `living` (tissue and veins).
   - `sea` 0 to 1 (the fraction of the globe under water, terran types), `ice` 0 to 0.5 (polar caps), `clouds` 0 to 1 (cloud layer cover; 0 = none), `bands` 4 to 12 (gas), `warp` 0 to 1 (swirl), `scale` 1 to 3 (feature size; larger = smaller features), `glow` (lava brightness, about 1.6), `cloud_color` (hex).
   - `palette`: up to 6 hex colors, in this order: terran/ocean/jungle [deep water, shallow water, green land, dry land, highland, snow]; gas [band A, band B, band C, band D, storm, storm core]; desert [sand, light sand, rock, dry bed, polar cap]; ice [snow, ice, crack, dark ice]; lava [dark crust, crust, glow]; cloud [cloud, shadow, highlight, lane]; rock [light, dark, bright]; crystal [face A, face B, edge]; living [tissue A, tissue B, vein]. Leave it out to use the style's default colors. Set it when the book describes colors.
2. **`look.texture`** (good for small rocky moons): `"assets/textures/2k_moon.jpg"`, optionally with `"tint": [r, g, b]` (multipliers, about 0.6 to 1.3) and `"keep": 0 to 1` (how much of the photo's own color to keep). Available: 2k_moon, 2k_mercury, 2k_mars, 2k_venus_surface, 2k_venus_atmosphere, 2k_jupiter, 2k_neptune, 2k_uranus, 2k_ceres_fictional, 2k_eris_fictional, 2k_haumea_fictional, 2k_makemake_fictional (all `.jpg`).
3. Stars: `look.color` (yellow-white `#fff3e0`, white `#f4f6ff`, red `#ff8a5c`, orange `#ffb070`, blue `#bcd4ff`). A minor star that lights nothing: `"light": false`. A group of small stars that count as one body: `"cluster": 9`. A star that swells and shrinks: `"pulse_hours": 6`. A sphere keeps the light of its first four suns.
4. Asteroids and irregular rocks: only `look.color` (a photoscanned rock is drawn and tinted).
5. Floating islands around a world: `"islands": {"count": 40, "color": "#9fb08a"}`. Small moons that circle a body: `"moonlets": 12`.

Match the look to the book: an air body with floating islands = `cloud` style plus `islands`; a fire body that is not a sun = `lava`; a water body = `ocean` (with `sea` near 0.95 for a world of water); a living world = `living`.

### Writing

All prose (summaries and fact values) follows ASD-STE100 Simplified Technical English, as plain American English:
- Short sentences: 25 words at most, one topic each. Simple present or simple past tense, active voice.
- Use simple, common words. Do not use: should, may, might, would, could (except as the past of can), very, really, just, quite, perhaps, maybe, probably, etc., e.g., i.e. Write "can" or "it is possible that".
- No em dashes or en dashes, no semicolons. Use a period, a comma, a colon or parentheses.
- No "-ing" verb forms as verbs ("is orbiting" -> "orbits"). Nouns like "spelljamming" are fine.
- Write facts in your own words. Never copy more than 10 words in a row from the book.
- No filler, no hype ("majestic", "mysterious", "breathtaking"). Give facts.

Example summary: "A spherical earth body at the center of Greyspace. Every other body in the sphere orbits it, the sun Liga too. Its people are mostly humans and humanoids."

## 3. Check and merge

```sh
tools/chart_check.py charts/greyspace.json           # the atlas check plus the house rules
tools/chart_merge.py charts/greyspace.json           # writes the sphere into site/data/atlas.json
bin/orrery check                                     # then publish (bin/orrery deploy)
```

The merge replaces the sphere's list of bodies and marks it charted. It never changes the sphere's id, name, wiki link, editions, group or place on the map. DM notes in the private overlay stay with the bodies whose ids do not change.
