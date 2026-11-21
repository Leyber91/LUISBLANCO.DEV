"""Render one Orthogonal artifact from a parameter file and a seed, headless in Blender.

[ILLUSTRATIVE] The artifacts are invented. Every form is procedural and seeded: the same parameter file and seed build
the same geometry, and only the render's sampling noise can differ between two runs.

Usage (Blender 5.1; the paths must be absolute):
  blender --background --factory-startup --python render_artifact.py -- <params.json> <out.webp|out.png>
          [--seed N] [--samples N] [--percent N] [--threads N] [--measure]

--threads caps the CPU threads Cycles takes (this machine is shared); it changes the time, not the image.

It writes the image and, beside it, <out stem>.render.json: the artifact, its family, the seed, the parameter file's
SHA-256 (its text with CRLF read as LF), Blender's version, the render settings and time, and the measure of the
culture. labs/assets/js/orthogonal/tests.mjs refuses a render whose record does not match its parameter file, so an
image never outlives the parameters it was drawn from. --measure builds the scene, prints the measure and renders
nothing.

The parameters and their bounds are declared once, in artifact_schema.json beside this file; a file outside them is
refused before anything is built.

One family so far, shelf-culture-lamp. Its methods, not code:
- the cap is a profile swept round an axis, after Desbenoit, Vanderhaghe, Galin and Grosjean, "Interactive Modeling of
  Mushrooms", Eurographics 2004 short paper, and Infinigen's mushroom cap (Raistrick et al., CVPR 2023, BSD-3);
- the bracket is lateral (Infinigen's caps are all central): a kidney fan, a rolled margin, full gills with shorter
  gills, forks and cross-veins between them, a short lateral stem;
- the glow sits on the gill edges and cross-veins, the gill-stem junction and the rolled margin, where O'Kane, Lingle,
  Porter and Wampler (Mycologia 82, 595, 1990) report it for Panellus stipticus, as a secondary source states it (the
  primary was not opened). Real fungal light is dim: a culture of P. stipticus was photographed with an 8-minute
  exposure (Rabara and Xie, J. Fungi 11, 774, 2025).
- the glow is a stylised blue-white, not the species' green (about 525 nm), because the plate allows no third hue.

The scene is honest about that light (pass 3, 2026-11-21). The lamp stands at night in fog on a wet cobbled street,
and no studio light lights it (air.rim_energy_w is 0, and at 0 none is made). The emission is low, and the image is
exposed up by exposure.stops, as a long exposure records a dim source: the glowing edges near the top of the range, the
street lit only in a small pool around the plinth, the fog averaged into a smooth halo. An exposure that long also
records the night sky (slice 2): a faint, cold sky ambient (air.sky_ambient in air.sky_rgb, a dome inside the fog)
lights the fog behind the instrument and rims its hood and plinth, so the instrument reads while the culture stays the
brightest thing in the frame. The record measures both from the render's own pixels (measure.light). To the eye it
would be dimmer; the page says so beside the image, tagged [ILLUSTRATIVE].

The camera puts the instrument's foot at camera.ground_y of the frame's height from the top and its top camera.fill
above that, so the street and its pool show below the plinth. The record measures where the two lines fell
(measure.frame), and the page stands Earth's lamp on the same two lines.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import math
import os
import random
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(HERE, "artifact_schema.json")
SKY_DOME_M = 11.0        # the sky dome's radius: inside the 24 m street, 3.3 of the fog's mean free paths out at 0.3


# ------------------------------------------------------------------------------------------------ parameters (no bpy)
def params_sha256(path: str) -> str:
    """The parameter file's SHA-256, its text with CRLF read as LF, so a checkout on either platform agrees."""
    with open(path, "rb") as f:
        return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()


def lookup(params: dict, dotted: str):
    node = params
    for part in dotted.split("."):
        if not isinstance(node, dict) or part not in node:
            raise KeyError(dotted)
        node = node[part]
    return node


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate(params: dict, schema: dict) -> list[str]:
    """Every way the parameters break their family's schema, as sentences; empty when they hold."""
    fam = schema["families"].get(params.get("family"))
    if fam is None:
        return [f"unknown family {params.get('family')!r}"]
    out = []
    for key, rule in fam.items():
        try:
            v = lookup(params, key)
        except KeyError:
            out.append(f"{key} is missing")
            continue
        t, lo, hi = rule["type"], rule.get("min"), rule.get("max")
        if t in ("number", "int"):
            if not _num(v) or (t == "int" and int(v) != v):
                out.append(f"{key} is not a{'n integer' if t == 'int' else ' number'}: {v!r}")
            elif not lo <= v <= hi:
                out.append(f"{key} = {v} is outside [{lo}, {hi}]")
        elif t == "range":
            if not (isinstance(v, list) and len(v) == 2 and all(_num(x) for x in v)):
                out.append(f"{key} is not a pair of numbers: {v!r}")
            elif not lo <= v[0] <= v[1] <= hi:
                out.append(f"{key} = {v} is not lo <= hi inside [{lo}, {hi}]")
        elif t == "rgb":
            if not (isinstance(v, list) and len(v) == 3 and all(_num(x) and 0 <= x <= 1 for x in v)):
                out.append(f"{key} is not three numbers in [0, 1]: {v!r}")
        elif t == "steps":
            if not (isinstance(v, list) and lo <= len(v) <= hi):
                out.append(f"{key} needs {lo} to {hi} steps: {v!r}")
                continue
            for s in v:
                ok = isinstance(s, list) and len(s) == 2 and all(_num(x) for x in s)
                if not ok or not (rule["radius"][0] <= s[0] <= rule["radius"][1]
                                  and rule["height"][0] <= s[1] <= rule["height"][1]):
                    out.append(f"{key} step {s!r} is outside radius {rule['radius']} or height {rule['height']}")
        else:
            out.append(f"{key} has an unknown rule type {t!r}")
    # rules between two parameters: [a, b] means a <= b
    for a, b in schema.get("at_most", {}).get(params.get("family"), []):
        try:
            va, vb = lookup(params, a), lookup(params, b)
        except KeyError:
            continue                     # reported above as missing
        if _num(va) and _num(vb) and va > vb:
            out.append(f"{a} = {va} is more than {b} = {vb}")
    return out


