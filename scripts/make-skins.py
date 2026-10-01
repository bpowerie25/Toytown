"""Derive the built-in skin themes from default.json.

Each skin is written to packages/core/src/themes/<name>.json. The JSON files are the source of
truth that ships; this script records how they were made, so a skin can be retuned and
regenerated. Run: python3 scripts/make-skins.py [name ...]
"""
import colorsys
import copy
import json
import subprocess
import sys
from pathlib import Path

THEMES = Path(__file__).resolve().parent.parent / 'packages/core/src/themes'
D = json.loads((THEMES / 'default.json').read_text())


def rgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


def hexc(c):
    return '#' + ''.join(f'{max(0, min(255, round(x * 255))):02X}' for x in c)


def hsv(h):
    return colorsys.rgb_to_hsv(*rgb(h))


def from_hsv(H, S, V):
    return hexc(colorsys.hsv_to_rgb(H % 1, max(0, min(1, S)), max(0, min(1, V))))


def lum(h):
    r, g, b = rgb(h)
    return 0.299 * r + 0.587 * g + 0.114 * b


def mix(a, b, t):
    return hexc([x + (y - x) * t for x, y in zip(rgb(a), rgb(b))])


def walk(o, f):
    if isinstance(o, str) and o.startswith('#') and len(o) == 7:
        return f(o)
    if isinstance(o, list):
        return [walk(x, f) for x in o]
    if isinstance(o, dict):
        return {k: walk(v, f) for k, v in o.items()}
    return o


def by_lum(*shades):
    """Map a colour to one of `shades` (dark to light) by its lightness."""
    def f(h):
        i = min(len(shades) - 1, int(lum(h) * len(shades)))
        return shades[i]
    return f


def skin(name, *, style, wall, houses, roofs, flat_roof, windows, frame, door, lighting,
         outline, areas, model_extra=None, model_map=None, window_glow=0, glow=(),
         effects=None, buildings_extra=None, kit=None):
    t = copy.deepcopy(D)
    t['name'] = name
    t['style'] = style
    b = t['buildings']
    b['walls'] = walk(D['buildings']['walls'], wall)
    for k in ('house', 'semi_detached', 'terraced_house', 'bungalow'):
        b['walls'][k] = houses
    b.update({'roofs': roofs, 'flatRoof': flat_roof, 'windows': windows, 'frame': frame,
              'door': door, 'windowGlow': window_glow})
    for k, v in (buildings_extra or {}).items():
        b[k] = {**b[k], **v} if isinstance(v, dict) and isinstance(b.get(k), dict) else v
    t['lighting'] = lighting
    t['outline'] = outline
    t['models']['palette'] = walk(D['models']['palette'], model_map or wall)
    t['models']['palette'].update({'window': windows, 'glass': windows, 'roof_flat': flat_roof,
                                   'roof_red': roofs[0], 'roof_slate': roofs[1 % len(roofs)]})
    t['models']['palette'].update(model_extra or {})
    t['models']['glow'] = list(glow)
    if kit:
        t['models']['kit'] = kit
    fills = areas.pop('fill')
    t['areas'] = {'fill': {k: fills.get(k, fills['default']) for k in D['areas']['fill']}, **areas}
    if effects:
        t['effects'] = effects
    return t


def style(land, water, grass, wood, sand, road, casing, major, major_casing, rail, label, halo,
          building, building_outline):
    return {'land': land, 'water': water, 'grass': grass, 'wood': wood, 'sand': sand,
            'road': road, 'road_casing': casing, 'major_road': major,
            'major_road_casing': major_casing, 'rail': rail, 'label': label, 'label_halo': halo,
            'building': building, 'building_outline': building_outline}


def area_set(default, pitch, court, play, outline, stripe, markings, track, turf, label, halo,
             park=None):
    return {'fill': {'default': default, 'park': park or default, 'garden': park or default,
                     'pitch': pitch, 'pitch_soccer': pitch, 'pitch_gaa': pitch,
                     'pitch_court': court, 'playground': play},
            'outline': outline, 'stripe': stripe, 'markings': markings, 'rail': markings,
            'trackSurface': track, 'turfTrack': turf, 'label': label, 'labelHalo': halo}


SKINS = {}

