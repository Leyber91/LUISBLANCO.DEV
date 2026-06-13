import argparse
import os
import sys
import json
import ssl
import base64
import math
import re
import urllib.request
from datetime import datetime
from gatekeeper.base import GatekeeperTool


def strip_markdown_fencing(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` wrappers from LLM output."""
    text = text.strip()
    # Remove ```json\n...\n``` or ```xml\n...\n``` etc.
    match = re.match(r'^```[\w]*\n?(.*?)\n?```$', text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return text


def compute_layout(description: dict) -> dict:
    """
    Compute exact pixel positions for all nodes and groups.
    Deterministic — no API call needed. Crystallized local logic.
    Returns description dict augmented with _layout key.
    """
    nodes  = description.get('nodes', [])
    groups = description.get('groups', [])
    edges  = description.get('edges', [])
    layout_dir = description.get('layout', 'left-to-right')

    # Build group membership map
    node_group = {}
    for g in groups:
        for nid in g.get('contained_node_ids', []):
            node_group[nid] = g['group_label']

    # Assign column by BFS order from edge topology
    from collections import defaultdict, deque
    in_edges  = defaultdict(list)
    out_edges = defaultdict(list)
    for e in edges:
        src = e.get('from_id', '')
        dst = e.get('to_id', '')
        out_edges[src].append(dst)
        in_edges[dst].append(src)

    # Topological column assignment
    all_ids   = [n['id'] for n in nodes]
    col       = {nid: 0 for nid in all_ids}
    roots     = [nid for nid in all_ids if not in_edges[nid]]
    if not roots:
        roots = all_ids[:1]
    queue = deque(roots)
    visited = set()
    while queue:
        nid = queue.popleft()
        if nid in visited:
            continue
        visited.add(nid)
        for child in out_edges[nid]:
            col[child] = max(col[child], col[nid] + 1)
            queue.append(child)

    # Group nodes by column
    cols = defaultdict(list)
    for nid in all_ids:
        cols[col[nid]].append(nid)

    # Canvas sizing
    n_cols   = max(col.values()) + 1 if col else 1
    max_rows = max(len(v) for v in cols.values()) if cols else 1
    NODE_W, NODE_H = 160, 70
    COL_GAP, ROW_GAP = 120, 30
    MARGIN_X, MARGIN_Y = 60, 80
    canvas_w = MARGIN_X * 2 + n_cols * NODE_W + (n_cols - 1) * COL_GAP
    canvas_h = MARGIN_Y * 2 + max_rows * NODE_H + (max_rows - 1) * ROW_GAP
    canvas_w = max(canvas_w, 900)
    canvas_h = max(canvas_h, 400)

    # Assign (x, y) to each node
    positions = {}
    for c_idx in sorted(cols.keys()):
        col_nodes = cols[c_idx]
        n_rows    = len(col_nodes)
        total_h   = n_rows * NODE_H + (n_rows - 1) * ROW_GAP
        start_y   = (canvas_h - total_h) // 2
        for r_idx, nid in enumerate(col_nodes):
            x = MARGIN_X + c_idx * (NODE_W + COL_GAP)
            y = start_y + r_idx * (NODE_H + ROW_GAP)
            positions[nid] = {'x': x, 'y': y, 'w': NODE_W, 'h': NODE_H,
                               'cx': x + NODE_W // 2, 'cy': y + NODE_H // 2}

    # Compute group bounding boxes (with padding)
    PAD = 18
    group_boxes = []
    for g in groups:
        contained = [positions[nid] for nid in g.get('contained_node_ids', [])
                     if nid in positions]
        if not contained:
            continue
        gx = min(p['x'] for p in contained) - PAD
        gy = min(p['y'] for p in contained) - PAD
        gx2 = max(p['x'] + p['w'] for p in contained) + PAD
        gy2 = max(p['y'] + p['h'] for p in contained) + PAD
        group_boxes.append({'label': g['group_label'],
                            'x': gx, 'y': gy, 'w': gx2 - gx, 'h': gy2 - gy})

    return {
        'canvas_w': canvas_w,
        'canvas_h': canvas_h,
        'node_w': NODE_W,
        'node_h': NODE_H,
        'positions': positions,
        'group_boxes': group_boxes,
    }


class DiagramToSvgCommand(GatekeeperTool):
    @property
    def command_name(self) -> str:
        return "diagram_to_svg"

    @property
    def description(self) -> str:
        return "Two-stage NIM pipeline: vision model analyzes diagram image → Nemotron generates SVG code"

    def configure_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument("--image", type=str, required=True, help="Path to input diagram image")
        parser.add_argument("--output", type=str, help="Output SVG path (default: blueprints/svg/<basename>.svg)")

    def execute(self, args: argparse.Namespace, manifest: dict) -> int:
        api_key = os.environ.get("NVIDIA_API_KEY")
        if not api_key:
            print("Error: NVIDIA_API_KEY environment variable not set")
            return 1

        image_path = args.image
        if not os.path.exists(image_path):
            print(f"Error: File not found: {image_path}")
            return 1

        # Configuration
        NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
        VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl"
        REASONING_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"

        ctx = ssl.create_default_context()

        def encode_image_base64(image_path):
            """Read image file and encode to base64 data URI."""
            ext = os.path.splitext(image_path)[1].lower()
            mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp"}.get(ext, "image/jpeg")
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return f"data:{mime};base64,{b64}"

        def call_nim(model, messages, max_tokens=4096, temperature=0.2, stream=False):
            """Call the NIM API with the given model and messages."""
            payload = json.dumps({
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream
            }).encode("utf-8")

            req = urllib.request.Request(NIM_URL, data=payload, headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            })

            with urllib.request.urlopen(req, context=ctx) as resp:
                result = json.loads(resp.read().decode("utf-8"))

            return result["choices"][0]["message"]["content"]

        def call_nim_stream(model, messages, max_tokens=8192, temperature=0.3):
            """Call NIM API with streaming, for Nemotron reasoning model."""
            body = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True
            }
            # Add reasoning budget for Nemotron Ultra
            if "ultra" in model:
                body["reasoning_budget"] = max_tokens
                body["chat_template_kwargs"] = {"enable_thinking": True}

            payload = json.dumps(body).encode("utf-8")

            req = urllib.request.Request(NIM_URL, data=payload, headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            })

            full_content = ""
            reasoning_content = ""

            with urllib.request.urlopen(req, context=ctx) as resp:
                buffer = ""
                while True:
                    chunk = resp.read(1024)
                    if not chunk:
                        break
                    buffer += chunk.decode("utf-8")
                    while "\n" in buffer:
                        line, buffer = buffer.split("\n", 1)
                        line = line.strip()
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            delta = data["choices"][0].get("delta", {})
                            # Capture reasoning content (thinking)
                            rc = delta.get("reasoning_content", "")
                            if rc:
                                reasoning_content += rc
                                print(f"\033[90m{rc}\033[0m", end="", flush=True)
                            # Capture main content
                            c = delta.get("content", "")
                            if c:
                                full_content += c
                                print(c, end="", flush=True)
                        except (json.JSONDecodeError, KeyError, IndexError):
                            pass

            print()  # newline after streaming
            return full_content, reasoning_content

        # ─── STAGE 1: Vision Analysis ────────────────────────────────────
        def stage1_analyze_image(image_path):
            """Use vision model to describe the diagram in structured form."""
            print(f"\n{'='*60}")
            print(f"STAGE 1: Vision Analysis ({VISION_MODEL})")
            print(f"Image: {os.path.basename(image_path)}")
            print(f"{'='*60}\n")

            image_uri = encode_image_base64(image_path)

            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": """Analyze this image carefully. First, classify what type of image it is:
- ARCHITECTURE_DIAGRAM (shows system components, services, data flow)
- FLOWCHART (shows process steps, decision points)
- NETWORK_TOPOLOGY (shows nodes and connections)
- INFOGRAPHIC (shows statistics, comparisons)
- SCREENSHOT (UI screenshot)
- PHOTO (real-world photograph)
- OTHER

If it is a DIAGRAM type (architecture, flowchart, network), extract ALL elements:

1. NODES: List every labeled box/icon/component with:
   - id (short identifier)
   - label (exact text shown)
   - type (service/database/user/agent/model/container)
   - visual_style (color, shape if notable)

2. EDGES: List every connection/arrow between nodes:
   - from_id → to_id
   - label (text on the arrow, if any)
   - style (solid/dashed, direction)

3. GROUPS: Any subgroups/sections with:
   - group_label
   - contained_node_ids

4. LAYOUT: General layout direction (left-to-right, top-to-bottom, etc.)

Output your answer as a JSON object. Be precise and complete."""
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": image_uri}
                        }
                    ]
                }
            ]

            result = call_nim(VISION_MODEL, messages, max_tokens=4096, temperature=0.1)
            print(result)
            return result

        # ─── STAGE 2: SVG Generation ─────────────────────────────────────
        def stage2_generate_svg(diagram_description_str, image_name, layout):
            """Use Nemotron to generate SVG at pre-computed positions."""
            print(f"\n{'='*60}")
            print(f"STAGE 2: SVG Generation ({REASONING_MODEL})")
            print(f"{'='*60}\n")

            pos_lines = []
            for nid, p in layout['positions'].items():
                pos_lines.append(f"  {nid}: x={p['x']} y={p['y']} w={p['w']} h={p['h']} center=({p['cx']},{p['cy']})")
            group_lines = []
            for g in layout['group_boxes']:
                group_lines.append(f"  '{g['label']}': x={g['x']} y={g['y']} w={g['w']} h={g['h']}")

            position_block = "\n".join(pos_lines)
            group_block    = "\n".join(group_lines) if group_lines else "  (none)"

            messages = [
                {
                    "role": "system",
                    "content": """You are a precise SVG renderer for architecture diagrams.
You receive a JSON diagram description AND pre-computed pixel positions.
You MUST draw every node at EXACTLY the given x/y coordinates — do not move them.
You MUST connect edges from the exact center of the source node to the exact center of the target node.
You MUST draw group bounding boxes at the given x/y/w/h.

Style rules (NVIDIA dark theme):
- Canvas background: #0d1117
- Subtle grid: stroke #1a2332, 40px spacing
- Green nodes (service/model): fill #76b900 top, #5a8a00 bottom gradient, stroke #76b900
- Orange nodes (database/data): fill #d4812a top, #a05a00 bottom gradient, stroke #d4812a  
- Node text: fill #ffffff, font-size 13px, font-weight 600, centered in node
- Node subtitle (type): fill #ffffff, opacity 0.65, font-size 10px
- Group box: stroke #76b900, stroke-dasharray 6 3, stroke-width 1.5, fill rgba(118,185,0,0.04)
- Group label: fill #76b900, font-size 10px, font-weight 500, above the box
- Edges: stroke #76b900, stroke-width 2, opacity 0.7, arrowhead marker fill #76b900
- Title: fill #76b900, font-size 16px, font-weight 700, centered top

Output ONLY valid SVG starting with <svg. No markdown, no explanation."""
                },
                {
                    "role": "user",
                    "content": f"""Render this NVIDIA blueprint diagram as SVG.

Canvas: {layout['canvas_w']}×{layout['canvas_h']}px
Blueprint: {image_name}

DIAGRAM DESCRIPTION:
{diagram_description_str}

PRE-COMPUTED NODE POSITIONS (use these EXACTLY):
{position_block}

PRE-COMPUTED GROUP BOUNDING BOXES (use these EXACTLY):
{group_block}

Instructions:
1. Open <svg> with viewBox="0 0 {layout['canvas_w']} {layout['canvas_h']}" and a background rect
2. Define <defs>: arrowhead marker, gradients (greenGrad, orangeGrad, groupGrad)
3. Draw group boxes first (bottom layer)
4. Draw edges as <path> from node center to node center with arrowhead
5. Draw each node as <rect> at its exact x/y/w/h, then <text> centered
6. Add title at top center

Generate the complete SVG now."""
                }
            ]

            content, reasoning = call_nim_stream(REASONING_MODEL, messages, max_tokens=8192, temperature=0.2)
            return content

        # Main execution
        basename = os.path.splitext(os.path.basename(image_path))[0]
        # Resolve output path relative to image location if not absolute
        if args.output:
            output_path = args.output
        else:
            svg_dir = os.path.join(os.path.dirname(os.path.dirname(image_path)), "svg")
            output_path = os.path.join(svg_dir, f"{basename}.svg")

        # Ensure output directory exists
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

        # Stage 1: Analyze
        raw_description = stage1_analyze_image(image_path)

        # Strip markdown fencing if present
        clean_description = strip_markdown_fencing(raw_description)

        # Parse JSON for layout computation
        try:
            desc_dict = json.loads(clean_description)
        except json.JSONDecodeError:
            print("WARNING: Could not parse description as JSON — using raw text for Stage 2")
            desc_dict = {}

        # Save clean description
        desc_path = os.path.join(os.path.dirname(os.path.abspath(output_path)), f"{basename}_description.json")
        with open(desc_path, "w", encoding="utf-8") as f:
            json.dump(desc_dict if desc_dict else {"raw": clean_description}, f, indent=2, ensure_ascii=False)
        print(f"\nDescription saved to: {desc_path}")

        # Compute layout locally (zero API cost)
        if desc_dict and desc_dict.get('nodes'):
            layout = compute_layout(desc_dict)
            print(f"Layout computed: {layout['canvas_w']}x{layout['canvas_h']}px, "
                  f"{len(layout['positions'])} nodes, {len(layout['group_boxes'])} groups")
        else:
            layout = {'canvas_w': 1200, 'canvas_h': 600, 'node_w': 160, 'node_h': 70,
                      'positions': {}, 'group_boxes': []}

        # Stage 2: Generate SVG with pre-computed positions
        svg_code = stage2_generate_svg(clean_description, basename, layout)

        # Clean up SVG (strip markdown fencing if present)
        if "```svg" in svg_code:
            svg_code = svg_code.split("```svg")[1].split("```")[0]
        elif "```xml" in svg_code:
            svg_code = svg_code.split("```xml")[1].split("```")[0]
        elif "```" in svg_code:
            parts = svg_code.split("```")
            if len(parts) >= 3:
                svg_code = parts[1]

        svg_code = svg_code.strip()

        # Ensure it starts with SVG
        if not svg_code.startswith("<svg") and not svg_code.startswith("<?xml"):
            # Try to find the SVG tag
            idx = svg_code.find("<svg")
            if idx != -1:
                svg_code = svg_code[idx:]

        # Save SVG
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(svg_code)

        print(f"\n{'='*60}")
        print(f"SUCCESS: SVG saved to {output_path}")
        print(f"Description: {desc_path}")
        print(f"{'='*60}")

        # Log to entity state
        state = {
            "entity_id": "nim-pipeline-v1",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "task": "diagram_to_svg",
            "input_image": image_path,
            "output_svg": output_path,
            "vision_model": VISION_MODEL,
            "reasoning_model": REASONING_MODEL,
            "status": "completed"
        }

        state_path = os.path.expanduser("~/.token_gatekeeper/pipeline_log.jsonl")
        os.makedirs(os.path.dirname(state_path), exist_ok=True)
        with open(state_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(state) + "\n")

        return 0