def read_params(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        params = json.load(f)
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        schema = json.load(f)
    broken = validate(params, schema)
    if broken:
        sys.exit("render_artifact.py: the parameter file breaks its schema:\n  " + "\n  ".join(broken))
    return params


def parse_argv(argv: list[str]) -> dict:
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    opts = {"measure": "--measure" in args, "seed": None, "samples": None, "percent": None, "threads": None}
    pos, i = [], 0
    while i < len(args):
        a = args[i]
        if a in ("--seed", "--samples", "--percent", "--threads"):
            if i + 1 >= len(args):
                sys.exit(f"render_artifact.py: {a} needs a value")
            opts[a[2:]] = int(args[i + 1])
            i += 2
            continue
        if not a.startswith("--"):
            pos.append(a)
        i += 1
    if not pos or not os.path.isabs(pos[0]):
        sys.exit("render_artifact.py: give the absolute path of a parameter file after --")
    opts["params"] = pos[0]
    opts["out"] = pos[1] if len(pos) > 1 else None
    if not opts["measure"] and (opts["out"] is None or not os.path.isabs(opts["out"])):
        sys.exit("render_artifact.py: give an absolute output path (.webp or .png) after the parameter file")
    return opts


# ----------------------------------------------------------------------------------------------------- the scene (bpy)
def build_shelf_culture_lamp(P: dict, seed: int):
    """The lamp of the fungus world. Returns the scene, its camera, the collection the drafting ink skips, and the
    function that measures the culture."""
    import bmesh
    import bpy
    import numpy as np
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    rng = random.Random(seed)            # placement of every part
    I, C, B, G, A, K = P["instrument"], P["culture"], P["bracket"], P["glow"], P["air"], P["camera"]
    R = P["render"]
    glow_rgb = tuple(G["rgb"])
    col_r, col_h = I["column_radius_m"], I["column_height_m"]
    plinth_h, plinth_r = I["plinth_height_m"], I["column_radius_m"] + I["plinth_overhang_m"]
    spindle_r = I["spindle_radius_m"]

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    scene = bpy.context.scene

    # ------------------------------------------------------------------------------------------------- materials
    def principled(name, base, rough=0.5, metal=0.0):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        p = m.node_tree.nodes.get("Principled BSDF")
        p.inputs["Base Color"].default_value = (*base, 1.0)
        p.inputs["Roughness"].default_value = rough
        p.inputs["Metallic"].default_value = metal
        return m

    def glass_mat():
        """Thin glass: straight through, with a Fresnel reflection. A refracting wall moved the culture about 20 plate
        px and mirrored caps into the back wall."""
        m = bpy.data.materials.new("glass")
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        clear = nt.nodes.new("ShaderNodeBsdfTransparent")
        clear.inputs["Color"].default_value = (0.93, 0.95, 0.98, 1.0)
        gloss = nt.nodes.new("ShaderNodeBsdfGlossy")
        gloss.inputs["Roughness"].default_value = 0.03
        fres = nt.nodes.new("ShaderNodeFresnel")
        fres.inputs["IOR"].default_value = 1.47
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(fres.outputs["Fac"], mix.inputs["Fac"])
        nt.links.new(clear.outputs["BSDF"], mix.inputs[1])
        nt.links.new(gloss.outputs["BSDF"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
        return m

    def glow_strength(nt, scale, noise_scale):
        """The mesh's per-vertex glow, times a little noise, times scale: a socket for Emission Strength."""
        attr = nt.nodes.new("ShaderNodeAttribute")
        attr.attribute_type = "GEOMETRY"
        attr.attribute_name = "glow"
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 3.0
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = 0.3
        mr.inputs["From Max"].default_value = 0.7
        mr.inputs["To Min"].default_value = 0.55
        mr.inputs["To Max"].default_value = 1.0
        nt.links.new(noise.outputs["Fac"], mr.inputs["Value"])
        m1 = nt.nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY"
        nt.links.new(attr.outputs["Fac"], m1.inputs[0])
        nt.links.new(mr.outputs["Result"], m1.inputs[1])
        m2 = nt.nodes.new("ShaderNodeMath")
        m2.operation = "MULTIPLY"
        m2.inputs[1].default_value = scale
        nt.links.new(m1.outputs["Value"], m2.inputs[0])
        return m2.outputs["Value"]

    def fungus_materials():
        """Cap flesh (mid-grey, woolly, cracked), gill tissue (dark sides, the glow on the free edge), stem, and the
        dark underside between the gills, so each gill's lit edge stands out as a line."""
        flesh = principled("fungus_flesh", (0.24, 0.25, 0.27), rough=0.7)
        nt = flesh.node_tree
        p = nt.nodes.get("Principled BSDF")
        p.inputs["Sheen Weight"].default_value = 0.45
        p.inputs["Sheen Roughness"].default_value = 0.45
        p.inputs["Emission Color"].default_value = (*glow_rgb, 1.0)
        nt.links.new(glow_strength(nt, G["flesh"], 40.0), p.inputs["Emission Strength"])
        tc = nt.nodes.new("ShaderNodeTexCoord")      # the cracked cap: voronoi distance to edge as a bump
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "DISTANCE_TO_EDGE"
        vor.inputs["Scale"].default_value = 18.0
        nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeMapRange")
        ramp.inputs["From Min"].default_value = 0.0
        ramp.inputs["From Max"].default_value = 0.08
        nt.links.new(vor.outputs["Distance"], ramp.inputs["Value"])
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = 140.0
        nt.links.new(tc.outputs["Object"], fine.inputs["Vector"])
        fine_k = nt.nodes.new("ShaderNodeMath")
        fine_k.operation = "MULTIPLY"
        fine_k.inputs[1].default_value = 0.25
        nt.links.new(fine.outputs["Fac"], fine_k.inputs[0])
        height = nt.nodes.new("ShaderNodeMath")
        height.operation = "ADD"
        nt.links.new(ramp.outputs["Result"], height.inputs[0])
        nt.links.new(fine_k.outputs["Value"], height.inputs[1])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.35
        bump.inputs["Distance"].default_value = 0.004
        nt.links.new(height.outputs["Value"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])

        gill = principled("fungus_gill", (0.06, 0.065, 0.075), rough=0.55)
        nt = gill.node_tree
        p = nt.nodes.get("Principled BSDF")
        p.inputs["Emission Color"].default_value = (*glow_rgb, 1.0)
        nt.links.new(glow_strength(nt, G["gill"], 60.0), p.inputs["Emission Strength"])

        stem = principled("fungus_stem", (0.22, 0.23, 0.25), rough=0.6)
        nt = stem.node_tree
        p = nt.nodes.get("Principled BSDF")
        p.inputs["Sheen Weight"].default_value = 0.4
        p.inputs["Emission Color"].default_value = (*glow_rgb, 1.0)
        nt.links.new(glow_strength(nt, G["flesh"], 40.0), p.inputs["Emission Strength"])

        hymenium = principled("fungus_hymenium", (0.06, 0.065, 0.075), rough=0.6)
        nt = hymenium.node_tree
        p = nt.nodes.get("Principled BSDF")
        p.inputs["Emission Color"].default_value = (*glow_rgb, 1.0)
        nt.links.new(glow_strength(nt, G["flesh"], 40.0), p.inputs["Emission Strength"])
        return flesh, gill, stem, hymenium

    # ------------------------------------------------------------------------------------------------ the bracket
    class Mesh:
        def __init__(self):
            self.v, self.f, self.mi, self.g, self.n = [], [], [], [], 0

        def add(self, verts, faces, mat, glow):
            """mat: one material index for every face, or a list with one index per face."""
            self.v.append(verts)
            self.f.extend(tuple(i + self.n for i in face) for face in faces)
            self.mi.extend(mat if isinstance(mat, list) else [mat] * len(faces))
            self.g.append(glow)
            self.n += len(verts)

        def build(self, name, mats):
            verts = np.concatenate(self.v)
            me = bpy.data.meshes.new(name)
            me.from_pydata(verts.tolist(), [], self.f)
            me.update()
            me.polygons.foreach_set("material_index", np.array(self.mi, dtype=np.int32))
            me.polygons.foreach_set("use_smooth", np.ones(len(self.f), dtype=bool))
            a = me.attributes.new("glow", "FLOAT", "POINT")
            a.data.foreach_set("value", np.concatenate(self.g).astype(np.float32))
            bm = bmesh.new()
            bm.from_mesh(me)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            bm.to_mesh(me)
            bm.free()
            for m in mats:
                me.materials.append(m)
            return bpy.data.objects.new(name, me)

    def grid_faces(rows, cols):
        return [(i * cols + j, i * cols + j + 1, (i + 1) * cols + j + 1, (i + 1) * cols + j)
                for i in range(rows - 1) for j in range(cols - 1)]

    levels = (0.0, 0.5, 0.82, 1.0)       # rows down each face of a gill; the row at 0.82 keeps the glow near the edge

    def blade(path_xy, z_att, depth, width, glow_free, glow_root):
        """A thin blade hanging from a path; the glow rises steeply toward the free edge (edge_power)."""
        d = np.gradient(path_xy, axis=0)
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
        nrm = np.stack([-d[:, 1], d[:, 0]], 1)
        rows, glows = [], []
        sides = [(-1, lv) for lv in levels] + [(1, lv) for lv in levels[::-1]]
        for side, level in sides:
            w = width * (1.0 - 0.65 * level) * 0.5
            rows.append(np.column_stack([path_xy + side * w[:, None] * nrm, z_att - level * depth]))
            glows.append(glow_root + (glow_free - glow_root) * level ** B["edge_power"])
        return np.concatenate(rows), grid_faces(len(sides), len(path_xy)), np.concatenate(glows)

    def bracket(sub_seed, R0, name, mats):
        """One kidney-shaped bracket: lateral stem along -x, cap fanning along +x, z up, gills hanging below."""
        g = np.random.default_rng(sub_seed)
        THETA = math.radians(g.uniform(118, 140))
        H0, T0 = R0 * g.uniform(*B["rise"]), R0 * g.uniform(*B["thick"])
        RHO0, RHOC = 0.07, 0.88
        teeth = g.integers(9, 15)
        ph = g.uniform(0, 2 * math.pi, 3)
        asym = g.uniform(-0.12, 0.12)

        def Rad(u):
            scallop = 1 + 0.022 * np.sin(2 * math.pi * teeth * (u + 1) / 2 + ph[0]) + 0.03 * np.sin(3.1 * u + ph[1])
            return R0 * (1 - 0.6 * u ** 2) * (1 + asym * u) * scallop

        def z_top(rho, u):
            return H0 * (1 - 0.5 * u ** 2) * (1 - rho ** 1.7) + 0.05 * R0 * np.sin(2.3 * u + ph[2]) * rho ** 2

        def thick(rho, u):
            return T0 * (1 - 0.4 * u ** 2) * (0.22 + 0.78 * (1 - rho) ** 1.3)

        def z_bot(rho, u):
            return z_top(rho, u) - thick(rho, u)

        mesh = Mesh()
        NU, NT, NC = B["sweep_steps"], 22, 9
        rho_s = np.linspace(RHO0, RHOC, NT)
        prof_pts, prof_glow = [], []
        for u in np.linspace(-1, 1, NU):
            Ru, th = Rad(u), THETA * u
            c, s = math.cos(th), math.sin(th)
            pts, gl = [], []
            for rho in rho_s:                          # top, outward
                pts.append((rho * Ru, z_top(rho, u)))
                gl.append(0.03)
            m = thick(RHOC, u) / 2
            cx, cz = RHOC * Ru, z_top(RHOC, u) - m
            for k in range(1, NC):                     # the margin, rolled under by half a turn
                phi = math.pi * k / NC
                pts.append((cx + 1.15 * m * math.sin(phi), cz + m * math.cos(phi) - 0.25 * m * math.sin(phi)))
                gl.append(0.55)
            for rho in rho_s[::-1]:                    # underside, inward
                pts.append((rho * Ru, z_bot(rho, u)))
                gl.append(0.08 if rho < 0.2 else 0.03)
            arr = np.array(pts)
            prof_pts.append(np.column_stack([arr[:, 0] * c, arr[:, 0] * s, arr[:, 1]]))
            prof_glow.append(np.array(gl))
        NP = len(prof_pts[0])
        cap_f = [(i * NP + j, i * NP + (j + 1) % NP, (i + 1) * NP + (j + 1) % NP, (i + 1) * NP + j)
                 for i in range(NU - 1) for j in range(NP)]
        for i, flip in ((0, False), (NU - 1, True)):   # close both ends of the sweep
            base = i * NP
            for k in range(NT - 1):
                a, b = base + k, base + k + 1
                bb, ab = base + (NP - 1 - (k + 1)), base + (NP - 1 - k)
                cap_f.append((a, ab, bb, b) if not flip else (a, b, bb, ab))
            top_end = base + NT - 1
            for k in range(NT, NT + NC - 1):
                cap_f.append((top_end, base + k + 1, base + k) if not flip else (top_end, base + k, base + k + 1))
        # faces between underside points take the dark hymenium (3); the top, margin, inner edge and ends stay flesh (0)
        under = [3 if NT + NC - 1 <= j <= NP - 2 else 0 for i in range(NU - 1) for j in range(NP)]
        mesh.add(np.concatenate(prof_pts), cap_f, under + [0] * (len(cap_f) - len(under)), np.concatenate(prof_glow))

        N_FULL = int(g.integers(B["full_gills"][0], B["full_gills"][1]))
        du = 2 * 0.94 / (N_FULL - 1)
        full_u = np.linspace(-0.94, 0.94, N_FULL)
        DMAX, WID, NS = R0 * g.uniform(*B["gill_depth"]), R0 * 0.0085, B["gill_steps"]

        def add_gill(u0, u1, rho0, rho1, depth_scale=1.0):
            r = np.linspace(rho0 * Rad(u0), rho1 * Rad(u1) * 0.985, NS)
            t = np.linspace(0, 1, NS)
            u = u0 + (u1 - u0) * t ** 1.5 + 0.12 * du * np.sin(t * math.pi * 2.3 + g.uniform(0, 6.28))
            rho = np.array([ri / Rad(ui) for ri, ui in zip(r, u)])
            xy = np.column_stack([r * np.cos(THETA * u), r * np.sin(THETA * u)])
            z = z_bot(rho, u) + 0.15 * thick(rho, u)   # the root buried a little in the flesh
            prof = np.sin(np.clip(t, 0, 1) * math.pi) ** 0.55
            depth = DMAX * depth_scale * prof * (0.75 + 0.25 * np.cos((rho - 0.5) * 2.0)) + 0.15 * thick(rho, u)
            junction = np.clip(1 - (rho - RHO0) / 0.12, 0, 1) ** 2
            free = np.clip(0.9 * prof ** 0.3 + 0.9 * junction, 0, 1.3)
            v, f, gl = blade(xy, z, depth, WID * (0.6 + 0.4 * prof), free, 0.04)
            mesh.add(v, f, 1, gl)

        for u0 in full_u:                              # full gills, stem to margin
            add_gill(u0, u0, RHO0 + 0.01, RHOC)
        for k in range(N_FULL - 1):                    # shorter gills between them, some forked
            um = (full_u[k] + full_u[k + 1]) / 2
            rho_start = g.uniform(0.30, 0.42)
            if g.uniform() < 0.28:
                rf = g.uniform(0.52, 0.66)
                add_gill(um, um, rho_start, rf + 0.02, 0.9)
                add_gill(um, um - du / 4, rf, RHOC, 0.8)
                add_gill(um, um + du / 4, rf, RHOC, 0.8)
            else:
                add_gill(um, um, rho_start, RHOC, 0.9)
                for uq in (um - du / 4, um + du / 4):
                    if g.uniform() < B["short_gill_chance"]:
                        add_gill(uq, uq, g.uniform(0.58, 0.72), RHOC, 0.65)
        for _ in range(N_FULL):                        # cross-veins near the stem
            k = int(g.integers(0, N_FULL - 1))
            rho = g.uniform(0.12, 0.45)
            u = np.linspace(full_u[k], full_u[k + 1], 8)
            r = rho * Rad(u)
            xy = np.column_stack([r * np.cos(THETA * u), r * np.sin(THETA * u)])
            z = z_bot(np.full(8, rho), u) + 0.1 * thick(rho, u)
            prof = np.sin(np.linspace(0, 1, 8) * math.pi) ** 0.5
            depth = DMAX * g.uniform(0.25, 0.5) * (0.4 + 0.6 * prof)
            v, f, gl = blade(xy, z, depth, np.full(8, WID * 0.8), np.full(8, 0.95), 0.04)
            mesh.add(v, f, 1, gl)

        L = R0 * g.uniform(0.22, 0.32)                 # the stem: short, lateral, narrowing into the wood
        rs0, rs1 = R0 * 0.07, R0 * 0.13
        zc = (z_top(RHO0, 0) + z_bot(RHO0, 0)) / 2 - 0.25 * T0
        NA, NL = 20, 10
        sv, sg = [], []
        for i in range(NL):
            t = i / (NL - 1)
            x = -L + t * (L + RHO0 * R0 * 2.2)
            rr = rs0 + (rs1 - rs0) * t ** 0.8
            for j in range(NA):
                a = 2 * math.pi * j / NA
                sv.append((x, rr * math.cos(a), zc + rr * math.sin(a) * 0.85 - 0.15 * T0 * t))
                sg.append(0.03 + 0.25 * t ** 3)
        sf = [(i * NA + j, i * NA + (j + 1) % NA, (i + 1) * NA + (j + 1) % NA, (i + 1) * NA + j)
              for i in range(NL - 1) for j in range(NA)]
        mesh.add(np.array(sv), sf, 2, np.array(sg))
        return mesh.build(name, mats), L

    # --------------------------------------------------------------------------------------------- the instrument
    def cyl(name, r, depth, z, mat, verts=96, bevel=0.0, fill="NGON"):
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=(0, 0, z),
                                            end_fill_type=fill)
        o = bpy.context.active_object
        o.name = name
        o.data.materials.append(mat)
        if bevel:
            b = o.modifiers.new("bevel", "BEVEL")
            b.width = bevel
            b.segments = 3
        bpy.ops.object.shade_smooth()
        return o

    def torus(name, major, minor, z, mat):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=(0, 0, z),
                                         major_segments=128, minor_segments=16)
        o = bpy.context.active_object
        o.name = name
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        return o

    def sphere(r, loc, mat):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24)
        o = bpy.context.active_object
        o.data.materials.append(mat)
        bpy.ops.object.shade_smooth()
        return o

    def street_mat():
        """A wet cobbled street: setts of joint_m a side (Voronoi cells), darker and rougher in the joints, each sett a
        little lighter or darker than the next, and puddles (a noise over wet_cover of the ground) that are near
        mirrors, so the culture's glow is doubled in the water near the plinth. The puddles' place comes from the seed,
        through a stream of its own, so the culture's placement is the same as before the street existed."""
        W = P["ground"]
        grng = random.Random(seed ^ 0x5EED5)
        m = bpy.data.materials.new("wet_street")
        m.use_nodes = True
        nt = m.node_tree
        p = nt.nodes.get("Principled BSDF")
        tc = nt.nodes.new("ShaderNodeTexCoord")
        vor = nt.nodes.new("ShaderNodeTexVoronoi")       # the setts
        vor.feature = "DISTANCE_TO_EDGE"
        vor.inputs["Scale"].default_value = 1.0 / W["joint_m"]
        nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
        cell = nt.nodes.new("ShaderNodeTexVoronoi")      # each sett's own shade
        cell.inputs["Scale"].default_value = 1.0 / W["joint_m"]
        nt.links.new(tc.outputs["Object"], cell.inputs["Vector"])
        joint = nt.nodes.new("ShaderNodeMapRange")      # 0 in a joint, 1 on a sett's face
        joint.inputs["From Min"].default_value = 0.0
        joint.inputs["From Max"].default_value = 0.07
        nt.links.new(vor.outputs["Distance"], joint.inputs["Value"])
        mapping = nt.nodes.new("ShaderNodeMapping")      # the puddles, moved by the seed
        mapping.inputs["Location"].default_value = (grng.uniform(-50, 50), grng.uniform(-50, 50), 0.0)
        nt.links.new(tc.outputs["Object"], mapping.inputs["Vector"])
        pud = nt.nodes.new("ShaderNodeTexNoise")
        pud.inputs["Scale"].default_value = 0.9
        pud.inputs["Detail"].default_value = 3.0
        nt.links.new(mapping.outputs["Vector"], pud.inputs["Vector"])
        wet = nt.nodes.new("ShaderNodeMapRange")        # 1 under water, 0 dry, a short shore between
        wet.inputs["From Min"].default_value = 1.0 - W["wet_cover"] - 0.03
        wet.inputs["From Max"].default_value = 1.0 - W["wet_cover"] + 0.03
        nt.links.new(pud.outputs["Fac"], wet.inputs["Value"])
        rough = nt.nodes.new("ShaderNodeMapRange")      # dry roughness to wet roughness
        rough.inputs["To Min"].default_value = W["rough_dry"]
        rough.inputs["To Max"].default_value = W["rough_wet"]
        nt.links.new(wet.outputs["Result"], rough.inputs["Value"])
        nt.links.new(rough.outputs["Result"], p.inputs["Roughness"])
        shade = nt.nodes.new("ShaderNodeMapRange")      # a sett's shade, times the joint's darkening
        shade.inputs["To Min"].default_value = 0.12    # granite setts, about 0.12 to 0.26 of the light back when dry
        shade.inputs["To Max"].default_value = 0.26
        nt.links.new(cell.outputs["Distance"], shade.inputs["Value"])
        dark = nt.nodes.new("ShaderNodeMath")
        dark.operation = "MULTIPLY"
        nt.links.new(shade.outputs["Result"], dark.inputs[0])
        nt.links.new(joint.outputs["Result"], dark.inputs[1])
        soak = nt.nodes.new("ShaderNodeMapRange")       # wet stone is darker: half its dry shade under water
        soak.inputs["To Min"].default_value = 1.0
        soak.inputs["To Max"].default_value = 0.5
        nt.links.new(wet.outputs["Result"], soak.inputs["Value"])
        soaked = nt.nodes.new("ShaderNodeMath")
        soaked.operation = "MULTIPLY"
        nt.links.new(dark.outputs["Value"], soaked.inputs[0])
        nt.links.new(soak.outputs["Result"], soaked.inputs[1])
        rgb = nt.nodes.new("ShaderNodeCombineColor")
        for k in ("Red", "Green", "Blue"):
            nt.links.new(soaked.outputs["Value"], rgb.inputs[k])
        nt.links.new(rgb.outputs["Color"], p.inputs["Base Color"])
        flat = nt.nodes.new("ShaderNodeMath")           # water lies flat: no bump under a puddle
        flat.operation = "SUBTRACT"
        flat.inputs[0].default_value = 1.0
        nt.links.new(wet.outputs["Result"], flat.inputs[1])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Distance"].default_value = 0.01
        nt.links.new(flat.outputs["Value"], bump.inputs["Strength"])
        nt.links.new(joint.outputs["Result"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], p.inputs["Normal"])
        return m

    street = street_mat()
    ceramic = principled("ceramic", (0.09, 0.095, 0.105), rough=0.6)   # a dark glazed ceramic
    metal = principled("metal", (0.16, 0.17, 0.19), rough=0.35, metal=1.0)
    wood = principled("wood", (0.05, 0.045, 0.04), rough=0.8)
    glass = glass_mat()
    fungus = fungus_materials()          # flesh, gill, stem, hymenium: material slots 0 to 3 of every cap

    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(street)

    instrument = []
    instrument.append(cyl("plinth", plinth_r, plinth_h, plinth_h / 2, ceramic, bevel=0.03))
    instrument.append(torus("collar", col_r + 0.035, 0.03, plinth_h + 0.01, metal))
    col_z = plinth_h + col_h / 2
    instrument.append(cyl("glass", col_r, col_h, col_z, glass, verts=128, fill="NOTHING"))   # one open surface
    cyl("spindle", spindle_r, col_h, col_z, wood, verts=32)
    top = plinth_h + col_h
    brim_r = col_r + I["brim_overhang_m"]
    kh = brim_r / 0.43                   # the hood's radii are drawn for a 0.43 m brim and scaled to this one
    instrument.append(cyl("brim", brim_r, 0.035, top + 0.02, ceramic, bevel=0.01))
    # the louvered ceramic hood: the culture breathes through stacked rings, a lantern's chimney turned inside out
    for k, (rr, dz) in enumerate(I["louvers"]):
        instrument.append(torus(f"louver_{k}", rr * kh, 0.026, top + dz, ceramic))
    hood_top = max(dz for _, dz in I["louvers"])
    instrument.append(cyl("hood_core", 0.12 * kh, hood_top + 0.03, top + (hood_top + 0.03) / 2 + 0.05, ceramic, verts=48))
    instrument.append(sphere(0.055, (0, 0, top + hood_top + 0.12), metal))
    # the humidity flask that feeds the culture, beside the plinth, and its feed pipe into the column's foot
    flask_r = I["flask_radius_m"]
    if flask_r > 0:
        fx = plinth_r + flask_r + 0.02
        instrument.append(sphere(flask_r, (fx, 0.05, plinth_h + 0.14), glass))
        pipe_len = fx - flask_r - col_r + 0.04
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.015, depth=pipe_len,
                                            location=(col_r - 0.02 + pipe_len / 2, 0.035, plinth_h + 0.14),
                                            rotation=(0, math.radians(90), 0))
        bpy.context.active_object.data.materials.append(metal)

    # ------------------------------------------------------------------------------------------------ the culture
    cam_az = math.radians(K["azimuth_deg"])
    noink = bpy.data.collections.new("NoInk")
    scene.collection.children.link(noink)
    caps = []
    front, back = C["front_caps"], C["back_caps"]
    z_lo, z_hi = plinth_h + C["floor_m"], plinth_h + col_h - C["ceiling_m"]
    span = max(front - 1, 1)
    plan = []
    # front caps alternate left and right of the camera's line, so each shows its gill fan; smaller caps behind
    for i in range(front):
        side = -1 if i % 2 == 0 else 1
        z = z_lo + (z_hi - z_lo) * i / span + rng.uniform(-0.025, 0.025)
        plan.append((z, cam_az + side * math.radians(rng.uniform(*C["front_spread_deg"])),
                     rng.uniform(*C["front_radius_m"]), rng.uniform(*C["front_raise_deg"])))
    for i in range(back):
        z = z_lo + (z_hi - z_lo) * min(1.0, (0.5 + 2 * i) / span) + rng.uniform(-0.02, 0.02)
        plan.append((z, cam_az + math.pi + math.radians(rng.uniform(-C["back_spread_deg"], C["back_spread_deg"])),
                     rng.uniform(*C["back_radius_m"]), rng.uniform(*C["back_raise_deg"])))
    for i, (z, phi, R0, raise_deg) in enumerate(plan):
        ob, L = bracket(rng.randrange(1, 1 << 30), R0, f"cap_{i:02d}", fungus)
        off = spindle_r + L * 0.6
        ob.location = (off * math.cos(phi), off * math.sin(phi), z)
        # a small roll, the margin raised (a negative turn about the cap's own y), then the facing
        ob.rotation_euler = (math.radians(rng.uniform(-5, 5)), -math.radians(raise_deg), phi)
        noink.objects.link(ob)
        caps.append((ob, R0, phi))
    for c in list(ground.users_collection):
        c.objects.unlink(ground)
    noink.objects.link(ground)

    # a cold rim light behind, only when the file asks for one: at 0 W there is none, and the culture is the only light
    if A["rim_energy_w"] > 0:
        bpy.ops.object.light_add(type="AREA", location=(-2.2, 3.0, 3.2))
        rim = bpy.context.active_object
        rim.data.energy = A["rim_energy_w"]
        rim.data.size = 2.5
        rim.data.color = (0.62, 0.72, 0.95)
        rim.rotation_euler = (math.radians(-55), math.radians(-30), math.radians(-150))

    # the night sky (slice 2, 2026-11-21): any exposure long enough to record the culture records the sky's faint light
    # too, so the sky is a dome of light air.sky_ambient strong, in air.sky_rgb, SKY_DOME_M out over the street and
    # inside the fog. Its light crosses that much fog before it reaches the lamp, so it lights the fog behind the
    # instrument and rims it, and stays far below the culture (artifact_schema.json bounds it, and keeps it under the
    # culture's own dimmest glow). The world's background stays black: it is infinitely far, behind infinite fog.
    if A["sky_ambient"] > 0:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=SKY_DOME_M, location=(0, 0, 0), segments=64, ring_count=32)
        dome = bpy.context.active_object
        dome.name = "sky"
        bm = bmesh.new()
        bm.from_mesh(dome.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-6], context="VERTS")   # the half below the street
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])                                           # facing in
        bm.to_mesh(dome.data)
        bm.free()
        sky = bpy.data.materials.new("night_sky")
        sky.use_nodes = True
        snt = sky.node_tree
        for n in list(snt.nodes):
            snt.nodes.remove(n)
        em = snt.nodes.new("ShaderNodeEmission")
        em.inputs["Color"].default_value = (*A["sky_rgb"], 1)
        em.inputs["Strength"].default_value = A["sky_ambient"]
        so = snt.nodes.new("ShaderNodeOutputMaterial")
        snt.links.new(em.outputs["Emission"], so.inputs["Surface"])
        dome.data.materials.append(sky)
        for c in list(dome.users_collection):
            c.objects.unlink(dome)
        noink.objects.link(dome)

    # fog: the world scatters the gills' light, and the sky's, into a halo
    world = bpy.data.worlds.new("void")
    scene.world = world
    world.use_nodes = True
    wn = world.node_tree
    wn.nodes.get("Background").inputs["Color"].default_value = (0.0, 0.0, 0.0, 1)
    vol = wn.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = A["fog_density"]
    vol.inputs["Anisotropy"].default_value = A["fog_anisotropy"]
    vol.inputs["Color"].default_value = (0.80, 0.86, 1.0, 1)
    wn.links.new(vol.outputs["Volume"], wn.nodes.get("World Output").inputs["Volume"])

    # -------------------------------------------------------------------------------------------------- the camera
    d = K["distance_m"]
    bpy.ops.object.camera_add(location=(d * math.cos(cam_az), d * math.sin(cam_az), K["height_m"]))
    cam = bpy.context.active_object
    cam.data.lens = 35
    scene.camera = cam
    bpy.ops.object.empty_add(location=(0, 0, K["look_at_m"]))
    tc = cam.constraints.new("TRACK_TO")
    tc.target = bpy.context.active_object
    tc.track_axis = "TRACK_NEGATIVE_Z"
    tc.up_axis = "UP_Y"
    scene.render.resolution_x, scene.render.resolution_y = R["width"], R["height"]

    def world_points(o):
        """The object's own vertices in world space (a bounding box's corners overstate a cylinder by up to 41%)."""
        return [o.matrix_world @ v.co for v in o.data.vertices]

    # set the lens so the instrument fills `fill` of the frame's height, or `fill_x` of its width about the axis if
    # that binds first, then shift the frame so the instrument's foot sits at `ground_y` of the height from the top;
    # the column stays centred left to right
    bpy.context.view_layer.update()
    pts = [p for o in instrument for p in world_points(o)]
    cam.data.shift_y = 0.0
    for _ in range(3):
        bpy.context.view_layer.update()
        ys = [world_to_camera_view(scene, cam, p).y for p in pts]
        xs = [world_to_camera_view(scene, cam, p).x for p in pts]
        cam.data.lens *= min(K["fill"] / (max(ys) - min(ys)), K["fill_x"] / 2 / max(abs(x - 0.5) for x in xs))
    bpy.context.view_layer.update()
    ys = [world_to_camera_view(scene, cam, p).y for p in pts]
    # shift_y is in units of the frame's larger side; camera-view y runs 0 at the foot of the frame to 1 at its top
    tall = R["height"] / max(R["width"], R["height"])
    cam.data.shift_y = (min(ys) - (1.0 - K["ground_y"])) * tall
    bpy.context.view_layer.update()

    def measure() -> dict:
        """Each cap's width on the plate, the angle the camera sees its underside at, overlaps, the farthest point."""
        plate_w, aspect = R["plate_width_px"], R["height"] / R["width"]
        cam_loc = cam.matrix_world.translation
        trees, far, rows = [], 0.0, []
        for ob, R0, phi in caps:
            mw = ob.matrix_world
            co = np.empty(len(ob.data.vertices) * 3, dtype=np.float64)
            ob.data.vertices.foreach_get("co", co)
            co = co.reshape(-1, 3)
            w = co @ np.array(mw)[:3, :3].T + np.array(mw)[:3, 3]
            far = max(far, float(np.hypot(w[:, 0], w[:, 1]).max()))
            sp = [world_to_camera_view(scene, cam, Vector(p)) for p in w[::5]]
            sx, sy = [p.x for p in sp], [p.y for p in sp]
            centre = Vector(w.mean(axis=0))
            under = (mw.to_3x3() @ Vector((0, 0, -1))).normalized()
            seen = math.degrees(math.asin(max(-1, min(1, under.dot((cam_loc - centre).normalized())))))
            rows.append({
                "cap": ob.name, "radius_m": round(R0, 3), "height_m": round(ob.location.z, 3),
                "faces_deg": round((math.degrees(phi - cam_az) + 180) % 360 - 180, 1),
                "plate_px": round((max(sx) - min(sx)) * plate_w, 1),
                "box_px": [round(min(sx) * plate_w), round((1 - max(sy)) * plate_w * aspect),
                           round(max(sx) * plate_w), round((1 - min(sy)) * plate_w * aspect)],
                "underside_seen_deg": round(seen, 1), "verts": len(ob.data.vertices),
            })
            polys = [tuple(p.vertices) for p in ob.data.polygons]
            trees.append((ob.name, BVHTree.FromPolygons([tuple(v) for v in w], polys)))
        overlaps = []
        for i in range(len(trees)):
            for j in range(i + 1, len(trees)):
                hits = trees[i][1].overlap(trees[j][1])
                if hits:
                    overlaps.append({"a": trees[i][0], "b": trees[j][0], "face_pairs": len(hits)})
        # where the instrument's top and foot fell, as shares of the frame's height from its top: the page stands
        # Earth's lamp on these two lines
        vy = [world_to_camera_view(scene, cam, p).y for p in pts]
        frame = {"top": round(1.0 - max(vy), 4), "ground": round(1.0 - min(vy), 4)}

        # the instrument's parts as boxes on the frame, [left, top, right, bottom] as shares of its width and height
        # from the top left: the hood (brim and louvers, above the column), the plinth, the glass column. light()
        # reads the render's pixels in them.
        def box(points):
            v = [world_to_camera_view(scene, cam, p) for p in points]
            return [round(min(p.x for p in v), 4), round(1 - max(p.y for p in v), 4),
                    round(max(p.x for p in v), 4), round(1 - min(p.y for p in v), 4)]
        regions = {
            "hood": box([p for p in pts if p.z >= top - 1e-6]),
            "plinth": box([p for p in pts if p.z <= plinth_h + 1e-6]),
            "column": box([p for o in instrument if o.name == "glass" for p in world_points(o)]),
        }
        return {"caps": rows, "overlaps": overlaps, "farthest_m": round(far, 3), "glass_radius_m": col_r,
                "lens_mm": round(cam.data.lens, 2), "shift_y": round(cam.data.shift_y, 4), "frame": frame,
                "regions": regions}

    return scene, cam, noink, measure


