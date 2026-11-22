"""Offline: draft a plain name and a parts tree for each of the 42 drafted worlds, one model call per artifact.

Run once, by hand, never by the site. Each call goes through the core test's isolated harness (launch.call: no tools, no MCP
servers, outside git, cached by tag), so a rerun costs nothing for finished calls.

  python -I make_parts.py            (needs `claude` on PATH)

Writes, beside this file:
  parts.json   {id: {"name": str, "parts": [...]}}   the 42 validated trees
  worlds.json  the catalogue: id, domain, kind, driver, job, five steps (technology, needs), artifact function and form,
               status "drafted", provenance, name (plain) and draft_name (the drafted one)
  calls.json   one record per call: tag, attempt, cost_usd, duration_s, tokens, from the cache record

The source is the repository's _reference copy of the drafts (SOURCE below); it is read here and nowhere at runtime.
"""
from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORE = Path(r"C:\Users\Luis.Blanco\dev\LUISBLANCO.DEV\_reference\labs\concepts\alt-reality\orthogonal\kill_test\core")
SOURCE = Path(r"C:\Users\Luis.Blanco\dev\LUISBLANCO.DEV\_reference\labs\plans\alt-reality\catalog\drafted_42.json")
MODEL = "claude-sonnet-5-5"

KINDS = ["column", "plinth", "box", "lattice", "vessel", "mast", "mirror", "disc", "gimbal", "wing", "rotor", "shutter",
         "dial", "pipe", "sphere"]
MATERIALS = ["glass", "ceramic", "wood", "bronze", "stone", "fabric", "bone", "living"]
MIN_PARTS, MAX_PARTS = 3, 14
MAX_COORD = 60.0   # metres: a catalogue artifact is a building at most


def validate(tree: object) -> list[str]:
    """Every reason a reply is not a valid parts tree; empty when it is one. The page's test reads the same rules."""
    errs: list[str] = []
    if not isinstance(tree, dict):
        return ["not an object"]
    name = tree.get("name")
    if not isinstance(name, str) or not 3 <= len(name.strip()) <= 60:
        errs.append("name must be a string of 3 to 60 characters")
    elif "'s" in name or "\u2019s" in name:
        errs.append("name has a possessive")
    parts = tree.get("parts")
    if not isinstance(parts, list) or not MIN_PARTS <= len(parts) <= MAX_PARTS:
        return errs + [f"parts must be a list of {MIN_PARTS} to {MAX_PARTS}"]
    for i, p in enumerate(parts):
        if not isinstance(p, dict) or set(p) != {"kind", "size", "at", "rot", "material", "emits"}:
            errs.append(f"part {i}: keys must be exactly kind, size, at, rot, material, emits")
            continue
        if p["kind"] not in KINDS:
            errs.append(f"part {i}: kind {p['kind']!r}")
        if p["material"] not in MATERIALS:
            errs.append(f"part {i}: material {p['material']!r}")
        if not isinstance(p["emits"], bool):
            errs.append(f"part {i}: emits must be true or false")
        for key, lo, hi in (("size", 0.001, MAX_COORD), ("at", -MAX_COORD, MAX_COORD), ("rot", -360, 360)):
            v = p[key]
            ok = (isinstance(v, list) and len(v) == 3 and all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in v)
                  and all(lo <= x <= hi for x in v))
            if not ok:
                errs.append(f"part {i}: {key} must be three numbers in [{lo}, {hi}]")
    return errs


