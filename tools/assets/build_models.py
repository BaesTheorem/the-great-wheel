"""Build the web models in site/assets/models/ from the sources in sources/models/.

Run headless (Blender 4.2 or newer):
  blender -b --factory-startup --python tools/assets/build_models.py -- [names...]

Each model is reduced to a small triangle count, centered, scaled to a radius or height of 1, and
written as a GLB with 512 px textures. Names: rocks, skull, spindle, windlauer, garden, bral.
--preview DIR also renders a PNG of each model to DIR.
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "sources" / "models"
OUT = ROOT / "site" / "assets" / "models"


# ---------- scene helpers ----------
_bark = None


def reset():
    global _bark
    _bark = None
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_gltf(name: str) -> list[bpy.types.Object]:
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(next((SRC / name).glob("*.gltf"))))
    return [o for o in bpy.context.scene.objects if o not in before and o.type == "MESH"]


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def join(objs) -> bpy.types.Object:
    for o in objs:
        o.parent = None if o.parent is None else o.parent
    select_only(objs)
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def unparent_all():
    for o in list(bpy.context.scene.objects):
        if o.parent:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    for o in [o for o in bpy.context.scene.objects if o.type == "EMPTY"]:
        bpy.data.objects.remove(o)


def tris(o) -> int:
    o.data.calc_loop_triangles()
    return len(o.data.loop_triangles)


def decimate(o, target: int) -> None:
    n = tris(o)
    if n <= target:
        return
    m = o.modifiers.new("dec", "DECIMATE")
    m.ratio = max(target / n, 0.0005)
    select_only([o])
    bpy.ops.object.modifier_apply(modifier=m.name)


def center_and_scale(o, size: float = 1.0, mode: str = "radius") -> None:
    """Center the bounds on the origin, then scale so the radius (or the height) is `size`."""
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    lo = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    hi = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    mid = (lo + hi) / 2
    o.data.transform(Matrix.Translation(-mid))
    o.location = (0, 0, 0)
    if mode == "height":
        k = size / max(hi.z - lo.z, 1e-6)
    else:
        k = size / max(max((v.co.length for v in o.data.vertices), default=1), 1e-6)
    o.data.transform(Matrix.Scale(k, 4))


def shrink_images(px: int = 512) -> None:
    for img in bpy.data.images:
        if img.size[0] > px:
            img.scale(px, int(px * img.size[1] / img.size[0]))


def strip_maps() -> None:
    """Keep only the color texture of every material: distant structures do not need normal or
    roughness maps, and dropping them cuts the file to a third."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        for name in ("Normal", "Roughness", "Metallic"):
            for link in list(bsdf.inputs[name].links):
                m.node_tree.links.remove(link)
        bsdf.inputs["Roughness"].default_value = 0.9
    for img in list(bpy.data.images):
        if img.users == 0:
            bpy.data.images.remove(img)


def smooth(o, angle: float = 40) -> None:
    select_only([o])
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:  # noqa: BLE001 - older Blender
        bpy.ops.object.shade_smooth()


