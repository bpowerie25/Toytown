---
'toytown-gl': minor
---

Skins: four new built-in themes, `sitcom` (flat saturated colours, solid black outlines, hard
two-band shading), `pastel` (soft colours, gentle shading, faint tinted edges), `winter` (snow,
evergreens, warm windows) and `blueprint` (white line work on blue paper), and
`toy.setTheme(name)` to switch skins live without reloading the map. Themes gain
`outline.inkShade` and `outline.inkMix` for the edge ink, `hullWidth: 0` turns model outlines
off, and `recolourStyle(map, theme)` recolours a live toy-town style in place.