# Synthwave night: dark purple town, magenta line work, glowing cyan windows.
SKINS['neon'] = lambda: skin(
    'neon',
    style=style('#140A2B', '#0B1E4A', '#1C0F3A', '#1A0D36', '#24123F', '#2A1650', '#FF3EC8',
                '#341A63', '#3EF0FF', '#FF3EC8', '#F5E9FF', '#140A2B', '#24124A', '#FF3EC8'),
    wall=lambda h: from_hsv(0.74 + (hsv(h)[0] - 0.08) * 0.1, 0.55, 0.16 + 0.22 * lum(h)),
    houses=['#2B1658', '#351A66', '#24124A', '#3A1D70'],
    roofs=['#4B1F7A', '#1F2A6B'], flat_roof='#26134D', windows='#3EF0FF', frame='#FF3EC8',
    door='#FF3EC8', window_glow=1, glow=['window', 'glass', 'glass_band'],
    lighting={'ambient': 0.6, 'sun': 0.4, 'sunDirection': [0.4, 0.5, 0.77],
              'toonSteps': [0.2, 0.6, 1.0]},
    outline={'color': '#FF3EC8', 'hullWidth': 0.14, 'edgeWidth': 1.6, 'inkShade': 1.0,
             'inkMix': 1.0, 'fadeStart': 0.8, 'fadeEnd': 1.8},
    model_extra={'leaf': '#3EF0FF', 'trunk': '#5A2A8A', 'white': '#F5E9FF'},
    areas=area_set('#1C0F3A', '#1F1446', '#2A1650', '#2A1650', '#3EF0FF', '#24184F', '#3EF0FF',
                   '#FF3EC8', '#24184F', '#F5E9FF', '#140A2B'),
)

# An old postcard or tourist map: aged paper, sepia walls, brown ink.
SKINS['vintage'] = lambda: skin(
    'vintage',
    style=style('#EADBB8', '#B7C2B0', '#D8D0A4', '#B9B289', '#EEDDB5', '#F3E8CC', '#9C7B55',
                '#E9D3A4', '#8A6640', '#8A6E50', '#4A3423', '#F3E8CC', '#DCC9A3', '#9C7B55'),
    wall=lambda h: mix(from_hsv(0.09, 0.28, 0.55 + 0.4 * lum(h)), '#EADBB8', 0.25),
    houses=['#E3CFA6', '#D9BC92', '#CDB38C', '#E8D7B4', '#C9A981'],
    roofs=['#9A5B3F', '#6E6458'], flat_roof='#CDBB98', windows='#8E9C94', frame='#F0E4C8',
    door='#5E3B26',
    lighting={'ambient': 0.62, 'sun': 0.38, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.15, 0.55, 1.0]},
    outline={'color': '#4A3423', 'hullWidth': 0.12, 'edgeWidth': 1.3, 'inkShade': 0.5,
             'inkMix': 0.75, 'fadeStart': 0.5, 'fadeEnd': 1.2},
    model_extra={'leaf': '#8E9A62', 'trunk': '#6B4A30'},
    areas=area_set('#D3CA9C', '#C4C18E', '#C9A07A', '#E3CD9C', '#9C8A64', '#BDBA88', '#F3E8CC',
                   '#B98A62', '#B5B283', '#4A3423', '#F3E8CC'),
)

# Shiny primary-coloured plastic, like a box of toy bricks.
SKINS['toybox'] = lambda: skin(
    'toybox',
    style=style('#5DB348', '#2F8FE0', '#4FA63C', '#3F9431', '#F2C94C', '#6B6F78', '#3D4048',
                '#7A7F89', '#3D4048', '#3D4048', '#1A1A1A', '#FFFFFF', '#E8E8E8', '#3D4048'),
    wall=lambda h: ['#D7262C', '#F7C41F', '#1F5FBF', '#2E9E48', '#F4F4F0'][int(hsv(h)[0] * 5 + lum(h) * 3) % 5],
    houses=['#D7262C', '#F7C41F', '#1F5FBF', '#2E9E48', '#F4F4F0', '#F28C1E'],
    roofs=['#D7262C', '#1F5FBF', '#2E9E48', '#F7C41F'], flat_roof='#B9BCC2', windows='#A9DDF7',
    frame='#F4F4F0', door='#1A1A1A',
    lighting={'ambient': 0.58, 'sun': 0.42, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.25, 0.7, 1.0]},
    outline={'color': '#1A1A1A', 'hullWidth': 0.2, 'edgeWidth': 1.8, 'inkShade': 0.4,
             'inkMix': 0.85, 'fadeStart': 0.8, 'fadeEnd': 1.8},
    model_extra={'leaf': '#2E9E48', 'trunk': '#8B5A2B', 'white': '#F4F4F0'},
    areas=area_set('#4FA63C', '#3F9431', '#F28C1E', '#F7C41F', '#1A1A1A', '#37892C', '#F4F4F0',
                   '#D7262C', '#37892C', '#1A1A1A', '#FFFFFF'),
)