def material(name: str, color, rough: float = 0.9, metal: float = 0.0, image: str | None = None, use_vcol: bool = False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if use_vcol:
        vc = nt.nodes.new("ShaderNodeVertexColor")
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs[6].default_value = (*color, 1)
        nt.links.new(vc.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    return m


def export(objs, name: str, draco: bool = False) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    select_only(objs)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw: dict[str, object] = {"filepath": str(OUT / f"{name}.glb"), "export_format": "GLB", "use_selection": True, "export_apply": True, "export_yup": True}
    if "export_image_format" in props:
        kw["export_image_format"] = "JPEG"
    if "export_image_quality" in props:
        kw["export_image_quality"] = 82
    if "export_jpeg_quality" in props:
        kw["export_jpeg_quality"] = 82
    if draco and "export_draco_mesh_compression_enable" in props:
        kw["export_draco_mesh_compression_enable"] = True
        kw["export_draco_mesh_compression_level"] = 7
    for k in ("export_cameras", "export_lights"):
        if k in props:
            kw[k] = False
    bpy.ops.export_scene.gltf(**kw)
    size = (OUT / f"{name}.glb").stat().st_size
    print(f"wrote {name}.glb: {sum(tris(o) for o in objs if o.type == 'MESH')} tris, {size / 1024:.0f} KB", flush=True)


def preview(objs, path: Path, view=(1.0, -2.2, 0.9), dist: float = 3.2) -> None:
    """Render a quick EEVEE picture of the model for a visual check."""
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = 640
    sc.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.01, 0.012, 0.02, 1)
    sc.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    d = Vector(view).normalized() * dist
    cam.location = d
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 4
    sun.rotation_euler = Euler((math.radians(50), math.radians(10), math.radians(-40)))
    sc.collection.objects.link(sun)
    sc.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    bpy.data.objects.remove(sun)


# ---------- models ----------
def build_rocks(prev: Path | None):
    """Four photoscanned moon rocks: a 1,400-tri version for single bodies and a 260-tri one for
    the instanced fields (the Tears of Selune, Coliar's islands, Garden's moons)."""
    for i, src in enumerate(["moon_rock_01", "moon_rock_03", "moon_rock_05", "moon_rock_06"]):
        for lod, target in (("", 1400), ("_lo", 260)):
            reset()
            objs = import_gltf(src)
            unparent_all()
            if src == "moon_rock_01":  # it ships four LODs; keep the second-finest
                keep = [o for o in objs if o.name.endswith("LOD1")] or objs[:1]
                for o in objs:
                    if o not in keep:
                        bpy.data.objects.remove(o)
                objs = keep
            o = join(objs)
            decimate(o, target)
            center_and_scale(o, 1.0)
            smooth(o, 60)
            shrink_images(512 if lod == "" else 256)
            o.name = f"rock_{'abcd'[i]}{lod}"
            export([o], o.name)
            if prev and lod == "":
                preview([o], prev / f"{o.name}.png")


def build_skull(prev: Path | None):
    """The Skull of the Void: an anatomical human skull (CC BY-SA 4.0, Mariano Coretti), reduced,
    with ambient occlusion baked into the vertex colors so the sockets and sutures read as aged bone."""
    reset()
    bpy.ops.wm.stl_import(filepath=str(SRC / "skull" / "High_quality_skull.stl"))
    o = bpy.context.scene.objects[0]
    select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # the scan is 54 separate bones; a voxel remesh joins them into one surface, so the decimation
    # that follows keeps the shape instead of tearing it into shards
    center_and_scale(o, 1.0, mode="height")
    rm = o.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = 0.0035
    rm.adaptivity = 0.0
    select_only([o])
    bpy.ops.object.modifier_apply(modifier=rm.name)
    print("skull after remesh:", tris(o), "tris", flush=True)
    decimate(o, 30000)
    center_and_scale(o, 1.0, mode="height")
    smooth(o, 50)
    # bake AO into a color attribute
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.device = "CPU"
    o.data.color_attributes.new("Col", "BYTE_COLOR", "POINT")
    o.data.color_attributes.active_color = o.data.color_attributes["Col"]
    mat = material("bone", (1, 1, 1), rough=0.82)
    nt = mat.node_tree
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs["Color"], next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"])
    o.data.materials.clear()
    o.data.materials.append(mat)
    select_only([o])
    try:
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
        vals = [c.color[0] for c in o.data.color_attributes["Col"].data]
        print(f"AO bake: min {min(vals):.2f} max {max(vals):.2f}", flush=True)
    except Exception as e:  # noqa: BLE001 - keep a plain skull if the bake fails
        print("AO bake failed:", e, flush=True)
    o.name = "skull"
    export([o], "skull", draco=True)
    if prev:
        preview([o], prev / "skull.png", view=(0.4, -2.0, 0.3), dist=2.4)


def build_spindle(prev: Path | None):
    """The Spindle of H'Catha: a scanned cliff (CC0) stood on end and narrowed into a spire."""
    reset()
    objs = import_gltf("namaqualand_cliff_02")
    unparent_all()
    o = join(objs)
    # the cliff's long axis is X: stand it up along Z
    o.data.transform(Matrix.Rotation(math.radians(90), 4, "Y"))
    decimate(o, 5000)
    center_and_scale(o, 1.0, mode="height")
    # taper the top so it reads as a spire
    span = max(max(abs(v.co.x), abs(v.co.y)) for v in o.data.vertices) or 1
    for v in o.data.vertices:
        t = v.co.z + 0.5
        k = (1.0 - 0.82 * t ** 1.25) * 0.34 / span
        v.co.x *= k
        v.co.y *= k
    smooth(o, 40)
    shrink_images(512)
    o.name = "spindle"
    export([o], "spindle", draco=True)
    if prev:
        preview([o], prev / "spindle.png", view=(1.0, -2.0, 0.2), dist=2.6)


# ---------- composed models ----------
def piece(src: bpy.types.Object, loc, rot_z: float = 0.0, scale=(1, 1, 1)) -> bpy.types.Object:
    o = src.copy()
    o.data = src.data.copy()
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (0, 0, math.radians(rot_z))
    o.scale = scale
    return o


def cone(loc, r: float, h: float, mat) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=r, radius2=0, depth=h, location=(loc[0], loc[1], loc[2] + h / 2))
    o = bpy.context.view_layer.objects.active
    o.data.materials.append(mat)
    return o


