with open("scratch/vuln_security_raw.txt", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'(?i)vuln|security|container', text)]
print(f"Found {len(matches)} matches.")
for idx, m in enumerate(matches[:20]):
    start = max(0, m - 50)
    end = min(len(text), m + 150)
    context = text[start:end].replace('\n', ' ')
    print(f"Match {idx} at {m}: ...{context}...")
