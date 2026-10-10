# Sources of the planes

The wheel's planes and paths (the `wheel` key of `site/data/atlas.json`) come from the books below.
`tools/wheel_merge.py` checks and merges a chart of them. These notes record which book gave what,
what the books do not give, and where the books disagree, so that a later edit can follow the same
choices. Page numbers are the numbers printed on the pages.

## Which book gave what

| Book | Used for |
| --- | --- |
| Planescape Campaign Setting, DM Guide | Short entries for each Outer Plane (pp. 48-64) and Inner Plane (pp. 28-39). Paths (pp. 20-25, 43-45), the Ethereal and Astral (pp. 23-25), the Demiplane of Shadow (p. 23) |
| Planescape Campaign Setting, Sigil and Beyond | Outlands (pp. 14-23), Sigil (pp. 54-90), portals of Sigil (pp. 54-56) |
| Planes of Law (five plane books, the updated cosmographical tables poster) | Mount Celestia, Arcadia, Mechanus, Acheron, Baator. The poster tables give the layers and realms of every plane |
| Planes of Chaos, The Book of Chaos and the Travelogue | Abyss, Arborea, Limbo, Pandemonium, Ysgard, the Styx and Oceanus (p. 7), Mount Olympus (p. 45), Yggdrasil (p. 104), the Infinite Staircase (pp. 116-117, Travelogue p. 48) |
| Planes of Conflict, Liber Benevolentiae and Liber Malevolentiae | Bytopia, Elysium, the Beastlands, Carceri, Gehenna, the Gray Waste, Oceanus and Yggdrasil (LB p. 6) |
| The Inner Planes | The 18 Inner Planes (primer pp. 6-9, chapters pp. 20-125), the elemental vortices |
| A Guide to the Astral Plane | The Astral (pp. 5-11, 40-43), color pools (pp. 30-33) |
| A Guide to the Ethereal Plane | The Ethereal (pp. 5-6, 20-29), curtain colors (p. 20), demiplanes, the Demiplane of Shadow (pp. 47-49) |
| Manual of the Planes (1987) | The older names of the Outer Planes (p. 73), the Demi-Plane of Shadow (p. 21), the 1e color pool table (p. 62, in notes only) |
| The Planewalker's Handbook | The Great Road (p. 38), the singing creatures of the Oceanus (p. 12) |
| Dungeon Master's Guide (2014) | All 5e entries (pp. 43-68) |

## Notes on the books

- **Bytopia is not in Planes of Law.** That box has books on Mount Celestia, Arcadia, Mechanus, Acheron and Baator only (back cover). Bytopia is in Planes of Conflict, Liber Benevolentiae, pp. 28-45.
- **Planes of Conflict has no Outlands section.**

## What the books did not give

- **2e pool colors.** The pools are not color-coded in 2e (see above).
- **Arcadia's third layer in 5e.** No book here names it in 5e. The 5e list keeps the wheel's "Menausus" (see the disagreements).
- **Named layers for Limbo and Mechanus.**
  - Limbo: the Book of Chaos (p. 74) treats it as one vast layer. The Campaign Setting (p. 60) gives scholars' layer names but doubts them.
  - Mechanus: each cog is a realm (Planes of Law tables).
  - Both keep `layers_count: 1`, and the facts explain this.
- **Positive and Negative in 5e.** The DMG gives one sentence on them (p. 43).
- **5e layer names.** The DMG names layers only for the Nine Hells (all nine) and the Abyss (six examples). For the other planes it gives only counts.
- **Known gaps in the source chapters.** The realm-by-realm entries of the box sets are not read in full yet, so the famous places list names with short or no descriptions. Lesser powers and proxies are not listed.

## OCR problems that blocked facts

