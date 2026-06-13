import re
import json

with open("TokenGateKeeper/scratch/preview.html", "r", encoding="utf-8") as f:
    html = f.read()

# Find all blocks like self.__next_f.push([1,"..."]) or self.__next_f.push([0,...])
matches = re.findall(r'self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)', html, re.DOTALL)

# Reassemble the stream
full_text = ""
for m in matches:
    # Unescape double quotes and newlines
    escaped = m.replace('\\"', '"').replace('\\n', '\n').replace('\\/', '/')
    full_text += escaped

# Let's write the raw reassembled stream to a text file to read it
with open("TokenGateKeeper/scratch/rsc_stream.txt", "w", encoding="utf-8") as f:
    f.write(full_text)

print(f"Reassembled RSC stream length: {len(full_text)}")

# Extract JSON-like structures or text strings from the stream
# In RSC stream, JSON strings are often escaped and look like: {"id":"...",...}
json_strings = re.findall(r'(\{[^{}]+\})', full_text)
print(f"Found {len(json_strings)} candidate JSON-like sub-strings.")

# Let's search for readable text paragraphs or headings in the reassembled stream
# Filter lines that have substantial text (words) and look like descriptions
print("\nSample lines of reassembled stream containing text:")
lines = full_text.split('\n')
text_lines = []
for line in lines:
    clean = re.sub(r'\\[a-zA-Z0-9]+', ' ', line)
    clean = re.sub(r'[^a-zA-Z0-9\s.,;:!?\'"\-]', ' ', clean)
    words = clean.split()
    if len(words) > 10 and not any(w.startswith('I') for w in words):
        text_lines.append(clean.strip())

# Print first 20 lines
for tl in text_lines[:20]:
    print(" - ", tl)
