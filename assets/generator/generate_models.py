"""
Procedural low-poly "toy town" building models.
Units: metres. Output GLB is Y-up, building front faces +Z, origin at base centre.
One mesh per material; materials are named (wall, roof, window...) so a renderer
can swap them for toon materials by name.
"""
import os, json
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual import TextureVisuals

OUT = os.environ.get("TOYTOWN_MODELS_OUT", os.path.join(os.path.dirname(__file__), "..", "models"))
os.makedirs(OUT, exist_ok=True)
KEEP = {"LICENSES.md", "README.md"}  # hand-written files in OUT that must survive regeneration

PALETTE = {
    "wall_cream": "#F4E9D8", "wall_pink": "#F2B5A7", "wall_mint": "#BFE3C9",
    "wall_yellow": "#F6D57A", "wall_blue": "#A9CBE8", "stone": "#CFC6B8",
    "brick": "#E07A5F", "white": "#FFFFFF", "offwhite": "#F7F7F2",
    "roof_red": "#D9644A", "roof_slate": "#5B6C8F", "roof_flat": "#B8B2A7",
    "window": "#7EC8E3", "glass": "#9AD1D4", "glass_band": "#4A7C8C",
    "door": "#8B5A3C", "red": "#E63946", "garda_blue": "#1D4E89",
    "fire_red": "#D62828", "pub_green": "#2A6F4E", "gold": "#E9C46A",
    "awning": "#F2A541", "leaf": "#6BAA5E", "trunk": "#8B5A3C",
    "skin": "#F2C9A0", "metal": "#8D99AE", "black": "#2B2D42",
    "concrete": "#D8D4CC", "barn_red": "#B23A48", "green_cross": "#2BA84A",
}

def rgba(hexc):
    h = hexc.lstrip("#")
    return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)] + [1.0]

