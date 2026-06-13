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
from socketserver import ThreadingMixIn

sys.path.insert(0, os.path.dirname(__file__))
try:
    from gatekeeper.base import DB_DIR
    EVENTS_FILE = os.path.join(DB_DIR, "events.jsonl")
except Exception:
    EVENTS_FILE = os.path.join(os.path.expanduser("~"), ".token_gatekeeper", "events.jsonl")

PORT = 7700
DASHBOARD_HTML = os.path.join(os.path.dirname(__file__), "observer.html")

class ThreadingHTTPServer(ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

class ObserverHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass  # silence default logs

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return  # browser closed connection — not an error
        super().handle_error(request, client_address)

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
        """Server-Sent Events: replay existing events then tail for new ones."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        pos = 0
        # Replay all existing events
        if os.path.exists(EVENTS_FILE):
            try:
                with open(EVENTS_FILE, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            self.wfile.write(f"data: {line}\n\n".encode())
                self.wfile.flush()  # push replay to browser immediately
                pos = os.path.getsize(EVENTS_FILE)
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                return
        # Tail for new events + keepalive ping every 15 s
        last_ping = time.monotonic()
        try:
            while True:
                time.sleep(0.3)
                now = time.monotonic()
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
                    last_ping = now
                elif now - last_ping > 15:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    last_ping = now
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, OSError):
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
    server = ThreadingHTTPServer(("localhost", args.port), ObserverHandler)
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