# Four shades of green, like an old pocket game console.
GB = ('#0F380F', '#306230', '#8BAC0F', '#9BBC0F')
SKINS['retro'] = lambda: skin(
    'retro',
    style=style(GB[3], GB[1], GB[2], GB[1], GB[3], GB[2], GB[0], GB[2], GB[0], GB[0], GB[0],
                GB[3], GB[2], GB[0]),
    wall=by_lum(GB[1], GB[1], GB[2], GB[2]),
    houses=[GB[2], GB[1]], roofs=[GB[0], GB[1]], flat_roof=GB[1], windows=GB[0], frame=GB[3],
    door=GB[0],
    lighting={'ambient': 0.7, 'sun': 0.3, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.0, 1.0]},
    outline={'color': GB[0], 'hullWidth': 0.18, 'edgeWidth': 1.6, 'inkShade': 1.0, 'inkMix': 1.0,
             'fadeStart': 0.8, 'fadeEnd': 1.8},
    model_extra={'leaf': GB[1], 'trunk': GB[0], 'white': GB[3], 'black': GB[0]},
    areas=area_set(GB[2], GB[2], GB[1], GB[2], GB[0], GB[1], GB[3], GB[1], GB[1], GB[0], GB[3]),
)

# Orange and red trees, golden low light, warm brick.
SKINS['autumn'] = lambda: skin(
    'autumn',
    style=style('#F1E4C6', '#7FB3C9', '#C9C77E', '#B5652B', '#F2DDAE', '#FFFFFF', '#D9B98A',
                '#FFE3A8', '#D9A050', '#B0A08A', '#4A2E1E', '#FFF6E6', '#E6D2B0', '#D9B98A'),
    wall=lambda h: from_hsv(0.07 + (hsv(h)[0] - 0.08) * 0.4, min(0.5, hsv(h)[1] * 1.6 + 0.1),
                            hsv(h)[2] * 0.97),
    houses=['#E9C9A0', '#D98C68', '#EDD49A', '#C9A27A', '#E2B59A', '#F2E2C4'],
    roofs=['#A9483A', '#6B5446', '#8C5A32'], flat_roof='#D3C2A4', windows='#9CC3CF',
    frame='#FFF6E6', door='#6B3A24',
    lighting={'ambient': 0.54, 'sun': 0.42, 'sunDirection': [-0.7, -0.35, 0.45],
              'toonSteps': [0.0, 0.3, 0.65, 1.0],
              'hemisphere': {'sky': '#FFE2B0', 'ground': '#E8C79A', 'intensity': 0.16}},
    outline={'color': '#4A2E1E', 'hullWidth': 0.12, 'edgeWidth': 1.1, 'fadeStart': 0.35,
             'fadeEnd': 0.9},
    model_extra={'leaf': '#D9692B', 'trunk': '#6B4226'},
    areas=area_set('#C9C77E', '#9FBF5E', '#C9784E', '#E8C77A', '#A8A262', '#93B455', '#FFFFFF',
                   '#C9784E', '#93B455', '#4A2E1E', '#FFF6E6', park='#C2B86E'),
)

