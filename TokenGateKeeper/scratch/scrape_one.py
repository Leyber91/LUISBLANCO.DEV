import urllib.request
import re
import os

url = "https://build.nvidia.com/nvidia/vulnerability-analysis-for-container-security"
req = urllib.request.Request(
    url, 
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
)

try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
    matches = re.findall(r'self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)', html, re.DOTALL)
    full_text = ""
    for m in matches:
        escaped = m.replace('\\"', '"').replace('\\n', '\n').replace('\\/', '/')
        full_text += escaped
        
    print(f"Reassembled RSC stream length: {len(full_text)}")
    
    # Write to a file for review
    os.makedirs("scratch", exist_ok=True)
    with open("scratch/vuln_security_raw.txt", "w", encoding="utf-8") as f:
        f.write(full_text)
        
    # Find readable sentences
    sentences = re.findall(r'"([^"]{30,500})"', full_text)
    print("\nCandidate sentences found:")
    count = 0
    for s in sentences:
        if any(w in s for w in ["vulnerability", "container", "security", "Triton", "NIM", "Llama", "agent"]):
            print(f"- {s[:150]}...")
            count += 1
            if count > 10:
                break
except Exception as e:
    print(f"Error: {e}")
