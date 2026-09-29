"""
Regenerate the model kit into a temp dir and check it matches the committed kit.

Comparison is semantic, not byte-for-byte: trimesh versions differ in how they
wrap the scene graph (e.g. an extra "world" root node), which changes bytes but
not the model. We require identical manifest, materials, meshes, accessors,
buffer views and binary buffers, and the same named mesh nodes with no
transforms.

Usage: python assets/generator/check_reproducible.py
"""
import json, os, struct, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "models"))


def load_glb(path):
    b = open(path, "rb").read()
    magic, _version, _length = struct.unpack_from("<4sII", b, 0)
    assert magic == b"glTF", f"{path}: not a GLB"
    n = struct.unpack_from("<I", b, 12)[0]
    doc = json.loads(b[20:20 + n])
    rest = b[20 + n:]
    binary = rest[8:] if rest else b""
    return doc, binary


def mesh_nodes(doc):
    """Named mesh nodes, ignoring any transform-free grouping nodes above them."""
    out = []
    for node in doc.get("nodes", []):
        for key in ("matrix", "translation", "rotation", "scale"):
            if key in node:
                raise AssertionError(f"node {node.get('name')} has a {key}; kit models must be transform-free")
        if "mesh" in node:
            out.append((node.get("name"), doc["meshes"][node["mesh"]]))
    return sorted(out, key=lambda x: x[0])


def compare(a_path, b_path):
    a, abin = load_glb(a_path)
    b, bbin = load_glb(b_path)
    errors = []
    for key in ("accessors", "bufferViews", "materials"):
        if a.get(key) != b.get(key):
            errors.append(key)
    if mesh_nodes(a) != mesh_nodes(b):
        errors.append("mesh nodes")
    if abin != bbin:
        errors.append("binary buffer")
    return errors


def files(root):
    for d, _, fs in os.walk(root):
        for f in fs:
            if f.endswith(".glb"):
                yield os.path.relpath(os.path.join(d, f), root)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, TOYTOWN_MODELS_OUT=tmp, MPLBACKEND="Agg")
        subprocess.run([sys.executable, os.path.join(HERE, "generate_models.py")], env=env, check=True)

        failures = []
        if json.load(open(os.path.join(MODELS, "manifest.json"))) != json.load(open(os.path.join(tmp, "manifest.json"))):
            failures.append("manifest.json differs")
        committed, regenerated = set(files(MODELS)), set(files(tmp))
        for f in sorted(committed ^ regenerated):
            failures.append(f"{f}: only in {'committed kit' if f in committed else 'regenerated kit'}")
        for f in sorted(committed & regenerated):
            errs = compare(os.path.join(MODELS, f), os.path.join(tmp, f))
            if errs:
                failures.append(f"{f}: differs in {', '.join(errs)}")

    if failures:
        print("Generator does NOT reproduce the committed kit:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print(f"OK: generator reproduces all {len(committed)} models and the manifest")


if __name__ == "__main__":
    main()
