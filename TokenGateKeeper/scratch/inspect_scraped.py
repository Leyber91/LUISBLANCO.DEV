import json
import re

scratchpad_path = r"C:\Users\Luis.Blanco\.gemini\antigravity-ide\brain\95db78d9-8bb0-4a0c-adc8-ad4767454684\browser\scratchpad_izu5gtx6.md"

with open(scratchpad_path, "r", encoding="utf-8") as f:
    text = f.read()

# The json content is enclosed in ```json ... ```
match = re.search(r"```json\n(.*?)\n```", text, re.DOTALL)
if match:
    json_str = match.group(1)
    data = json.loads(json_str)
    print(f"Loaded {len(data)} blueprints from JSON.")
    for key, value in data.items():
        title = value.get("title", "")
        desc = value.get("description", "")
        sys_req = value.get("sysRequirements", {})
        print(f"- {key}: {title}")
        print(f"  Description: {desc[:100]}...")
        print(f"  Requirements Keys: {list(sys_req.keys())}")
else:
    print("No JSON block found.")
