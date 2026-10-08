# Roadmap

The Great Wheel is a map of the D&D multiverse. Today it shows the Prime Material Plane as Spelljammer describes it: crystal spheres that float in the phlogiston. The goal is to show all the planes of existence of the Great Wheel cosmology, with each fact tied to a book and a page.

The plane list below follows the [Great Wheel cosmology](https://forgottenrealms.fandom.com/wiki/Great_Wheel_cosmology) page of the Forgotten Realms Wiki. That page cites the *Manual of the Planes* (1st and 3rd editions), the *Planescape Campaign Setting* and the 5e *Dungeon Master's Guide*.

## Done

- [x] Realmspace, charted from *Realmspace* (TSR, 1991): the sun, 8 planets, their moons and rings, the Tears of Selûne, the sargassos, Comet K'Thoutek, the Skull of the Void, Caer Windlauer and 2 nebulae
- [x] Orbits on the Calendar of Harptos, with a time control
- [x] The Dead Shell, from *SJA2 Skull & Crossbows*: its two voidworlds, the Outpost, and a ray-traced black hole with a lensed accretion disk
- [x] The phlogiston: all 50 crystal spheres that published D&D material names, 32 currents with their travel times, and 3 groups (the Known Spheres, the Arcane Inner Flow and the Vodoni Empire)
- [x] A switch between the 2e cosmology (crystal shells, the phlogiston) and the 5e one (wildspace systems in the Astral Sea)
- [x] A source page and a wiki link for each item
- [x] A local editor, a private overlay for DM notes and secret items, and edits on GitHub with an automatic check

## 1. Chart more of the Prime Material Plane

- [ ] Greyspace, from *SJR6 Greyspace*
- [ ] Krynnspace, from *SJR7 Krynnspace*
- [ ] Clusterspace, from *The Astromundi Cluster*
- [ ] Herospace, Greatspace, Darkspace and Faeriespace, from *SJA3 Crystal Spheres*
- [ ] The 12 spheres of the Vodoni Empire, from *SJA4 Under the Dark Fist*
- [ ] Moragspace and Shadowspace, from *SJQ1 Heart of the Enemy*
- [ ] Steel Star and Redeyes, from *SJR1 Lost Ships*
- [ ] Refuge, Pirtelspace and Darnannonspace, from *Dragon* #159 and *Dungeon* #36 and #45
- [ ] Xaryxispace and Doomspace, from the 5e *Light of Xaryxis*
- [ ] A stat-block importer: OCR text from a sourcebook in, draft bodies with page numbers out, for review in the editor

## 2. The Great Wheel: a view above the phlogiston

A new top level. The Prime Material Plane sits at the center, and the planes of the Great Wheel surround it. Each plane has a summary, its sources and its wiki link, and its layers are bodies in it. Clicking the Prime Material Plane opens the phlogiston map that exists today.

### The Transitive Planes

- [ ] The Ethereal Plane: the Border Ethereal, which touches the Prime and the Inner Planes at every point, and the Deep Ethereal, with the color curtain of each plane
- [ ] The Astral Plane: the silver void, the color pools to the Outer Planes, the astral conduits, and islands such as the githyanki city of Tu'narath and the bodies of dead gods
- [ ] The Plane of Shadow (2e and 3e)

### The Inner Planes

- [ ] The four Elemental Planes: Air, Earth, Fire and Water
- [ ] The two Energy Planes: Positive Energy and Negative Energy
- [ ] The four Para-Elemental Planes: Smoke, Ice, Ooze and Magma
- [ ] The eight Quasi-Elemental Planes: Lightning, Steam, Radiance and Minerals on the positive side, and Vacuum, Salt, Ash and Dust on the negative side
- [ ] The Elemental Chaos, the outer edge of the Inner Planes in the revised (5e era) model
- [ ] The layout from the books: a sphere with Positive Energy at one pole, Negative Energy at the other, and the four elements around the middle

### The Outer Planes

The sixteen planes of the wheel, arranged by alignment around the Outlands. The names in parentheses are the older names.

- [ ] Mount Celestia (the Seven Heavens), with its seven layers
- [ ] Bytopia (the Twin Paradises)
- [ ] Elysium
- [ ] The Beastlands (the Happy Hunting Grounds)
- [ ] Arborea (Olympus), with Arvandor
- [ ] Ysgard (Gladsheim)
- [ ] Limbo
- [ ] Pandemonium
- [ ] The Abyss, with its best-known layers
- [ ] Carceri (Tarterus)
- [ ] The Gray Waste (Hades)
- [ ] Gehenna
- [ ] The Nine Hells (Baator), with its nine layers
- [ ] Acheron
- [ ] Mechanus (Nirvana)
- [ ] Arcadia
- [ ] The Outlands, with the Spire, the gate-towns and Sigil, the City of Doors
- [ ] The realms of the Faerûnian gods on their planes, for example Helm's Everwatch on Mechanus
- [ ] The links between planes: the River Styx, the River Oceanus, the color pools and the portals of Sigil

### Echoes, demiplanes and beyond

- [ ] The Feywild and the Shadowfell, the echoes of the Prime in 5e (in 2e, the Plane of Faerie and the Plane of Shadow)
- [ ] Demiplanes, such as the Demiplane of Dread (Ravenloft)
- [ ] The Far Realm, outside the Great Wheel

## 3. The other Forgotten Realms cosmologies

- [ ] The World Tree (3e): the planes as branches and roots of a tree, with Toril's own planes
- [ ] The World Axis (4e): the Astral Sea above, the Elemental Chaos below, and the Feywild and the Shadowfell as echoes
- [ ] A switch between the cosmologies, as the 2e/5e switch works now

## 4. Tools and quality

- [ ] Edit the groups of spheres in the editor (now only in the JSON file)
- [ ] Run the headless browser test (`tools/smoke.py`) on GitHub Actions
- [ ] A list view of the map for keyboards and screen readers
- [ ] Lower texture sizes and fewer labels on slow phones