def prompt_for(e: dict, retry_reasons: list[str] | None = None) -> str:
    a = e["artifact"]
    steps = "\n".join(f"{i + 1}. {s['technology']} (needs: {s['needs']})" for i, s in enumerate(e["steps"]))
    p = f"""You are drawing one invented artifact as a small tree of simple solid parts, for a catalogue page.

The artifact's job: {e['job']}
Its function: {a['function']}
Its form as drafted: {a['form']}
The five steps of technology that lead to it:
{steps}

Reply with JSON only, no prose and no code fence:
{{"name": "...", "parts": [...]}}

"name": a plain descriptive name of two to five words, for example "Gyro bearing case". No possessives, no coined words, no
proper nouns, nothing a reader would have to look up.
"parts": between {MIN_PARTS} and {MAX_PARTS} parts that together read as the artifact when seen from outside. Each part is
{{"kind": one of {"|".join(KINDS)}, "size": [w,h,d] in metres, "at": [x,y,z] in metres (y is up, the ground is y=0, the
part's centre), "rot": [x,y,z] in degrees, "material": one of {"|".join(MATERIALS)}, "emits": true or false}}.
Use "emits": true only for parts that give light or glow in use. Keep the whole artifact inside about 30 metres of the
origin, with its main mass near the centre. Use every number as a plain JSON number."""
    if retry_reasons:
        p += "\n\nYour previous reply was refused for these reasons; fix them:\n- " + "\n- ".join(retry_reasons)
    return p


def extract_json(text: str) -> object:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    a, b = t.find("{"), t.rfind("}")
    return json.loads(t[a:b + 1])


def one(launch, e: dict) -> tuple[str, dict, list[dict]]:
    records: list[dict] = []
    reasons: list[str] | None = None
    for attempt in (1, 2):
        tag = f"parts-v1-{e['id']}" + ("" if attempt == 1 else "-retry")
        rec = launch.call(prompt_for(e, reasons), MODEL, "parts", tag=tag)
        records.append({"id": e["id"], "tag": tag, "attempt": attempt, "cost_usd": rec.get("cost_usd"),
                        "duration_s": rec.get("duration_s"), "usage": rec.get("usage")})
        try:
            tree = extract_json(rec["text"])
        except (ValueError, json.JSONDecodeError) as ex:
            reasons = [f"not valid JSON ({ex})"]
            continue
        reasons = validate(tree)
        if not reasons:
            tree["name"] = tree["name"].strip()
            return e["id"], tree, records
    raise SystemExit(f"{e['id']}: no valid tree after a retry: {reasons}")


def main() -> None:
    sys.path.insert(0, str(CORE))
    import launch  # the core test's isolated harness

    src = json.loads(SOURCE.read_text(encoding="utf-8"))
    entries = src["entries"]
    assert len(entries) == 42 and all(len(e["steps"]) == 5 for e in entries)
    with ThreadPoolExecutor(max_workers=4) as ex:
        done = list(ex.map(lambda e: one(launch, e), entries))
    parts = {i: t for i, t, _ in done}
    calls = [r for _, _, rs in done for r in rs]
    worlds = []
    for e in entries:
        t = parts[e["id"]]
        a = e["artifact"]
        worlds.append({
            "id": e["id"], "domain": e["domain"], "kind": e["kind"], "driver": e["driver"], "job": e["job"],
            "steps": [{"technology": s["technology"], "needs": s["needs"]} for s in e["steps"]],
            "artifact": {"name": t["name"], "draft_name": a["name"], "function": a["function"], "form": a["form"]},
            "status": "drafted", "provenance": e["provenance"],
        })
    out = {"about": "The catalogue of 42 drafted worlds. Names and parts trees were drafted offline by make_parts.py.",
           "model": MODEL, "worlds": worlds}
    (HERE / "worlds.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (HERE / "parts.json").write_text(json.dumps({"kinds": KINDS, "materials": MATERIALS, "trees": {i: {"parts": t["parts"]} for i, t in parts.items()}},
                                                indent=1) + "\n", encoding="utf-8")
    (HERE / "calls.json").write_text(json.dumps(calls, indent=1) + "\n", encoding="utf-8")
    cost = sum(c["cost_usd"] or 0 for c in calls)
    print(f"{len(calls)} calls for {len(parts)} trees, cost {cost:.4f} USD")


if __name__ == "__main__":
    main()
