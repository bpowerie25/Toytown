---
'toytown-gl': minor
---

Skins: two new built-in themes, `sitcom` (flat saturated colours, solid black outlines, hard
two-band shading) and `pastel` (soft colours, gentle shading, faint tinted edges), and
`toy.setTheme(name)` to switch skins live without reloading the map. Themes gain
`outline.inkShade` and `outline.inkMix` for the edge ink, `hullWidth: 0` turns model outlines
off, and `recolourStyle(map, theme)` recolours a live toy-town style in place.