def island_base(radius: float, depth: float, grass, rock_src: str = "moon_rock_06") -> list[bpy.types.Object]:
    """A floating chunk of land: a flat grass top over an upside-down rock."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=72, radius=radius, depth=1.6, location=(0, 0, -0.8))
    top = bpy.context.view_layer.objects.active
    for v in top.data.vertices:  # ragged edge
        if v.co.z > -0.1:
            a = math.atan2(v.co.y, v.co.x)
            k = 1 + 0.06 * math.sin(a * 5) + 0.04 * math.sin(a * 11 + 1)
            v.co.x *= k
            v.co.y *= k
    top.data.materials.append(grass)
    rock = join(import_gltf(rock_src))
    decimate(rock, 2500)
    center_and_scale(rock, 1.0)
    rock.data.transform(Matrix.Rotation(math.radians(180), 4, "X"))
    rock.scale = (radius * 1.05, radius * 1.05, depth)
    select_only([rock])
    bpy.ops.object.transform_apply(scale=True)
    top_z = max(v.co.z for v in rock.data.vertices)
    rock.location = (0, 0, -top_z - 0.6)
    return [top, rock]



def bark_material():
    """The bark of the Poly Haven dead tree trunk (CC0), reused for trunks and Garden's vine."""
    global _bark
    if _bark is None:
        src = join(import_gltf("dead_tree_trunk"))
        _bark = src.data.materials[0]
        bpy.data.objects.remove(src)
    return _bark