# White buildings, black pen lines, cream paper.
SKINS['sketch'] = lambda: skin(
    'sketch',
    style=style('#F7F3EA', '#DCE6EA', '#EEF0E2', '#E3E8D6', '#F3EEDF', '#FFFFFF', '#2B2B2B',
                '#FFFFFF', '#2B2B2B', '#2B2B2B', '#2B2B2B', '#F7F3EA', '#F1ECE0', '#2B2B2B'),
    wall=lambda h: mix('#FFFFFF', '#E9E4D8', 1 - lum(h)),
    houses=['#FFFFFF', '#FBF8F1', '#F4F0E6'],
    roofs=['#E4DED1', '#D6D0C3'], flat_roof='#F1ECE0', windows='#DCE3E6', frame='#FFFFFF',
    door='#BDB6A8',
    lighting={'ambient': 0.72, 'sun': 0.28, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.2, 0.6, 1.0]},
    outline={'color': '#2B2B2B', 'hullWidth': 0.1, 'edgeWidth': 1.3, 'inkShade': 0.3,
             'inkMix': 1.0, 'fadeStart': 0.8, 'fadeEnd': 1.8},
    model_map=lambda h: mix('#FFFFFF', '#D9D3C6', 1 - lum(h)),
    model_extra={'leaf': '#E8EDDF', 'trunk': '#BDB6A8', 'black': '#2B2B2B'},
    areas=area_set('#EEF0E2', '#E9EDDC', '#EFE6DA', '#F3EEDF', '#2B2B2B', '#E3E8D6', '#2B2B2B',
                   '#E4DED1', '#E3E8D6', '#2B2B2B', '#F7F3EA'),
)

# Snow, red and green houses, warm lights.
SKINS['christmas'] = lambda: skin(
    'christmas',
    style=style('#EEF3F7', '#8DB6D6', '#E4ECF2', '#2F6B4F', '#E9EEF2', '#C9D3DD', '#AEBAC7',
                '#BCC7D3', '#9AA8B8', '#8A94A3', '#7A1E22', '#FFFFFF', '#DCE3EA', '#B9C4D0'),
    wall=lambda h: ['#B8282F', '#2F6B4F', '#F3E9DA', '#E8D7B8'][int(hsv(h)[0] * 7 + lum(h) * 2) % 4],
    houses=['#B8282F', '#2F6B4F', '#F3E9DA', '#C9A35A', '#8E2028'],
    roofs=['#F8FBFD', '#EEF4F9'], flat_roof='#F3F7FA', windows='#FFCF6B', frame='#FFFFFF',
    door='#2F6B4F', window_glow=0.75, glow=['window'],
    lighting={'ambient': 0.58, 'sun': 0.32, 'sunDirection': [-0.6, -0.5, 0.45],
              'toonSteps': [0.0, 0.35, 0.7, 1.0],
              'hemisphere': {'sky': '#DCE8F5', 'ground': '#FFFFFF', 'intensity': 0.16}},
    outline={'color': '#33415A', 'hullWidth': 0.12, 'edgeWidth': 1.1, 'fadeStart': 0.35,
             'fadeEnd': 0.9},
    model_extra={'leaf': '#2F6B4F', 'trunk': '#5A3A2A', 'red': '#B8282F', 'gold': '#E2B33C'},
    areas=area_set('#E8EFF4', '#DDE7EF', '#C9D6E2', '#E9E4DA', '#C3CFDA', '#D3DFE9', '#B8282F',
                   '#B9C6D3', '#D3DFE9', '#7A1E22', '#FFFFFF'),
    effects={'snow': {'density': 0.6}},
)

# Purple dusk, orange windows, bare trees.
SKINS['halloween'] = lambda: skin(
    'halloween',
    style=style('#2A1B3D', '#1C2A4A', '#2F2246', '#241A36', '#3A2A48', '#3D2E55', '#140D20',
                '#4A3566', '#E87722', '#5A4A6E', '#FFD9B0', '#2A1B3D', '#382850', '#140D20'),
    wall=lambda h: from_hsv(0.76, 0.25, 0.22 + 0.25 * lum(h)),
    houses=['#3B2C4F', '#4A3A5C', '#2F2340', '#55405F'],
    roofs=['#E87722', '#3A2A48', '#5A2E1E'], flat_roof='#33264A', windows='#FF9A1F',
    frame='#140D20', door='#E87722', window_glow=1, glow=['window'],
    lighting={'ambient': 0.5, 'sun': 0.36, 'sunDirection': [0.55, -0.4, 0.4],
              'toonSteps': [0.0, 0.35, 0.7, 1.0],
              'hemisphere': {'sky': '#7A4A8A', 'ground': '#2A1B3D', 'intensity': 0.14}},
    outline={'color': '#0B0712', 'hullWidth': 0.14, 'edgeWidth': 1.3, 'inkShade': 0.35,
             'inkMix': 0.6, 'fadeStart': 0.5, 'fadeEnd': 1.2},
    model_extra={'leaf': '#3B2A4A', 'trunk': '#1E1428', 'red': '#E87722'},
    areas=area_set('#2F2246', '#33284D', '#4A3566', '#3A2A48', '#140D20', '#2B2042', '#E87722',
                   '#4A3566', '#2B2042', '#FFD9B0', '#2A1B3D'),
)

