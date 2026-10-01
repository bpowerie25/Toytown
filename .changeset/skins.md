---
'toytown-gl': minor
---

Skins: 18 new built-in themes (`sitcom`, `pastel`, `toybox`, `retro`, `neon`, `vintage`,
`sketch`, `blueprint`, `autumn`, `winter`, `christmas`, `halloween`, `shamrock`, `comic`,
`handdrawn`, `golden`, `voxel`, `chunky`), theme `effects` (halftone, wobble, paper grain, haze, snow, blocks), skin model sets
(`models.kit`: the voxel and chunky sets ship in `@toytown/models` under `models/skins/`), and
`toy.setTheme(name)` to switch skins live without reloading the map. Themes gain
`outline.inkShade` and `outline.inkMix` for the edge ink, `hullWidth: 0` turns model outlines
off, and `recolourStyle(map, theme)` recolours a live toy-town style in place.
