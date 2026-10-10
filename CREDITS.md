# Credits and licenses

## Models (site/assets/models)

| File | Source | License |
| --- | --- | --- |
| `rock_a`, `rock_b`, `rock_c`, `rock_d` (and `_lo`) | Poly Haven: Moon Rock 01, 03, 05, 06 | CC0 |
| `spindle.glb` | Poly Haven: Namaqualand Cliff 02, stood on end and tapered | CC0 |
| `windlauer.glb` | Poly Haven: Modular Fort 01, Moon Rock 06, Dead Tree Trunk (bark) | CC0 |
| `garden.glb` | Poly Haven: Moon Rock 03, 05, 06, Dead Tree Trunk (bark) | CC0 |
| `bral.glb` | Poly Haven: Moon Rock 03, Modular Fort 01 | CC0 |
| `skull.glb` | "High quality skull" by Mariano Coretti, Wikimedia Commons, reduced with ambient occlusion baked in | CC BY-SA 4.0 (this derived file is CC BY-SA 4.0 too) |

`tools/assets/fetch_models.py` downloads the sources and `tools/assets/build_models.py` (headless Blender) makes these files.

## Textures and shapes

- Planet surfaces and the Sun (`site/assets/textures/2k_*`): Solar System Scope, https://www.solarsystemscope.com/textures/, CC BY 4.0.
- Galleon outline for the Galleon Nebula (`site/assets/shapes/galleon.svg`): "Galleon" by Lorc, https://game-icons.net, CC BY 3.0.
- Maps of Toril (`site/assets/textures/toril-*.jpg`): World Map of Toril by Adam Whitehead (Atlas of Ice and Fire, https://atlasoficeandfireblog.wordpress.com/), with Faerûn from the Wizards of the Coast 3E map laid over it.
- Bark and leaves of Faeriespace's Great Tree (`bark_diff.jpg`, `bark_nor.jpg`, `leaves_atlas.png`): Poly Haven, bark_brown_02 and the leaves of island_tree_02, CC0.
- Mystara (`mystara.jpg`): "Hollow World Set Outer World map in Equirectangular projection" by Thorfinn Tait (https://www.thorfmaps.com/lining-up-mystara-xv/, 2016), from the Outer World poster map of the Hollow World Set (TSR, 1990). Shared under a Creative Commons Attribution-ShareAlike license, as thorfmaps.com states; this file is under the same license. The Atlas of Mystara (https://atlasofmystara.com) now publishes Tait's work under CC BY-NC-SA 4.0.
- Oerth (`oerth.jpg`): the Northern Summer map of "The Oerth: A Planetary Model of the World of Greyhawk v1.5" by Anna B. Meyer (https://www.annabmeyer.com/2021/08/10/oerth-part-9-planetary-model-v1-5/, 2021), with the two caption words taken off the polar ice. The page states no license.
- Matera (`matera.jpg`): "LoZompatore's Matera" by Michele Carpita (https://atlasofmystara.com/lozompatore-matera/, 2016), made from images of Earth's Moon. Fan-made maps on the Atlas of Mystara are copyright their creators.
- Coastlines of Krynn (`krynn-mask.png`): "Krynn: World of the Dragonlance Saga, c. 351 AC" by Adam Whitehead (https://atlasoficeandfireblog.wordpress.com/2019/07/31/dragonlance-a-map-of-krynn/, 2019), after the work of Justin Parkoff and the Dragonlance Nexus team. The mask keeps the land and the Great Burning Sea; the terrain inside is painted.
- Coastlines of Patera (`patera-mask.png`): "Ashtagon's Patera, 8 miles per hex v1" by Emma Rome (https://atlasofmystara.com/ashtagon-patera-8-v1/, 2026). The mask keeps the land; the terrain inside is painted.

`tools/maps/mask.py` makes a land mask from a map image.

## Built structures

The bases, towers, towns and citadels in `site/js/structures.js` (the Habitat, Armon, the constellations of Clusterspace, Skyport, Oloth Kulggen, Darkwatch, Gamaro Base, Port Kazdeyn, the pirate base, Vocath's base and the Imperial Citadel) are made in code from simple solids, after the descriptions in their books. The asteroids under some of them are the Poly Haven rocks above.

## Painted worlds

Worlds with no texture file are painted on the GPU from 3D simplex noise (`site/js/planets.js`). The noise is webgl-noise by Ian McEwan and Stefan Gustavson (Ashima Arts, https://github.com/ashima/webgl-noise), MIT license.

## Black hole

The black hole follows the ray-tracing method of Otto Seiskari's black-hole (https://github.com/oseiskar/black-hole, MIT license): each light ray is followed along its orbit in its own plane.

## Facts

*Realmspace* (TSR, 1991), the *Planescape Campaign Setting* (TSR, 1994) and the other books named on each item. Spelljammer, Planescape, the Forgotten Realms and the other settings belong to Wizards of the Coast. Every item links to its page on the Forgotten Realms Wiki (https://forgottenrealms.fandom.com) or the Spelljammer Wiki (https://spelljammer.fandom.com).

## Code

three.js (MIT), Beer CSS (MIT), Inter (OFL), Material Symbols (Apache 2.0).

## Fan Content

The Great Wheel is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