# Greens, white and gold.
SKINS['shamrock'] = lambda: skin(
    'shamrock',
    style=style('#EDF5E4', '#7EC3D9', '#BFE3A3', '#3E8E4E', '#F2E7BE', '#FFFFFF', '#B9D3A2',
                '#FFF1B8', '#D9B34C', '#9EB59A', '#1F4A2C', '#FFFFFF', '#DCEBD0', '#B9D3A2'),
    wall=lambda h: ['#3E8E4E', '#F6F3EC', '#9CCF7E', '#E8D79A', '#67AE5E'][int(hsv(h)[0] * 7 + lum(h) * 3) % 5],
    houses=['#3E8E4E', '#F6F3EC', '#9CCF7E', '#E8D79A', '#67AE5E', '#C9E3B0'],
    roofs=['#2E6B3A', '#D9B34C', '#5E6E5A'], flat_roof='#D6E3C8', windows='#A9D8E6',
    frame='#FFFFFF', door='#D9B34C',
    lighting={'ambient': 0.56, 'sun': 0.38, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.0, 0.3, 0.6, 0.85, 1.0],
              'hemisphere': {'sky': '#EEF8E8', 'ground': '#E6F0D6', 'intensity': 0.14}},
    outline={'color': '#1F4A2C', 'hullWidth': 0.12, 'edgeWidth': 1.1, 'fadeStart': 0.35,
             'fadeEnd': 0.9},
    model_extra={'leaf': '#3E8E4E', 'gold': '#D9B34C'},
    areas=area_set('#BFE3A3', '#7DC66F', '#D98F6E', '#F3D99E', '#86B97C', '#71BA64', '#FFFFFF',
                   '#D7865F', '#6DB561', '#1F4A2C', '#FFFFFF', park='#A9DA8C'),
)

# Comic book: bold flat colours, black ink, halftone dots in the shadows.
SKINS['comic'] = lambda: skin(
    'comic',
    style=style('#FFF4D6', '#5BC0EB', '#9BDE7E', '#5DBB63', '#FFE08A', '#FFFFFF', '#141414',
                '#FFE45C', '#141414', '#141414', '#141414', '#FFFFFF', '#F2E2C4', '#141414'),
    wall=lambda h: ['#E63946', '#FFD23F', '#3A86FF', '#F4F1DE', '#06D6A0'][int(hsv(h)[0] * 5 + lum(h) * 3) % 5],
    houses=['#E63946', '#FFD23F', '#3A86FF', '#F4F1DE', '#06D6A0', '#FF8C42'],
    roofs=['#E63946', '#3A86FF', '#141414'], flat_roof='#E9E1CF', windows='#9FE2FF',
    frame='#FFFFFF', door='#141414',
    lighting={'ambient': 0.62, 'sun': 0.38, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.35, 1.0]},
    outline={'color': '#141414', 'hullWidth': 0.3, 'edgeWidth': 2.2, 'inkShade': 0.0,
             'inkMix': 1.0, 'fadeStart': 0.8, 'fadeEnd': 1.8},
    model_extra={'leaf': '#5DBB63', 'trunk': '#8B5A2B', 'white': '#FFFFFF'},
    areas=area_set('#9BDE7E', '#5DBB63', '#FF8C42', '#FFD23F', '#141414', '#4FAE55', '#FFFFFF',
                   '#E63946', '#4FAE55', '#141414', '#FFFFFF'),
    effects={'halftone': {'size': 7, 'strength': 1.0}},
)

