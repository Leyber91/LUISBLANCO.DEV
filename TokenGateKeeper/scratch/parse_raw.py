import re

with open("scratch/vuln_security_raw.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Let's find all chunks that look like paragraphs (e.g. sequence of letters and spaces of length > 80)
chunks = re.findall(r'[A-Za-z0-9\s\.,;:!?\-\'\"\\/]{80,1000}', text)
print(f"Found {len(chunks)} long chunks.")

# Let's clean up backslashes and unicode escapes and display them
for idx, chunk in enumerate(chunks[:50]):
    cleaned = chunk.encode().decode('unicode-escape', errors='ignore')
    cleaned = re.sub(r'[\r\n\t]+', ' ', cleaned).strip()
    if len(cleaned) > 80:
        print(f"{idx}: {cleaned[:200]}")
