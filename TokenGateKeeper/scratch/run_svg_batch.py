"""
run_svg_batch.py — Batch SVG generation for all blueprint images.
Runs independently of the agent loop (no turn limit, no competing API calls).
Skips images that already have a corresponding .svg file.
Logs progress to scratch/svg_progress.jsonl.

Usage:
  python scratch/run_svg_batch.py
  python scratch/run_svg_batch.py --dry-run       # list what would be processed
  python scratch/run_svg_batch.py --limit 3       # process only first N
  python scratch/run_svg_batch.py --skip-existing # skip if SVG already exists (default)
  python scratch/run_svg_batch.py --force         # reprocess even if SVG exists
"""

import os, sys, json, subprocess, time, argparse
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES_DIR  = os.path.join(BASE, "blueprints", "images")
SVG_DIR     = os.path.join(BASE, "blueprints", "svg")
PROGRESS    = os.path.join(BASE, "scratch", "svg_progress.jsonl")
GATEKEEPER  = os.path.join(BASE, "gatekeeper.py")

def log(entry):
    with open(PROGRESS, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")

def load_progress():
    done = set()
    if os.path.exists(PROGRESS):
        with open(PROGRESS, encoding="utf-8") as f:
            for line in f:
                try:
                    e = json.loads(line)
                    if e.get("status") == "ok":
                        done.add(e["image"])
                except Exception:
                    pass
    return done

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run",      action="store_true")
    parser.add_argument("--limit",        type=int, default=0)
    parser.add_argument("--force",        action="store_true")
    parser.add_argument("--skip-existing",action="store_true", default=True)
    args = parser.parse_args()

    api_key = os.environ.get("NVIDIA_API_KEY", "")
    if not api_key and not args.dry_run:
        print("ERROR: NVIDIA_API_KEY not set."); sys.exit(1)

    os.makedirs(SVG_DIR, exist_ok=True)

    # Collect images sorted by size (smallest first = fastest test)
    images = []
    for fname in os.listdir(IMAGES_DIR):
        if fname.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            fpath = os.path.join(IMAGES_DIR, fname)
            images.append((os.path.getsize(fpath), fname, fpath))
    images.sort()   # ascending size

    done_set = load_progress() if not args.force else set()

    print(f"\n{'='*60}")
    print(f"  SVG BATCH PROCESSOR")
    print(f"  Images found : {len(images)}")
    print(f"  Already done : {len(done_set)}")
    print(f"  Output dir   : {SVG_DIR}")
    print(f"  Progress log : {PROGRESS}")
    print(f"{'='*60}\n")

    processed = 0
    for size_bytes, fname, fpath in images:
        stem        = os.path.splitext(fname)[0]
        output_svg  = os.path.join(SVG_DIR, f"{stem}.svg")
        size_kb     = size_bytes // 1024

        # Skip check
        if not args.force and fname in done_set:
            print(f"  [SKIP] {fname} (already in progress log)")
            continue
        if not args.force and os.path.exists(output_svg) and os.path.getsize(output_svg) > 100:
            print(f"  [SKIP] {fname} → SVG exists ({os.path.getsize(output_svg)} bytes)")
            log({"ts": datetime.now(timezone.utc).isoformat(), "image": fname,
                 "status": "ok", "svg_bytes": os.path.getsize(output_svg), "note": "pre-existing"})
            continue

        if args.dry_run:
            print(f"  [DRY]  {fname:55s} ({size_kb:5d} KB)")
            continue

        print(f"\n  [{processed+1}/{len(images)}] Processing: {fname}  ({size_kb} KB)")
        t0 = time.time()

        cmd = [
            sys.executable, GATEKEEPER,
            "diagram_to_svg",
            "--image", fpath,
            "--output", output_svg,
        ]

        result = subprocess.run(
            cmd, cwd=BASE,
            capture_output=False,  # show live output
            text=True,
            env={**os.environ, "NVIDIA_API_KEY": api_key},
        )

        elapsed = time.time() - t0
        svg_bytes = os.path.getsize(output_svg) if os.path.exists(output_svg) else 0

        if result.returncode == 0 and svg_bytes > 100:
            status = "ok"
            print(f"  ✓ Done in {elapsed:.0f}s → {svg_bytes} bytes")
        else:
            status = "fail"
            print(f"  ✗ FAILED (exit {result.returncode}, {svg_bytes} bytes) after {elapsed:.0f}s")

        log({
            "ts":        datetime.now(timezone.utc).isoformat(),
            "image":     fname,
            "status":    status,
            "svg_bytes": svg_bytes,
            "elapsed_s": round(elapsed, 1),
            "exit_code": result.returncode,
        })

        processed += 1
        if args.limit and processed >= args.limit:
            print(f"\n  Limit reached ({args.limit}). Stopping.")
            break

        # Brief pause between images to avoid rate limit issues
        if processed < len(images):
            time.sleep(3)

    # Summary
    print(f"\n{'='*60}")
    entries = []
    if os.path.exists(PROGRESS):
        with open(PROGRESS, encoding="utf-8") as f:
            for line in f:
                try: entries.append(json.loads(line))
                except: pass
    ok   = sum(1 for e in entries if e.get("status") == "ok")
    fail = sum(1 for e in entries if e.get("status") == "fail")
    total_svg = sum(e.get("svg_bytes",0) for e in entries if e.get("status") == "ok")
    print(f"  BATCH COMPLETE — ok={ok}  fail={fail}  total SVG={total_svg//1024}KB")
    print(f"  Progress log: {PROGRESS}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
