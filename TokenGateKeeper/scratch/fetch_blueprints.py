import urllib.request
import re

url = "https://build.nvidia.com/nvidia/nsight-copilot"

req = urllib.request.Request(
    url, 
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
)

try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
        # Search for any script tags with JSON or state data
        script_data = re.findall(r'<script id="([^"]+)"[^>]*>(.*?)</script>', html)
        print("Found script tags:")
        for s_id, s_content in script_data:
            print(f"  ID: {s_id} (Length: {len(s_content)})")
            
        # Also check for __NEXT_DATA__ in standard scripts (sometimes it has different tags)
        next_matches = re.findall(r'__NEXT_DATA__', html)
        print(f"__NEXT_DATA__ string occurrences: {len(next_matches)}")
        
        # Write whole HTML to preview.html
        with open("TokenGateKeeper/scratch/preview.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("Wrote full HTML to TokenGateKeeper/scratch/preview.html")

except Exception as e:
    print(f"Error: {e}")
