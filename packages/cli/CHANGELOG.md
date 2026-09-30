# @toytown/cli

## 0.1.0

### Minor Changes

- First release: `toytown build-data` fetches OpenStreetMap buildings, streets, POIs, trees and
  open spaces for any bbox (from Overpass, or a PBF extract), classifies them with the kit's tag
  map and landmark packs, works out building fronts, scatters trees in parks, and writes one
  GeoJSON file (or FlatGeobuf) for toytown-gl. `toytown report` turns classification stats into
  a markdown report. Bundles its defaults; installs with no dependencies but `flatgeobuf`.
