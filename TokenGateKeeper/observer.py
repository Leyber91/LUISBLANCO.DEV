"""
observer.py — TokenGateKeeper Observability Tower
Real-time dashboard server. No external dependencies.

Usage:
  python observer.py          # serves on http://localhost:7700
  python observer.py --port 8800
"""
import http.server
import json
import os
import sys
import argparse
import threading
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
try:
    from gatekeeper.base import DB_DIR
    EVENTS_FILE = os.path.join(DB_DIR, "events.jsonl")
except Exception:
    EVENTS_FILE = os.path.join(os.path.expanduser("~"), ".token_gatekeeper", "events.jsonl")

PORT = 7700
DASHBOARD_HTML = os.path.join(os.path.dirname(__file__), "observer.html")

class ObserverHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass  # silence default logs

    def do_GET(self):
        if self.path == "/" or self.path == "/observer.html":
            self._serve_dashboard()
        elif self.path == "/events":
            self._serve_sse()
        elif self.path == "/events.json":
            self._serve_events_json()
        elif self.path == "/status":
            self._serve_status()
        else:
            self.send_response(404); self.end_headers()

    def _serve_dashboard(self):
        if os.path.exists(DASHBOARD_HTML):
            with open(DASHBOARD_HTML, "rb") as f:
                body = f.read()
        else:
            body = b"<html><body>observer.html not found</body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_sse(self):
        """Server-Sent Events: tail events.jsonl and stream new lines."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        pos = 0
        # Send all existing events first
        if os.path.exists(EVENTS_FILE):
            with open(EVENTS_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            self.wfile.write(f"data: {line}\n\n".encode())
                        except Exception:
                            return
            pos = os.path.getsize(EVENTS_FILE)
        # Then tail for new events
        try:
            while True:
                time.sleep(0.3)
                if not os.path.exists(EVENTS_FILE):
                    continue
                size = os.path.getsize(EVENTS_FILE)
                if size > pos:
                    with open(EVENTS_FILE, "r", encoding="utf-8") as f:
                        f.seek(pos)
                        for line in f:
                            line = line.strip()
                            if line:
                                self.wfile.write(f"data: {line}\n\n".encode())
                    self.wfile.flush()
                    pos = size
        except Exception:
            return

    def _serve_events_json(self):
        """Return all events as JSON array (for initial load)."""
        events = []
        if os.path.exists(EVENTS_FILE):
            with open(EVENTS_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            events.append(json.loads(line))
                        except Exception:
                            pass
        body = json.dumps(events, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _serve_status(self):
        status = {
            "events_file": EVENTS_FILE,
            "events_exist": os.path.exists(EVENTS_FILE),
            "events_size": os.path.getsize(EVENTS_FILE) if os.path.exists(EVENTS_FILE) else 0,
            "server_time": datetime.now(timezone.utc).isoformat(),
        }
        body = json.dumps(status).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def main():
    parser = argparse.ArgumentParser(description="TokenGateKeeper Observability Tower")
    parser.add_argument("--port", type=int, default=PORT)
    args = parser.parse_args()
    server = http.server.HTTPServer(("localhost", args.port), ObserverHandler)
    print(f"\n  OBSERVABILITY TOWER")
    print(f"  Dashboard : http://localhost:{args.port}/")
    print(f"  Events    : http://localhost:{args.port}/events  (SSE)")
    print(f"  Watching  : {EVENTS_FILE}")
    print(f"  Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Tower offline.")

if __name__ == "__main__":
    main()