# A storybook drawing: watercolour washes on paper, wobbly brown ink.
SKINS['handdrawn'] = lambda: skin(
    'handdrawn',
    style=style('#F5EEDC', '#A9CBD6', '#CFE0B4', '#A9C48E', '#F1E3C0', '#FBF7EC', '#6B5440',
                '#F7E7C2', '#6B5440', '#6B5440', '#4A3828', '#F5EEDC', '#E9DDC2', '#6B5440'),
    wall=lambda h: mix(from_hsv(hsv(h)[0], min(0.32, hsv(h)[1] * 1.3 + 0.06), 0.94), '#F5EEDC', 0.2),
    houses=['#EBC9B5', '#E8DAA8', '#C9DBC0', '#C8D6E6', '#F1E6D2', '#E2C2C8'],
    roofs=['#C27B62', '#7E8BA3', '#9A7A62'], flat_roof='#E3D6BC', windows='#B9D3DA',
    frame='#FBF7EC', door='#7A5238',
    lighting={'ambient': 0.66, 'sun': 0.34, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.2, 0.6, 1.0]},
    outline={'color': '#4A3828', 'hullWidth': 0.1, 'edgeWidth': 1.6, 'inkShade': 0.45,
             'inkMix': 0.8, 'fadeStart': 0.6, 'fadeEnd': 1.4},
    model_extra={'leaf': '#9CBF7E', 'trunk': '#7A5A40'},
    areas=area_set('#CFE0B4', '#BCD6A0', '#E0B49A', '#EEDDB0', '#8F7A5E', '#B3CF96', '#FBF7EC',
                   '#D9A383', '#B3CF96', '#4A3828', '#F5EEDC'),
    effects={'wobble': 1.0, 'paper': 0.55},
)

# Golden hour: low warm sun, long shadows, haze towards the horizon.
SKINS['golden'] = lambda: skin(
    'golden',
    style=style('#F4DDB4', '#E2A97E', '#D9C98A', '#B49A5E', '#F6D6A0', '#FFF1D6', '#D9A86E',
                '#FFD98C', '#C98A44', '#B08A6E', '#5A3418', '#FFF1D6', '#EBCB9A', '#D9A86E'),
    wall=lambda h: mix(from_hsv(0.08 + (hsv(h)[0] - 0.08) * 0.3, min(0.45, hsv(h)[1] * 1.4 + 0.12),
                                hsv(h)[2]), '#FFC98A', 0.18),
    houses=['#F2C79A', '#EFAE8E', '#F4D58E', '#D9B8A8', '#F6E2BE', '#E8A87C'],
    roofs=['#B24A36', '#6E4E5A'], flat_roof='#E5C79C', windows='#FFE2A0', frame='#FFF1D6',
    door='#6B3A24', window_glow=0.3, glow=['window'],
    lighting={'ambient': 0.46, 'sun': 0.54, 'sunDirection': [-0.85, -0.25, 0.3],
              'toonSteps': [0.0, 0.4, 0.75, 1.0],
              'hemisphere': {'sky': '#FFC98A', 'ground': '#8A5A6E', 'intensity': 0.18}},
    outline={'color': '#4A2A20', 'hullWidth': 0.12, 'edgeWidth': 1.1, 'fadeStart': 0.35,
             'fadeEnd': 0.9},
    model_extra={'leaf': '#9AA650', 'trunk': '#6B4226'},
    areas=area_set('#D9C98A', '#C4C276', '#D98F6E', '#F3D08E', '#B8A066', '#B5B56A', '#FFF1D6',
                   '#D7865F', '#B5B56A', '#5A3418', '#FFF1D6'),
    effects={'haze': {'color': '#FFC98A', 'amount': 0.6}},
)