class Model:
    def __init__(self, name, pack="generic"):
        self.name, self.parts, self.pack = name, {}, pack
    def add(self, mesh, color):
        self.parts.setdefault(color, []).append(mesh)
    def box(self, w, d, h, x=0, y=0, z=0, color="wall_cream"):
        m = trimesh.creation.box(extents=[w, d, h]); m.apply_translation([x, y, z + h / 2]); self.add(m, color)
    def cyl(self, r, h, x=0, y=0, z=0, color="stone", sections=16):
        m = trimesh.creation.cylinder(radius=r, height=h, sections=sections); m.apply_translation([x, y, z + h / 2]); self.add(m, color)
    def cone(self, r, h, x=0, y=0, z=0, color="roof_slate", sections=16, rot=0.0):
        m = trimesh.creation.cone(radius=r, height=h, sections=sections)
        if rot: m.apply_transform(trimesh.transformations.rotation_matrix(rot, [0, 0, 1]))
        m.apply_translation([x, y, z]); self.add(m, color)
    def sphere(self, r, x=0, y=0, z=0, color="leaf"):
        m = trimesh.creation.icosphere(subdivisions=1, radius=r); m.apply_translation([x, y, z]); self.add(m, color)
    def gable(self, w, d, h, x=0, y=0, z=0, color="roof_red", along="x"):
        if along == "y": w, d = d, w  # build ridge along x, then rotate onto y
        v = np.array([[-w/2, -d/2, 0], [w/2, -d/2, 0], [w/2, d/2, 0], [-w/2, d/2, 0], [-w/2, 0, h], [w/2, 0, h]], float)
        f = [[0, 2, 1], [0, 3, 2], [0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [0, 4, 3], [1, 2, 5]]
        m = trimesh.Trimesh(v, f, process=True); m.fix_normals()
        if along == "y": m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 0, 1]))
        m.apply_translation([x, y, z]); self.add(m, color)
    def hip(self, w, d, h, x=0, y=0, z=0, color="roof_slate"):
        # pyramid-ish hip roof: 4-sided cone scaled to footprint
        m = trimesh.creation.cone(radius=np.sqrt(2) / 2, height=h, sections=4)
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 4, [0, 0, 1]))
        m.apply_scale([w, d, 1]); m.apply_translation([x, y, z]); self.add(m, color)
    def windows(self, w, d, floors, fh, z0=0, per_floor=None, color="window", skip_ground=False, sides=True):
        n = per_floor or max(2, int(w // 3))
        for fl in range(floors):
            if skip_ground and fl == 0: continue
            z = z0 + fl * fh + fh * 0.35
            for i in range(n):
                x = -w/2 + (i + 0.5) * w / n
                for y in (-d/2 - 0.05, d/2 + 0.05):
                    self.box(w / n * 0.5, 0.2, fh * 0.4, x, y, z, color)
            if sides:
                m = max(1, int(d // 3.5))
                for j in range(m):
                    y = -d/2 + (j + 0.5) * d / m
                    for x in (-w/2 - 0.05, w/2 + 0.05):
                        self.box(0.2, d / m * 0.45, fh * 0.4, x, y, z, color)
    def export(self):
        scene = trimesh.Scene()
        to_yup = trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0])
        for color, meshes in self.parts.items():
            m = trimesh.util.concatenate(meshes); m.apply_transform(to_yup)
            m.visual = TextureVisuals(material=PBRMaterial(name=color, baseColorFactor=rgba(PALETTE[color]),
                                                            metallicFactor=0.0, roughnessFactor=1.0))
            scene.add_geometry(m, node_name=f"{self.name}_{color}", geom_name=f"{self.name}_{color}")
        d = os.path.join(OUT, self.pack); os.makedirs(d, exist_ok=True)
        path = os.path.join(d, f"{self.name}.glb"); scene.export(path)
        return path

# Front of each building is the -Y face here (becomes +Z after Y-up conversion).
def house():
    m = Model("house")
    m.box(8, 7, 5, color="wall_cream"); m.gable(8.6, 7.8, 3.2, z=5, color="roof_red")
    m.box(1.2, 0.2, 2.2, 0, -3.55, 0, "door"); m.windows(8, 7, 2, 2.5, per_floor=2)
    m.box(0.8, 0.8, 2.2, 2.5, 1.5, 6.5, "brick"); return m

def terrace():
    m = Model("terraced_house")
    for i, c in enumerate(["wall_pink", "wall_yellow", "wall_blue"]):
        x = (i - 1) * 5.5
        m.box(5.5, 8, 6, x, color=c); m.box(1, 0.2, 2.2, x - 1.4, -4.05, 0, "door")
        for fl in range(2):
            m.box(1.4, 0.2, 1.2, x + 1.2, -4.05, fl * 3 + 1.0, "window")
    m.gable(16.8, 8.8, 3, z=6, color="roof_slate"); return m

def apartment():
    m = Model("apartment")
    m.box(14, 10, 13, color="wall_cream"); m.windows(14, 10, 4, 3.2, z0=0.2, per_floor=4)
    m.box(14.4, 10.4, 0.8, z=13, color="roof_flat")
    for fl in range(1, 4):
        for x in (-4, 0, 4): m.box(2.4, 1.2, 0.3, x, -5.6, fl * 3.2, "white")
    m.box(2, 0.2, 2.5, 0, -5.05, 0, "door"); return m

def office():
    m = Model("office")
    m.box(14, 12, 22, color="glass")
    for fl in range(1, 7): m.box(14.2, 12.2, 0.5, z=fl * 3.2, color="glass_band")
    m.box(14.6, 12.6, 0.8, z=22, color="glass_band"); m.box(5, 4, 2, 2, 1, 22.8, "metal")
    m.box(4, 0.3, 3, 0, -6.1, 0, "black"); return m

def shop():
    m = Model("shop")
    m.box(8, 8, 7, color="wall_mint"); m.box(6.5, 0.2, 2.6, 0, -4.05, 0.2, "glass")
    m.box(8.2, 0.3, 0.9, 0, -4.1, 3.0, "black")
    for i in range(6):
        m.box(8.2 / 6, 1.6, 0.15, -4.1 + (i + 0.5) * 8.2 / 6, -4.8, 2.9, "awning" if i % 2 == 0 else "white")
    m.windows(8, 8, 2, 3.5, per_floor=2, skip_ground=True, sides=False)
    m.box(8.4, 8.4, 0.5, z=7, color="roof_flat"); return m

def pub():
    m = Model("pub")
    m.box(9, 9, 7, color="wall_cream"); m.box(9.2, 0.3, 3.2, 0, -4.6, 0, "pub_green")
    m.box(8, 0.35, 0.8, 0, -4.7, 2.5, "gold"); m.box(1.2, 0.2, 2.2, 0, -4.85, 0, "door")
    m.box(2, 0.25, 1.4, -3, -4.85, 0.7, "window"); m.box(2, 0.25, 1.4, 3, -4.85, 0.7, "window")
    m.box(0.1, 1.4, 0.1, 4, -5.3, 5, "black"); m.box(0.1, 1.0, 1.0, 4, -5.8, 3.9, "gold")
    m.windows(9, 9, 2, 3.5, per_floor=3, skip_ground=True, sides=False)
    m.gable(9.6, 9.8, 3, z=7, color="roof_slate"); return m

def hospital():
    m = Model("hospital")
    m.box(30, 16, 15, color="white"); m.windows(30, 16, 4, 3.6, z0=0.3, per_floor=8)
    m.box(12, 12, 8, 0, -13, 0, "white"); m.box(12.4, 12.4, 0.6, 0, -13, 8, "roof_flat")
    m.box(30.4, 16.4, 0.8, z=15, color="roof_flat")
    m.box(6, 3, 0.4, 0, -19.5, 4, "red")  # entrance canopy
    m.box(1.2, 0.3, 4, 0, -19.2, 8.2, "red"); m.box(4, 0.3, 1.2, 0, -19.2, 9.6, "red")  # red cross
    m.cyl(5, 0.3, 6, 2, 15.8, "roof_slate", 24); m.box(0.6, 3, 0.1, 5, 2, 16.1, "white")
    m.box(0.6, 3, 0.1, 7, 2, 16.1, "white"); m.box(2, 0.6, 0.1, 6, 2, 16.1, "white")  # helipad H
    return m

def school():
    m = Model("school")
    m.box(26, 10, 7, color="brick"); m.box(10, 14, 7, 8, 12, 0, "brick")
    m.windows(26, 10, 2, 3.4, per_floor=7)
    m.hip(26.6, 10.6, 3, z=7, color="roof_slate"); m.hip(10.6, 14.6, 3, 8, 12, 7, "roof_slate")
    m.box(5, 2.5, 0.4, 0, -6.2, 3, "white"); m.box(2.4, 0.2, 2.8, 0, -5.05, 0, "door")
    m.cyl(0.12, 10, -15, -6, 0, "metal", 8); m.box(0.1, 2.2, 1.4, -15, -7.2, 8.5, "garda_blue")
    return m

def church():
    m = Model("church")
    m.box(10, 22, 9, 0, 3, 0, "stone"); m.gable(10.8, 22.8, 5, 0, 3, 9, "roof_slate", along="y")
    m.box(6, 6, 18, 0, -10, 0, "stone"); m.cone(4.3, 12, 0, -10, 18, "roof_slate", 8)
    m.box(1.8, 0.2, 3.2, 0, -13.05, 0, "door")
    for y in range(-4, 12, 4):
        for x in (-5.05, 5.05): m.box(0.2, 1.2, 3.5, x, y, 3.5, "window")
    m.box(0.25, 0.25, 2.5, 0, -10, 30, "gold"); m.box(0.25, 1.4, 0.25, 0, -10, 31.4, "gold")
    return m

def police_station():
    m = Model("police_station")
    m.box(14, 10, 7, color="offwhite"); m.windows(14, 10, 2, 3.4, per_floor=4)
    m.hip(14.6, 10.6, 3, z=7, color="roof_slate")
    m.box(2, 0.2, 2.6, 0, -5.05, 0, "garda_blue"); m.box(4, 0.35, 0.8, 0, -5.15, 2.9, "garda_blue")
    m.box(0.6, 0.6, 0.8, 0, -5.4, 3.9, "window")  # blue lamp
    return m

def fire_station():
    m = Model("fire_station")
    m.box(18, 12, 8, color="brick")
    for x in (-4.5, 4.5): m.box(6, 0.2, 5, x, -6.05, 0, "fire_red")
    m.box(18.4, 12.4, 0.6, z=8, color="roof_flat"); m.box(4, 4, 14, 7, 4, 0, "brick")
    m.box(4.4, 4.4, 0.6, 7, 4, 14, "roof_flat"); m.box(18.2, 0.3, 0.8, 0, -6.1, 6, "white"); return m

def hotel():
    m = Model("hotel")
    m.box(22, 12, 15, color="wall_cream"); m.windows(22, 12, 4, 3.5, z0=0.4, per_floor=7)
    m.box(22.6, 12.6, 0.8, z=15, color="roof_flat"); m.box(8, 3, 0.4, 0, -7.5, 3.4, "pub_green")
    m.box(3, 0.2, 3, 0, -6.05, 0, "glass")
    for x in (-9, 9): m.cyl(0.08, 5, x, -6.3, 10, "metal", 6); m.box(0.05, 1.6, 1.0, x, -7.1, 14, "red")
    return m

def warehouse():
    m = Model("warehouse")
    m.box(20, 30, 8, color="wall_blue"); m.gable(20.6, 30.6, 2.5, z=8, color="metal", along="y")
    m.box(6, 0.2, 5.5, -4, -15.05, 0, "metal"); m.box(1.2, 0.2, 2.2, 5, -15.05, 0, "door"); return m

def round_tower():  # generic castle / round tower
    m = Model("round_tower")
    m.cyl(6.5, 16, color="stone", sections=20); m.cyl(6.9, 0.6, z=16, color="stone", sections=20)
    for i in range(10):
        a = i * 2 * np.pi / 10
        m.box(1.4, 1.4, 1.2, 6.4 * np.cos(a), 6.4 * np.sin(a), 16.6, "stone")
    m.cone(5.5, 5, z=16.6, color="roof_slate", sections=20)
    m.box(1.4, 0.4, 2.6, 0, -6.5, 0, "door")
    for z in (5, 10): m.box(0.9, 0.4, 1.6, 0, -6.55, z, "black")
    return m

def metal_man():  # stylised Metal Man pillars, Tramore
    m = Model("landmark_metal_man", pack="ireland")
    for x in (-7, 0, 7): m.cyl(1.8, 18, x, color="offwhite", sections=12)
    z = 18
    m.box(0.6, 0.6, 1.8, -0.4, 0, z, "white"); m.box(0.6, 0.6, 1.8, 0.4, 0, z, "white")  # legs
    m.box(1.6, 0.9, 1.8, 0, 0, z + 1.8, "garda_blue")  # jacket
    m.box(0.4, 0.4, 1.6, 1.0, -0.6, z + 2.4, "garda_blue")  # pointing arm
    m.sphere(0.55, 0, 0, z + 4.1, "skin"); return m

def tree():
    m = Model("tree")
    m.cyl(0.35, 2.5, color="trunk", sections=6); m.sphere(2.2, z=4.2, color="leaf"); m.sphere(1.5, 1.2, 0.6, 3.6, "leaf")
    return m


def bungalow():
    m = Model("bungalow")
    m.box(13, 8, 3.2, color="offwhite"); m.hip(13.6, 8.6, 2.6, z=3.2, color="roof_slate")
    m.windows(13, 8, 1, 3.2, per_floor=3); m.box(1.2, 0.2, 2.2, 0, -4.05, 0, "door"); return m

def semi_detached():
    m = Model("semi_detached")
    m.box(14, 8, 5.6, color="wall_cream"); m.gable(14.6, 8.8, 3, z=5.6, color="roof_red")
    for x in (-5.5, 5.5): m.box(1.1, 0.2, 2.2, x, -4.05, 0, "door")
    m.windows(14, 8, 2, 2.8, per_floor=4, sides=False)
    for x in (-2, 2): m.box(0.8, 0.8, 2, x, 0, 7.5, "brick")
    return m

def tower_block():
    m = Model("tower_block")
    m.box(16, 16, 40, color="concrete"); m.windows(16, 16, 12, 3.2, z0=0.4, per_floor=5)
    m.box(16.6, 16.6, 0.8, z=40, color="roof_flat"); m.box(4, 4, 3, 3, 3, 40.8, "metal"); return m

def supermarket():
    m = Model("supermarket")
    m.box(40, 30, 7, color="wall_cream"); m.box(40.4, 30.4, 0.6, z=7, color="metal")
    m.box(18, 0.2, 3.2, 0, -15.05, 0, "glass"); m.box(40.2, 0.3, 1.4, 0, -15.1, 5, "red")
    m.box(8, 3, 0.4, 0, -16.5, 3.4, "white"); return m

def petrol_station():
    m = Model("petrol_station")
    m.box(10, 8, 4, 0, 6, 0, "offwhite"); m.box(8, 0.2, 2.4, 0, 1.95, 0, "glass")
    m.box(10.4, 8.4, 0.5, 0, 6, 4, "red")
    for x in (-5, 5):
        for y in (-9, -3): m.cyl(0.3, 5, x, y, 0, "metal", 8)
    m.box(14, 9, 0.8, 0, -6, 5, "white"); m.box(14.2, 9.2, 0.4, 0, -6, 5.3, "red")
    for x in (-2.5, 2.5): m.box(0.8, 1.2, 1.8, x, -6, 0, "garda_blue")
    m.cyl(0.25, 7, 7, 3, 0, "metal", 8); m.box(0.4, 2.4, 2.4, 7, 3, 7, "red"); return m

def cafe():
    m = Model("cafe")
    m.box(7, 7, 4, color="wall_pink"); m.box(5, 0.2, 2.4, 0, -3.55, 0.3, "glass")
    for i in range(5):
        m.box(7.2 / 5, 1.4, 0.15, -3.6 + (i + 0.5) * 7.2 / 5, -4.2, 2.9, "red" if i % 2 == 0 else "white")
    m.box(7.4, 7.4, 0.4, z=4, color="roof_flat")
    for x in (-2, 2): m.cyl(0.6, 0.1, x, -6, 0.8, "white", 10); m.cyl(0.06, 0.8, x, -6, 0, "black", 6)
    return m

def bank():
    m = Model("bank")
    m.box(14, 12, 9, color="stone"); m.box(14.6, 3, 0.6, 0, -7.2, 0, "stone")
    for x in (-5, -1.7, 1.7, 5): m.cyl(0.55, 7.6, x, -7.4, 0.6, "offwhite", 12)
    m.box(14.4, 3.2, 0.8, 0, -7.4, 8.2, "offwhite"); m.gable(3.2, 14.4, 2, 0, -7.4, 9, "stone", along="y")
    m.gable(14.4, 12.6, 2.4, z=9, color="roof_slate"); m.box(2, 0.2, 3.2, 0, -6.05, 0.6, "door")
    m.box(0.6, 0.6, 2.5, 0, 0, 11.2, "gold"); return m

def pharmacy():
    m = Model("pharmacy")
    m.box(8, 8, 7, color="offwhite"); m.box(6.5, 0.2, 2.6, 0, -4.05, 0.2, "glass")
    m.box(8.2, 0.3, 0.9, 0, -4.1, 3.0, "green_cross")
    m.box(0.1, 1.2, 0.1, 3.6, -4.6, 4.8, "black")
    m.box(0.3, 0.5, 1.5, 3.6, -5.2, 3.6, "green_cross"); m.box(0.3, 1.5, 0.5, 3.6, -5.2, 4.1, "green_cross")
    m.windows(8, 8, 2, 3.5, per_floor=2, skip_ground=True, sides=False)
    m.box(8.4, 8.4, 0.5, z=7, color="roof_flat"); return m

def library():
    m = Model("library")
    m.box(20, 12, 8, color="brick"); m.gable(20.6, 12.8, 4, z=8, color="roof_slate")
    for x in range(-8, 9, 4): m.box(2, 0.2, 4.5, x, -6.05, 1.5, "window")
    m.box(6, 3, 0.4, 0, -7.5, 4.5, "stone")
    for x in (-2.6, 2.6): m.cyl(0.35, 4.5, x, -8.6, 0, "stone", 10)
    m.box(2, 0.2, 3, 0, -6.1, 0, "door"); return m

def town_hall():
    m = Model("town_hall")
    m.box(22, 14, 10, color="stone"); m.hip(22.6, 14.6, 3, z=10, color="roof_slate")
    m.windows(22, 14, 2, 4.5, z0=0.5, per_floor=6)
    m.box(5, 5, 7, 0, 0, 11, "stone"); m.cyl(1.6, 0.2, 0, -2.6, 14.5, "white", 16)
    m.hip(5.6, 5.6, 4, 0, 0, 18, "pub_green"); m.box(2.4, 0.2, 3.4, 0, -7.05, 0, "door"); return m

def train_station():
    m = Model("train_station")
    m.box(28, 8, 5, color="brick"); m.gable(28.6, 8.8, 2.5, z=5, color="roof_slate")
    m.windows(28, 8, 1, 5, per_floor=8, sides=False); m.box(2, 0.2, 3, 0, -4.05, 0, "door")
    m.box(28, 5, 0.3, 0, 7, 4, "roof_flat")
    for x in range(-12, 13, 6): m.cyl(0.2, 4, x, 8.8, 0, "pub_green", 8)
    m.box(30, 6, 0.6, 0, 7, 0, "concrete"); return m

def factory():
    m = Model("factory")
    m.box(30, 20, 8, color="wall_blue")
    for i in range(5): m.gable(20.4, 6, 2.5, -12 + i * 6, 0, 8, "metal", along="y")
    m.cyl(1.2, 18, 12, 6, 0, "brick", 12); m.cyl(1.4, 1, 12, 6, 18, "black", 12)
    m.box(7, 0.2, 5.5, -6, -10.05, 0, "metal"); return m

def barn():
    m = Model("barn")
    m.box(14, 10, 5, color="barn_red"); m.gable(10.8, 15, 3.5, z=5, color="metal", along="y")
    m.box(4, 0.2, 4, 0, -7.05, 0, "white"); m.box(0.2, 0.2, 5.6, 0, -7.1, 0, "barn_red")
    m.cyl(2, 9, 9, 3, 0, "metal", 14); m.cone(2.2, 1.6, 9, 3, 9, "metal", 14)
    return m

def parking_garage():
    m = Model("parking_garage")
    for lv in range(4):
        m.box(30, 20, 0.5, z=lv * 3, color="concrete")
        for x in (-14, 0, 14):
            for y in (-9, 9): m.box(0.6, 0.6, 2.5, x, y, lv * 3 + 0.5, "concrete")
        m.box(30.2, 0.3, 1, 0, -10, lv * 3 + 0.5, "concrete")
    m.box(30, 20, 0.5, z=12, color="concrete"); m.box(3, 3, 14, 13, 8, 0, "garda_blue"); return m

def lighthouse():
    m = Model("lighthouse")
    for i, c in enumerate(["offwhite", "red", "offwhite", "red", "offwhite"]):
        m.cyl(3 - i * 0.35, 4, 0, 0, i * 4, c, 16)
    m.cyl(2.2, 0.4, 0, 0, 20, "black", 16); m.cyl(1.4, 2.4, 0, 0, 20.4, "gold", 12)
    m.cone(1.8, 1.8, 0, 0, 22.8, "red", 12); m.box(1, 0.3, 2, 0, -3.1, 0, "door"); return m

BUILDERS = [
    # (builder, suggested OSM tag matches)
    (house, ["building=house", "building=detached"]),
    (bungalow, ["building=bungalow", "building=house + building:levels=1"]),
    (semi_detached, ["building=semidetached_house"]),
    (terrace, ["building=terrace"]),
    (apartment, ["building=apartments", "building=residential"]),
    (tower_block, ["building=apartments + building:levels>=8"]),
    (shop, ["shop=*", "building=retail"]),
    (supermarket, ["shop=supermarket", "building=supermarket"]),
    (cafe, ["amenity=cafe", "amenity=restaurant", "amenity=fast_food"]),
    (pub, ["amenity=pub", "amenity=bar"]),
    (pharmacy, ["amenity=pharmacy", "shop=chemist"]),
    (bank, ["amenity=bank"]),
    (office, ["building=office", "office=*", "building=commercial"]),
    (hotel, ["tourism=hotel", "building=hotel"]),
    (petrol_station, ["amenity=fuel"]),
    (hospital, ["amenity=hospital", "building=hospital"]),
    (school, ["amenity=school", "amenity=college", "building=school"]),
    (library, ["amenity=library"]),
    (town_hall, ["amenity=townhall", "building=civic"]),
    (police_station, ["amenity=police"]),
    (fire_station, ["amenity=fire_station"]),
    (church, ["amenity=place_of_worship", "building=church", "building=cathedral"]),
    (train_station, ["building=train_station", "railway=station"]),
    (warehouse, ["building=warehouse", "building=retail + large footprint"]),
    (factory, ["building=industrial", "man_made=works"]),
    (barn, ["building=barn", "building=farm_auxiliary"]),
    (parking_garage, ["amenity=parking + parking=multi-storey"]),
    (round_tower, ["historic=castle", "building=tower + historic=*"]),
    (lighthouse, ["man_made=lighthouse"]),
    (tree, ["natural=tree"]),
    (metal_man, ["landmark override by OSM id"]),
]

if __name__ == "__main__":
    import shutil
    for d in os.listdir(OUT):
        if d in KEEP or d.startswith("."): continue
        p = os.path.join(OUT, d)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    manifest = {}
    models = []
    for b, tags in BUILDERS:
        mdl = b(); path = mdl.export(); models.append(mdl)
        bounds = trimesh.util.concatenate([x for ms in mdl.parts.values() for x in ms]).bounds
        manifest[mdl.name] = {"file": f"{mdl.pack}/{os.path.basename(path)}", "pack": mdl.pack,
                              "osm_tags": tags, "materials": list(mdl.parts.keys()),
                              "footprint_m": [round(float(bounds[1][0] - bounds[0][0]), 1), round(float(bounds[1][1] - bounds[0][1]), 1)],
                              "height_m": round(float(bounds[1][2]), 1)}
    json.dump({"version": 1, "units": "metres", "up": "+Y", "front": "+Z",
               "palette": PALETTE, "models": manifest}, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)
    print(len(manifest), "models")

    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    light = np.array([-0.5, -0.8, 1.0]); light /= np.linalg.norm(light)
    cols_n = 6; rows_n = int(np.ceil(len(models) / cols_n))
    fig = plt.figure(figsize=(cols_n * 3.4, rows_n * 3.6), facecolor="#FAF6EE")
    for i, mdl in enumerate(models):
        ax = fig.add_subplot(rows_n, cols_n, i + 1, projection="3d"); ax.set_facecolor("#FAF6EE")
        tris, cols = [], []
        for color, meshes in mdl.parts.items():
            mm = trimesh.util.concatenate(meshes); base = np.array(rgba(PALETTE[color])[:3])
            shade = 0.55 + 0.45 * np.clip(mm.face_normals @ light, 0, 1)
            tris.extend(mm.triangles); cols.extend([np.append(base * s, 1) for s in shade])
        ax.add_collection3d(Poly3DCollection(tris, facecolors=cols, edgecolors="#2B2D42", linewidths=0.12))
        allv = np.vstack(tris).reshape(-1, 3); mn, mx = allv.min(0), allv.max(0)
        c = (mn + mx) / 2; r = (mx - mn).max() / 2
        ax.set_xlim(c[0] - r, c[0] + r); ax.set_ylim(c[1] - r, c[1] + r); ax.set_zlim(0, 2 * r)
        ax.set_box_aspect([1, 1, 1]); ax.view_init(elev=25, azim=-60); ax.axis("off")
        ax.set_title(mdl.name + ("" if mdl.pack == "generic" else f" ({mdl.pack})"), fontsize=11, color="#2B2D42")
    plt.tight_layout(); plt.savefig(os.path.join(OUT, "preview.png"), dpi=80, facecolor="#FAF6EE")