- **Campaign Setting DM Guide pp. 54-55 (Bytopia) are blank** (PDF pages 56-57). Bytopia comes from Planes of Conflict only.
- **Planes of Law has three lost or broken pages.**
  - Mount Celestia booklet p. 3 is mostly lost.
  - A Player's Guide to Law p. 29 is blank.
  - In the Mechanus booklet, PDF pages 79-83 are out of order (printed pages 12, 11, ?, 13, 10). The citations use the printed numbers.
- **Liber Malevolentiae p. 7 (Carceri, PDF 75) is blank.**
- **The Inner Planes cuts off the left column of most pages.** So these are not readable:
  - Most "major players" of the para- and quasiplanes (Radiance, Steam, Dust).
  - Some region names (Ash, Salt).
- **Spelling of the Ash prison.** The Inner Planes contents spell its site "Cavitilus". The Campaign Setting (p. 37) has "Citadel Cavitius". The wheel uses the Campaign Setting spelling.
- **Page numbers in A Guide to the Astral Plane.** Its footers drift against the PDF pages. Pages are cited from the footers where they are visible.
- **The 1e color pool table** (Manual of the Planes 1987, p. 62) has an unreadable Abyss entry.

## Disagreements between the books and the wheel, and what the wheel does

1. **Arcadia, third layer.** The wheel now uses "Nemausus" in both editions.
   - The wheel says "Menausus".
   - Planes of Law spells it "Nemausus": Arcadia booklet pp. 4, 12, Mechanus booklet p. 22, updated cosmographical tables.
   - Planes of Law also says the layer slipped into Mechanus and is now a cog there. Arcadia (p. 4) says "there's only layers two right now", but the tables still list "three layers".
   - The 2e layer list now uses "Nemausus", with a summary that it is now in Mechanus. The spelling "Menausus" is in none of these books. Manual of the Planes 1987 (p. 73) gives only the count of 3.
2. **Outlands rings.** The wheel says 10 layers. It draws nine rings, which divide the plane into ten.
   - The wheel's `layers_note` says "Nine rings around the Spire".
   - Sigil and Beyond (p. 20) says the plane "is divided into 10 layers, like the skins of an onion". Magic weakens ring by ring, and no magic works at the center.
   - The two can agree if the center counts as the tenth layer. The wheel's note now says 10 layers.
3. **Yggdrasil.** The wheel adds branches to the Outlands and Arborea. It keeps the Niflheim link as a root, after the Campaign Setting.
   - The wheel has roots to the Gray Waste (Niflheim) and Pandemonium, and branches to Elysium, the Beastlands, Limbo and the Prime.
   - The Book of Chaos (p. 104) calls the Niflheim link a major branch, not a root.
   - The Book of Chaos also adds branches to the Outlands (the home of the Norns) and to Arborea (near the Gnarl in Arvandor). It does not name Elysium, the Beastlands or Limbo.
   - Liber Benevolentiae (p. 6) says the branches reach every layer of Elysium and the Beastlands except Belierin.
   - The Inner Planes (p. 21) says a portal to Air is rumored to lie atop the highest branch.
4. **River Oceanus.**
   - The Book of Chaos (p. 7) calls Thalasia "the third layer of Elysium". The Campaign Setting (p. 57), the Planes of Law tables and Liber Benevolentiae (pp. 6, 52) make it the fourth. The later book agrees with the wheel.
   - The Book of Chaos also says Selune's realm in Ysgard is said to connect to the river, though the link is tentative. The wheel has no link to Ysgard.
5. **River Styx.**
   - The wheel's course through the seven Lower Planes agrees with the Campaign Setting (p. 44), the Book of Chaos (p. 7) and the DMG (p. 58).
   - Liber Malevolentiae (p. 27) says that on Gehenna it flows only through Khalas.
   - The Book of Chaos (p. 7) says it never enters the Astral. Portals on its banks let the boatmen reach the Astral shores.