def tree(height: float, leaf) -> list[bpy.types.Object]:
    """A tree that reads well from far away: a bark trunk and three lumpy leaf masses."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=height * 0.06, depth=height * 0.55, location=(0, 0, height * 0.275))
    trunk = bpy.context.view_layer.objects.active
    trunk.data.materials.append(bark_material())
    out = [trunk]
    for k in range(3):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=height * random.uniform(0.24, 0.32),
                                              location=(random.uniform(-0.12, 0.12) * height, random.uniform(-0.12, 0.12) * height, height * (0.62 + 0.13 * k)))
        c = bpy.context.view_layer.objects.active
        for v in c.data.vertices:
            v.co *= random.uniform(0.85, 1.12)
        c.data.materials.append(leaf)
        out.append(c)
    t = join(out)
    return [t]


def trees(n: int, ring: tuple[float, float], height: float, avoid: float = 0.0) -> list[bpy.types.Object]:
    leaf = material("leaves", (0.16, 0.34, 0.12), rough=1)
    out = []
    for i in range(n):
        a = i / n * 2 * math.pi + random.uniform(-0.25, 0.25)
        if avoid and abs(math.sin(a) + 1) < avoid:  # keep the front of the castle open
            a += 0.7
        r = random.uniform(*ring)
        t = tree(height * random.uniform(0.75, 1.25), leaf)[0]
        t.location = (r * math.cos(a), r * math.sin(a), 0)
        t.rotation_euler = (0, 0, random.uniform(0, 6.28))
        out.append(t)
    return out


def build_windlauer(prev: Path | None):
    """Caer Windlauer: a stone castle with ten spires on 2,000 acres of floating land, with a
    pond and trees (Realmspace p.55). Walls and towers are the Poly Haven fort kit (CC0)."""
    reset()
    fort = {o.name.replace("modular_fort_01_", ""): o for o in import_gltf("modular_fort_01")}
    unparent_all()
    for o in fort.values():
        o.location = (0, 0, 0)
        o.rotation_euler = (0, 0, 0)
    grass = material("grass", (0.26, 0.42, 0.18), rough=1)
    slate = material("slate", (0.27, 0.31, 0.38), rough=0.55)
    water = material("water", (0.12, 0.33, 0.55), rough=0.08, metal=0.1)
    parts = island_base(46, 34, grass)
    wall, tower = fort["wall_thick_straight_01"], fort["tower_round"]
    L = 14.5
    for side in range(4):  # a square curtain wall, two segments a side
        ang = side * 90
        for k in (-0.5, 0.5):
            x, y = L * k, L
            c, s_ = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            parts.append(piece(wall, (x * c - y * s_, x * s_ + y * c, 0), rot_z=ang + 90))
    for cx, cy in ((L, L), (-L, L), (L, -L), (-L, -L)):  # four corner towers, each with a spire
        parts.append(piece(tower, (cx, cy, 0), scale=(0.62, 0.62, 1.45)))
        parts.append(cone((cx, cy, 13.5 * 1.45), 5.2, 13, slate))
    parts.append(piece(tower, (0, 0, 0), scale=(1.05, 1.05, 2.4)))  # the keep
    parts.append(cone((0, 0, 13.5 * 2.4), 8.4, 22, slate))
    for i in range(5):  # five slender towers in the court: spires six to ten
        a = i / 5 * 2 * math.pi + 0.5
        x, y = 8.2 * math.cos(a), 8.2 * math.sin(a)
        parts.append(piece(tower, (x, y, 0), scale=(0.3, 0.3, 2.0)))
        parts.append(cone((x, y, 27), 2.6, 11, slate))
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=7, depth=0.4, location=(0, -30, 0.05))
    pond = bpy.context.view_layer.objects.active
    pond.scale = (1.4, 0.8, 1)
    pond.data.materials.append(water)
    parts.append(pond)
    parts += trees(14, (27, 42), 13.0, avoid=0.5)
    for o in fort.values():
        if o not in parts:
            bpy.data.objects.remove(o)
    o = join(parts)
    decimate(o, 34000)
    center_and_scale(o, 1.0)
    strip_maps()
    shrink_images(256)
    o.name = "windlauer"
    export([o], "windlauer", draco=True)
    if prev:
        preview([o], prev / "windlauer.png", view=(1.0, -2.2, 1.1), dist=2.9)


def build_garden(prev: Path | None):
    """Garden: a chain of earth masses held together by one enormous plant, Yggdrasil's Child
    (Realmspace p.44). The masses are Poly Haven moon rocks recolored to soil; the vine wears the
    dead-tree bark (CC0) and carries masses of leaves."""
    reset()
    soil = material("soil", (0.26, 0.19, 0.12), rough=1)
    leaf = material("leaves", (0.2, 0.42, 0.14), rough=1)
    parts, centers = [], []
    srcs = ["moon_rock_03", "moon_rock_05", "moon_rock_06", "moon_rock_03", "moon_rock_05", "moon_rock_06"]
    for i, src in enumerate(srcs):
        r = join(import_gltf(src))
        decimate(r, 1800)
        center_and_scale(r, 1.0)
        r.data.materials.clear()
        r.data.materials.append(soil)
        k = random.uniform(1.7, 2.4)
        p = Vector(((i - 2.5) * 2.6, math.sin(i * 1.7) * 1.4, math.cos(i * 1.3) * 1.0))
        r.scale = (k, k, k * 0.8)
        r.location = p
        r.rotation_euler = (random.uniform(0, 3), random.uniform(0, 3), random.uniform(0, 3))
        parts.append(r)
        centers.append(p)
    curve = bpy.data.curves.new("vine", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.26
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    sp = curve.splines.new("NURBS")
    pts = []
    for i, c in enumerate(centers):
        pts.append(c + Vector((0, 0.3 * math.sin(i * 2.1), 0.4 * math.cos(i * 1.7))))
        if i < len(centers) - 1:
            pts.append((c + centers[i + 1]) / 2 + Vector((0, 1.1 * (-1) ** i, 0.8 * (-1) ** (i + 1))))
    sp.points.add(len(pts) - 1)
    for p, cp in zip(pts, sp.points):
        cp.co = (*p, 1)
        cp.radius = random.uniform(0.7, 1.3)
    sp.order_u = 4
    sp.use_endpoint_u = True
    vine = bpy.data.objects.new("vine", curve)
    bpy.context.scene.collection.objects.link(vine)
    curve.materials.append(bark_material())
    select_only([vine])
    bpy.ops.object.convert(target="MESH")
    vine = bpy.context.view_layer.objects.active
    parts.append(vine)
    # leaf masses along the vine and on top of the soil
    for i, p in enumerate(pts):
        for _ in range(2):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=random.uniform(0.35, 0.7),
                                                  location=p + Vector((random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), random.uniform(0.2, 0.7))))
            c = bpy.context.view_layer.objects.active
            for v in c.data.vertices:
                v.co *= random.uniform(0.8, 1.15)
            c.data.materials.append(leaf)
            parts.append(c)
    o = join(parts)
    center_and_scale(o, 1.0)
    strip_maps()
    shrink_images(256)
    o.name = "garden"
    export([o], "garden", draco=True)
    if prev:
        preview([o], prev / "garden.png", view=(0.3, -2.2, 0.9), dist=2.7)


def build_bral(prev: Path | None):
    """The Rock of Bral: an asteroid with a walled city on its upper face. The rock is a Poly Haven
    moon rock and the walls and towers are the fort kit (both CC0); the houses are simple blocks
    in the fort's plaster."""
    reset()
    fort = {o.name.replace("modular_fort_01_", ""): o for o in import_gltf("modular_fort_01")}
    unparent_all()
    for o in fort.values():
        o.location = (0, 0, 0)
    rock = join(import_gltf("moon_rock_03"))
    decimate(rock, 3000)
    center_and_scale(rock, 1.0)
    rock.scale = (120, 75, 80)
    select_only([rock])
    bpy.ops.object.transform_apply(scale=True)
    top = max(v.co.z for v in rock.data.vertices)
    bpy.context.view_layer.update()

    def ground(x: float, y: float) -> float | None:
        hit, loc, _n, _i = rock.ray_cast(Vector((x, y, top + 50)), Vector((0, 0, -1)))
        return loc.z if hit else None
    plaster = fort["wall_thin_straight_01"].data.materials[0]
    roof = material("roof", (0.45, 0.2, 0.15), rough=0.8)
    parts = [rock]
    random.seed(11)
    for _ in range(90):  # houses, each set down on the rock where it stands
        x, y = random.uniform(-55, 55), random.uniform(-30, 30)
        deck = ground(x, y)
        if deck is None or deck < top * 0.55:
            continue
        w, d, h = random.uniform(4, 9), random.uniform(4, 8), random.uniform(4, 11)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, deck + h / 2 - 1.5))
        hs = bpy.context.view_layer.objects.active
        hs.scale = (w, d, h)
        hs.rotation_euler = (0, 0, random.uniform(0, 0.4))
        hs.data.materials.append(plaster)
        parts.append(hs)
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=max(w, d) * 0.75, depth=h * 0.45, location=(x, y, deck + h + h * 0.22))
        rf = bpy.context.view_layer.objects.active
        rf.rotation_euler = (0, 0, math.radians(45) + hs.rotation_euler.z)
        rf.data.materials.append(roof)
        parts.append(rf)
    gz = ground(8, 0) or top
    parts.append(piece(fort["tower_round"], (8, 0, gz - 2), scale=(0.9, 0.9, 1.9)))  # the Prince's palace
    parts.append(cone((8, 0, gz - 2 + 13.5 * 1.9), 7.5, 14, roof))
    for x in (-34, 34):
        tz = ground(x, 14) or top
        parts.append(piece(fort["tower_round"], (x, 14, tz - 2), scale=(0.45, 0.45, 1.2)))
    for o in fort.values():
        if o not in parts:
            bpy.data.objects.remove(o)
    o = join(parts)
    center_and_scale(o, 1.0)
    strip_maps()
    shrink_images(256)
    o.name = "bral"
    export([o], "bral", draco=True)
    if prev:
        preview([o], prev / "bral.png", view=(0.6, -2.0, 1.3), dist=2.6)


BUILDERS = {"rocks": build_rocks, "skull": build_skull, "spindle": build_spindle,
            "windlauer": build_windlauer, "garden": build_garden, "bral": build_bral}


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    prev = None
    if "--preview" in args:
        i = args.index("--preview")
        prev = Path(args[i + 1])
        prev.mkdir(parents=True, exist_ok=True)
        args = args[:i] + args[i + 2:]
    random.seed(7)
    for name in args or list(BUILDERS):
        BUILDERS[name](prev)


main()
