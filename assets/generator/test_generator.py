"""
Tests for the generator's hand-made model support and cleanup. Plain asserts, no test runner:
    python assets/generator/test_generator.py
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import trimesh
from trimesh.visual import TextureVisuals
from trimesh.visual.material import PBRMaterial

HERE = os.path.dirname(os.path.abspath(__file__))


def hand_glb(path, w, d, h):
    """A Y-up box, like a Blender export: w wide (x), d deep (z), h tall (y), base at y = 0."""
    m = trimesh.creation.box(extents=[w, h, d]); m.apply_translation([0, h / 2, 0])
    m.visual = TextureVisuals(material=PBRMaterial(name="wall_mint", baseColorFactor=[0.5, 0.8, 0.6, 1]))
    scene = trimesh.Scene(); scene.add_geometry(m, node_name="body")
    os.makedirs(os.path.dirname(path), exist_ok=True); scene.export(path)


def run(src, out):
    env = dict(os.environ, TOYTOWN_MODELS_SRC=src, TOYTOWN_MODELS_OUT=out, MPLBACKEND="Agg")
    subprocess.run([sys.executable, os.path.join(HERE, "generate_models.py")], env=env, check=True, capture_output=True)
    return json.load(open(os.path.join(out, "manifest.json")))


with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as out:
    # A regional pack with one hand-made model and one hand-made variant of a generated model.
    hand_glb(os.path.join(src, "testpack", "kiosk.glb"), 3, 2, 3.5)
    hand_glb(os.path.join(src, "testpack", "house_mint.glb"), 8, 7, 8)
    json.dump({"models": {
        "kiosk": {"file": "testpack/kiosk.glb", "osm_tags": ["building=kiosk"]},
        "house_mint": {"file": "testpack/house_mint.glb", "variant_of": "house"},
    }}, open(os.path.join(src, "testpack", "pack.json"), "w"))

    m = run(src, out)
    kiosk = m["models"]["kiosk"]
    assert kiosk["source"] == "hand" and kiosk["pack"] == "testpack", kiosk
    assert kiosk["footprint_m"] == [3.0, 2.0] and kiosk["height_m"] == 3.5, kiosk
    assert kiosk["materials"] == ["wall_mint"], kiosk
    assert os.path.exists(os.path.join(out, "testpack", "kiosk.glb")), "hand-made file copied into the output"
    variants = {v["name"]: v for v in m["models"]["house"]["variants"]}
    assert set(variants) == {"house_2", "house_3", "house_mint"}, variants
    assert variants["house_mint"]["source"] == "hand"

    # Regenerating in place removes stale generated files but keeps hand-made ones and other files.
    stale = os.path.join(out, "generic", "old_model.glb")
    open(stale, "wb").write(b"x")
    m["models"]["old_model"] = {"file": "generic/old_model.glb"}
    json.dump(m, open(os.path.join(out, "manifest.json"), "w"))
    open(os.path.join(out, "LICENSES.md"), "w").write("keep me")
    run(src, out)
    assert not os.path.exists(stale), "stale generated GLB removed"
    assert os.path.exists(os.path.join(out, "testpack", "kiosk.glb")), "hand-made GLB kept"
    assert open(os.path.join(out, "LICENSES.md")).read() == "keep me", "hand-written files kept"

print("OK: generator handles hand-made packs, variants and cleanup")