6. **Mount Olympus.**
   - The Book of Chaos (p. 45) describes it as one conduit from Olympus through the Astral into the Gray Waste. It does not name Gehenna or Carceri.
   - The Campaign Setting (p. 45) and the Planewalker's Handbook (p. 12) give all three, as the wheel does. No change.
7. **Elemental vortices.** The wheel now links vortices to Magma and Ooze too.
   - The wheel reaches only the four Elemental Planes.
   - The Inner Planes describes vortices to Magma (p. 75, "fairly common") and Ooze (p. 81, rare). The old fact "None mapped" (Campaign Setting p. 20) is replaced with this later statement.
8. **5e para-elemental regions.** The wheel now shows the four border regions in 5e, with the DMG's names, in the slots of Ice, Ooze, Magma and Smoke. The DMG names them as border regions:
   - Frostfell, "the Plane of Ice", between Air and Water (p. 57).
   - Swamp of Oblivion, "the Plane of Ooze", between Earth and Water (p. 54).
   - Fountains of Creation, "the Plane of Magma", near Earth (p. 55).
   - Great Conflagration, "sometimes called the Plane of Ash", between Air and Fire (p. 53).
   - In 2e, the Air-Fire slot is Smoke, and Ash is the quasiplane of Fire and Negative Energy. So the DMG's "Plane of Ash" matches the wheel's `smoke` slot, not its `ash` plane.
9. **Minerals.** The wheel says "Plane of Minerals", as the Manual of the Planes 1987 does (p. 22). The Inner Planes and the Campaign Setting say "Mineral", and the wheel has it in `aka`.
10. **Elysium's 1e pool.** The 5e pool colors on the wheel match the DMG table (p. 47). The 1e table (Manual of the Planes 1987, p. 62) agrees except for Elysium: "Opal" in 1e, "Orange" in the DMG.

## Disagreements between the books (and the choice made)

- **Memory loss from the Styx.** On a successful save, the Campaign Setting (p. 44) says the victim forgets the past day. The Book of Chaos (p. 7) says the last five minutes. The wheel follows the later Book of Chaos.
- **Source of the Styx.** The Campaign Setting puts its headwaters in Pandesmos (p. 63) but also says no one knows where it rises (p. 44). The Book of Chaos (p. 7) says it has no origin. The wheel leaves the source out.
- **Color of the Styx.** The Campaign Setting (p. 44) says its water is black. The Planewalker's Handbook (p. 12) says wine- or blood-red.
- **Gate keys.** The DM Guide (p. 22) says a key can be a word, an act or an object. Sigil and Beyond (p. 56) says a key is always a thing carried through. The wheel's summary follows the DM Guide.
- **Horus.** The Campaign Setting (p. 61) puts him on Mechanus. Planes of Law, Mechanus (p. 10), calls that an error and puts him in Arcadia. The wheel follows Planes of Law.
- **Mystra.** Planes of Law, Mechanus (p. 10), puts her with Helm on Mechanus. Liber Benevolentiae (p. 50) calls her a new arrival on Elysium. The wheel lists her on Mechanus only.
- **Cyric.** The Campaign Setting (p. 59) puts him on the Gray Waste. Liber Malevolentiae (p. 47) says he built a castle on Pandemonium and Kelemvor now holds the realm. The wheel follows the later book.
- **Mechanus gears.** The Campaign Setting (p. 61) says only one side of a disk is ever built upon. Planes of Law, Mechanus (p. 4), says both sides are habitable. The wheel follows Planes of Law.
- **Yugoloths.** The Campaign Setting lists them as natives of both Gehenna (p. 58) and the Gray Waste (p. 59). Liber Malevolentiae (p. 29) says they now live on Gehenna but came from the Gray Waste. The DMG (p. 63) calls Gehenna their birthplace.
- **Thanatos.** In 2e it is Kiaransalee's realm, taken from the unnamed former lord of the undead (Book of Chaos p. 29). In 5e it is the realm of Orcus (DMG p. 62). Each edition's layer list says so.