# Voxel: everything built from blocks. Models come from the voxel model set; procedural buildings
# get flat tops and a block grid.
SKINS['voxel'] = lambda: skin(
    'voxel',
    style=style('#86C25A', '#3F76E4', '#79B84E', '#4E8A2E', '#E2D49A', '#A8A59C', '#6E6C66',
                '#B9B5AA', '#6E6C66', '#6E6C66', '#FFFFFF', '#2B2B2B', '#B08A5A', '#5E4630'),
    wall=lambda h: ['#B08A5A', '#9E9E9E', '#C9B27C', '#D8D2C4', '#A0603C'][int(hsv(h)[0] * 5 + lum(h) * 4) % 5],
    houses=['#B08A5A', '#C9A36A', '#9E9E9E', '#D8D2C4', '#A0603C'],
    roofs=['#7A5634', '#5E5E5E'], flat_roof='#8A8A8A', windows='#A8D8F0', frame='#7A5634',
    door='#6B4A2E',
    lighting={'ambient': 0.6, 'sun': 0.4, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.3, 0.65, 1.0]},
    outline={'color': '#2B2B2B', 'hullWidth': 0.08, 'edgeWidth': 1.2, 'inkShade': 0.4,
             'inkMix': 0.6, 'fadeStart': 0.5, 'fadeEnd': 1.2},
    model_map=lambda h: h,
    model_extra={'leaf': '#4E9A2E', 'trunk': '#6B4A2E'},
    areas=area_set('#79B84E', '#5FA83E', '#A0603C', '#E2D49A', '#4E8A2E', '#58A038', '#FFFFFF',
                   '#A8A59C', '#58A038', '#FFFFFF', '#2B2B2B'),
    buildings_extra={'pitchedRoofs': {'categories': []},
                     'flat': {'bevel': 0, 'parapetHeight': 0.5, 'parapetWidth': 0.5}},
    effects={'blocks': 1.0},
    kit='skins/voxel',
)

# Chunky cartoon: squat bulging walls and tall steep roofs, from the chunky model set; procedural
# buildings get steep, tall roofs with deep eaves.
SKINS['chunky'] = lambda: skin(
    'chunky',
    style=style('#F6E7C1', '#6EC6EA', '#A6DB8C', '#5DB35A', '#F8DFA0', '#FFFFFF', '#3A3046',
                '#FFE08A', '#3A3046', '#8F8597', '#3A3046', '#FFFFFF', '#EBD9B4', '#3A3046'),
    wall=lambda h: from_hsv(hsv(h)[0], min(0.55, hsv(h)[1] * 1.6 + 0.08), min(1, hsv(h)[2] * 1.02)),
    houses=['#F6D8A8', '#F4B7A0', '#FBE59A', '#B9DAF2', '#C6E8C0', '#FFF4E0'],
    roofs=['#D9573E', '#5A6BB0', '#3E9A6A'], flat_roof='#D9CDB8', windows='#9DD7F0',
    frame='#FFFFFF', door='#8A4B2E',
    lighting={'ambient': 0.58, 'sun': 0.42, 'sunDirection': [-0.45, -0.6, 0.66],
              'toonSteps': [0.15, 0.6, 1.0]},
    outline={'color': '#3A3046', 'hullWidth': 0.22, 'edgeWidth': 1.9, 'inkShade': 0.25,
             'inkMix': 0.9, 'fadeStart': 0.7, 'fadeEnd': 1.6},
    model_map=lambda h: from_hsv(hsv(h)[0], min(0.6, hsv(h)[1] * 1.4 + 0.05), min(1, hsv(h)[2] * 1.03)),
    model_extra={'leaf': '#5DB35A'},
    areas=area_set('#A6DB8C', '#7CC96A', '#E0896A', '#FBE59A', '#3A3046', '#6EBE5E', '#FFFFFF',
                   '#E0896A', '#6EBE5E', '#3A3046', '#FFFFFF'),
    buildings_extra={'pitchedRoofs': {
        'categories': ['house', 'bungalow', 'semi_detached', 'terraced_house', 'apartment', 'pub',
                       'church', 'school', 'shop', 'cafe', 'pharmacy', 'bank', 'hotel', 'library',
                       'town_hall', 'police_station', 'fire_station', 'train_station', 'generic'],
        'minRectangularity': 0.75, 'pitchDeg': 55, 'maxRoofHeightRatio': 0.7,
        'maxRoofHeight': 11, 'overhang': 0.8}},
    kit='skins/chunky',
)

if __name__ == '__main__':
    written = []
    for name in sys.argv[1:] or SKINS:
        path = THEMES / f'{name}.json'
        path.write_text(json.dumps(SKINS[name](), indent=2) + '\n')
        written.append(str(path))
        print('wrote', name)
    subprocess.run(['npx', 'prettier', '--write', *written], check=True, capture_output=True)
