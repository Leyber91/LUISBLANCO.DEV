import argparse
import os
import sys
import json
import ssl
import base64
import urllib.request
from datetime import datetime
from gatekeeper.base import GatekeeperTool


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
        def stage2_generate_svg(diagram_description, image_name):
            """Use Nemotron to generate SVG code from the structured description."""
            print(f"\n{'='*60}")
            print(f"STAGE 2: SVG Generation ({REASONING_MODEL})")
            print(f"{'='*60}\n")

            messages = [
                {
                    "role": "system",
                    "content": """You are a diagram-to-SVG converter. Given a structured JSON description of a diagram, generate clean, well-formatted SVG code that faithfully reproduces the diagram.

Rules:
- Use a dark background (#1a1a2e or #0d0d0d) matching NVIDIA's dark theme
- Use NVIDIA green (#76b900) for primary elements
- Use white (#ffffff) text for labels
- Use clean, modern styling with rounded rectangles
- Draw arrows with arrowhead markers
- Group related elements in <g> tags
- Include proper viewBox for responsive sizing
- Make the SVG self-contained (no external dependencies)
- Output ONLY the SVG code, nothing else. No markdown fencing."""
                },
                {
                    "role": "user",
                    "content": f"""Convert this diagram description into an SVG:

{diagram_description}

The diagram is from NVIDIA blueprint: {image_name}
Generate the complete SVG code now."""
                }
            ]

            content, reasoning = call_nim_stream(REASONING_MODEL, messages, max_tokens=8192, temperature=0.3)
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
        description = stage1_analyze_image(image_path)

        # Save intermediate description
        desc_path = os.path.join(os.path.dirname(os.path.abspath(output_path)), f"{basename}_description.json")
        with open(desc_path, "w", encoding="utf-8") as f:
            f.write(description)
        print(f"\nDescription saved to: {desc_path}")

        # Stage 2: Generate SVG
        svg_code = stage2_generate_svg(description, basename)

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