FAMILIES = {"shelf-culture-lamp": build_shelf_culture_lamp}


def light(out: str, m: dict, plate_w: int, aspect: float) -> dict:
    """The render's own pixels, read back from the file it wrote: luma (Rec. 709 weights on the stored, display-encoded
    values, 0 to 1) in the regions the measure named. The culture is the union of the caps' boxes; the sky is the band
    above the hood, clear of the column. Percentiles, so one hot pixel decides nothing."""
    import bpy
    import numpy as np
    img = bpy.data.images.load(out)
    img.colorspace_settings.name = "Non-Color"           # the stored values as they are, not linearised
    W, H = img.size
    a = np.empty(W * H * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(H, W, 4)[::-1]                         # Blender's rows run from the foot of the image
    luma = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

    def mask(b):
        x0, y0, x1, y1 = b
        k = np.zeros((H, W), dtype=bool)
        k[max(0, int(y0 * H)):min(H, int(math.ceil(y1 * H))), max(0, int(x0 * W)):min(W, int(math.ceil(x1 * W)))] = True
        return k
    culture = np.zeros((H, W), dtype=bool)
    for c in m["caps"]:
        x0, y0, x1, y1 = c["box_px"]
        culture |= mask([x0 / plate_w, y0 / (plate_w * aspect), x1 / plate_w, y1 / (plate_w * aspect)])
    reg = m["regions"]
    column = mask(reg["column"])
    hood, plinth = mask(reg["hood"]), mask(reg["plinth"])
    sky = mask([0, 0, 1, max(0.02, reg["hood"][1] - 0.01)]) & ~mask([reg["column"][0], 0, reg["column"][2], 1])
    q = lambda k, p: round(float(np.percentile(luma[k], p)), 4) if k.any() else None
    bpy.data.images.remove(img)
    return {
        "culture_p99": q(culture, 99), "beyond_column_p995": q(~column, 99.5),
        "sky_p50": q(sky, 50), "hood_p10": q(hood, 10), "hood_p50": q(hood, 50), "hood_p90": q(hood, 90),
        "plinth_p10": q(plinth, 10), "plinth_p50": q(plinth, 50), "plinth_p90": q(plinth, 90),
        "frame_p50": q(np.ones((H, W), dtype=bool), 50),
    }


def render(scene, noink, P: dict, out: str, samples: int, percent: int, threads: int | None = None) -> float:
    import bpy
    R, ink = P["render"], P["ink"]
    scene.render.resolution_percentage = percent
    # hairline drafting edges on the instrument, never on the living culture
    scene.render.use_freestyle = ink["thickness_px"] > 0
    scene.render.line_thickness_mode = "ABSOLUTE"
    scene.render.line_thickness = ink["thickness_px"]
    vl = scene.view_layers[0]
    vl.freestyle_settings.use_culling = True
    ls = vl.freestyle_settings.linesets[0] if vl.freestyle_settings.linesets else vl.freestyle_settings.linesets.new("ink")
    ls.select_by_collection = True
    ls.collection = noink
    ls.collection_negation = "EXCLUSIVE"
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.linestyle.color = tuple(ink["rgb"])
    ls.linestyle.alpha = ink["alpha"]
    ls.linestyle.thickness = ink["thickness_px"]

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.time_limit = R["time_limit_s"]
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    if threads:
        scene.render.threads_mode = "FIXED"
        scene.render.threads = threads
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 4
    scene.cycles.transparent_max_bounces = 8
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast"
    scene.view_settings.exposure = P["exposure"]["stops"]   # the long exposure: a dim source recorded over minutes
    scene.render.filepath = out
    fmt = scene.render.image_settings
    if out.lower().endswith(".webp"):
        fmt.file_format = "WEBP"
        fmt.color_mode = "RGB"
        fmt.quality = R["webp_quality"]
    else:
        fmt.file_format = "PNG"
        fmt.color_mode = "RGB"
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t1


def main() -> None:
    t0 = time.time()
    opts = parse_argv(sys.argv)
    P = read_params(opts["params"])
    seed = opts["seed"] if opts["seed"] is not None else P["seed"]
    samples = opts["samples"] if opts["samples"] is not None else P["render"]["samples"]
    percent = opts["percent"] if opts["percent"] is not None else P["render"]["percent"]
    scene, cam, noink, measure = FAMILIES[P["family"]](P, seed)
    m = measure()
    for row in m["caps"]:
        print(f"[artifact] {row['cap']}: {row['plate_px']} plate px wide, underside seen at "
              f"{row['underside_seen_deg']} deg, faces {row['faces_deg']} deg from the camera")
    for o in m["overlaps"]:
        print(f"[artifact] overlap {o['a']} x {o['b']}: {o['face_pairs']} face pairs")
    print(f"[artifact] farthest culture point {m['farthest_m']} m from the axis (glass radius {m['glass_radius_m']})")
    print(f"[artifact] built in {time.time() - t0:.1f} s")
    if opts["measure"]:
        return
    import bpy
    out = opts["out"]
    seconds = render(scene, noink, P, out, samples, percent, opts["threads"])
    m["light"] = light(out, m, P["render"]["plate_width_px"], P["render"]["height"] / P["render"]["width"])
    print(f"[artifact] light: {m['light']}")
    stem = os.path.splitext(out)[0]
    record = {
        "artifact": P["artifact"], "family": P["family"], "title": P["title"], "tag": P["tag"],
        "seed": seed, "params": os.path.basename(opts["params"]), "params_sha256": params_sha256(opts["params"]),
        "image": os.path.basename(out), "image_bytes": os.path.getsize(out),
        "width": round(P["render"]["width"] * percent / 100), "height": round(P["render"]["height"] * percent / 100),
        "blender": bpy.app.version_string, "engine": "Cycles, CPU", "samples": samples,
        "denoiser": "OpenImageDenoise", "exposure_stops": P["exposure"]["stops"],
        "time_limit_s": P["render"]["time_limit_s"], "render_s": round(seconds, 1),
        "rendered_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "measure": m,
    }
    with open(stem + ".render.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(record, f, indent=2)
        f.write("\n")
    print(f"[artifact] render {seconds:.1f} s, total {time.time() - t0:.1f} s -> {out}")


if __name__ == "__main__":
    main()
