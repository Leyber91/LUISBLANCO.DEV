"""
agent.py — Nemotron coding agent with AEA tool-calling protocol.

Nemotron outputs <tool> XML blocks; the gatekeeper parses and dispatches them.
All tool calls are logged to the SQLite ledger (implied vs actual cost).
New tools auto-register by dropping a .py + .json pair in tools/.

Usage:
  python gatekeeper.py agent --task "fix the renderer crash" --cwd /path/to/repo
  python gatekeeper.py agent --task "add a login page" --cwd . --dry-run
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
import ssl
import uuid
import time
import fnmatch
from datetime import datetime, timezone
from gatekeeper.base import GatekeeperTool, init_db, estimate_tokens, DB_PATH, DB_DIR

import sqlite3

# ── Observability Event Emitter ───────────────────────────────────────────────
EVENTS_FILE = os.path.join(DB_DIR, "events.jsonl")
_current_session_id = None

def _emit(event_type, **data):
    """Write a structured event to events.jsonl for the Observability Tower."""
    try:
        os.makedirs(DB_DIR, exist_ok=True)
        event = {
            "ts":      datetime.now(timezone.utc).isoformat(),
            "session": _current_session_id,
            "type":    event_type,
            **data
        }
        with open(EVENTS_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception:
        pass  # Never let observability break the agent

# ── Nemotron API ──────────────────────────────────────────────────────────────
NIM_URL   = "https://integrate.api.nvidia.com/v1/chat/completions"
NIM_MODEL = "nvidia/nemotron-3-ultra-550b-a55b"
MAX_TURNS = 40          # safety limit — override with --max-turns
MAX_FILE_LINES = 300    # truncate files to this many lines per read
RATE_LIMIT_RPM = 38     # stay under 40 RPM hard limit

# ── AEA System Prompt ────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are a coding agent built on the Autonomous Entity Architecture (AEA).
You receive a task, reason carefully, then act using tools.

## TOOL CALLING PROTOCOL
Call tools using XML blocks. Think before each action.

<think>reasoning here — what you know, what you need next</think>

Available tools:

<tool name="read_file" path="FILEPATH" start="LINE" end="LINE"/>
  Read file contents. start/end are optional line numbers (1-indexed).
  Keep reads focused — max 300 lines at a time.

<tool name="list_dir" path="DIRPATH"/>
  List directory contents (one level).

<tool name="tree" path="DIRPATH" depth="3"/>
  Show full directory tree up to depth levels. Use first to explore unknown repos.
  Skips .git, node_modules, __pycache__. Default depth=3.

<tool name="find_files" path="DIRPATH" pattern="*.py" extensions="py,json" depth="5"/>
  Find files by glob pattern and/or extension across subtree.
  pattern: filename glob (e.g. "*.md"). extensions: comma list (e.g. "py,md,json").

<tool name="search_code" path="DIRPATH" pattern="REGEX" filter="*.js"/>
  Search for a pattern in files. filter is a glob (optional).

<tool name="edit_file" path="FILEPATH">
<old>EXACT_OLD_STRING</old>
<new>NEW_STRING</new>
</tool>
  Replace exact string in file. old must match the file exactly (whitespace included).
  Make one targeted edit per call. Do not replace large blocks — prefer minimal changes.

<tool name="new_file" path="FILEPATH">
FILE_CONTENT_HERE
</tool>
  Create a new file. Do not use on existing files.

<tool name="run_cmd" cmd="COMMAND" cwd="OPTIONAL_DIR"/>
  Run a shell command (PowerShell on Windows). Prefer read-only commands first.
  IMPORTANT: Do NOT use python -c "...". Instead write a .py file and run it.
  For imports: write 'import X; print("OK")' to a .py file, then run it.
  For write operations (git commit, npm install), always use dry-run first if possible.

<tool name="lookup_book" query="KEYWORD_OR_PHRASE"/>
  Search the Book of Luis concept graph (690 nodes) + raw idea atlas for prior art.
  Use this FIRST when designing any new system, memory mechanism, compression scheme,
  or architecture pattern. The book likely already has the solution.
  Returns matching concepts with cluster, essence, era, and status.

<tool name="done" summary="BRIEF_SUMMARY"/>
  Signal task complete. Provide a 1-2 sentence summary of what was done.

## RULES (AEA Law)
1. Read before writing. Never guess file contents.
2. One edit per edit_file call. Prefer minimal upstream fixes.
3. After EVERY new_file or edit_file: immediately verify with list_dir or read_file.
   If the file doesn't appear, the tool call failed — debug the cause before retrying.
4. Do NOT use python -c "..." on Windows/PowerShell. Write a .py file and run it.
5. If a pattern repeats, note it — it should be crystallized.
6. End every session with <tool name="done"/>.
7. Never output code without using a tool to write it.
8. When designing anything new: lookup_book FIRST. The solution likely already exists.
"""

# ── Tool Dispatcher ───────────────────────────────────────────────────────────
def tool_read_file(path, start=None, end=None, cwd="."):
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    if not os.path.exists(full):
        return f"ERROR: file not found: {full}"
    try:
        with open(full, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        s = (int(start) - 1) if start else 0
        e = int(end) if end else len(lines)
        e = min(e, s + MAX_FILE_LINES)
        selected = lines[s:e]
        numbered = [f"{s+i+1}\t{l}" for i, l in enumerate(selected)]
        truncated = len(lines) > e
        result = "".join(numbered)
        if truncated:
            result += f"\n... (truncated at line {e}, total {len(lines)} lines)"
        return result
    except Exception as ex:
        return f"ERROR reading file: {ex}"

def tool_list_dir(path, cwd="."):
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    if not os.path.exists(full):
        return f"ERROR: directory not found: {full}"
    try:
        entries = []
        for name in sorted(os.listdir(full)):
            fp = os.path.join(full, name)
            if os.path.isdir(fp):
                entries.append(f"[DIR]  {name}/")
            else:
                size = os.path.getsize(fp)
                entries.append(f"[FILE] {name}  ({size} bytes)")
        return "\n".join(entries) or "(empty)"
    except Exception as ex:
        return f"ERROR: {ex}"

def tool_find_files(path, pattern="*", extensions="", depth=5, cwd="."):
    """Find files by name pattern and/or extension, up to depth levels deep."""
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    if not os.path.exists(full):
        return f"ERROR: path not found: {full}"
    exts = [e.strip().lstrip('.') for e in extensions.split(',') if e.strip()] if extensions else []
    results = []
    skip = {".git", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache"}
    try:
        for root, dirs, files in os.walk(full):
            rel_root = os.path.relpath(root, full)
            cur_depth = 0 if rel_root == '.' else rel_root.count(os.sep) + 1
            dirs[:] = [d for d in sorted(dirs) if d not in skip and cur_depth < depth]
            for fname in sorted(files):
                if exts and not any(fname.endswith('.'+e) for e in exts):
                    continue
                if pattern != "*" and not fnmatch.fnmatch(fname, pattern):
                    continue
                fpath = os.path.join(root, fname)
                rel   = os.path.relpath(fpath, cwd)
                size  = os.path.getsize(fpath)
                results.append(f"{rel}  ({size}b)")
        return '\n'.join(results[:200]) + (f'\n... ({len(results)} total)' if len(results)>200 else '') or '(no matches)'
    except Exception as ex:
        return f"ERROR: {ex}"

def tool_tree(path, depth=3, cwd="."):
    """Show directory tree up to depth levels. Fast filesystem overview."""
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    if not os.path.exists(full):
        return f"ERROR: path not found: {full}"
    skip = {".git", "node_modules", "__pycache__", ".venv", "venv"}
    lines = [os.path.abspath(full)]
    def _walk(d, prefix, cur_depth):
        if cur_depth > depth:
            return
        try:
            entries = sorted(os.scandir(d), key=lambda e: (e.is_file(), e.name))
        except PermissionError:
            return
        for i, entry in enumerate(entries):
            if entry.name in skip:
                continue
            last = i == len(entries) - 1
            connector = '└── ' if last else '├── '
            if entry.is_dir():
                lines.append(f"{prefix}{connector}{entry.name}/")
                ext = '    ' if last else '│   '
                _walk(entry.path, prefix + ext, cur_depth + 1)
            else:
                size = entry.stat().st_size
                lines.append(f"{prefix}{connector}{entry.name}  ({size}b)")
    _walk(full, '', 1)
    return '\n'.join(lines[:300]) + (f'\n... (truncated)' if len(lines)>300 else '')

def tool_search_code(path, pattern, file_filter="*", cwd="."):
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    results = []
    try:
        rx = re.compile(pattern, re.IGNORECASE)
        for root, dirs, files in os.walk(full):
            dirs[:] = [d for d in dirs if d not in (".git", "node_modules", "__pycache__")]
            for fname in files:
                if fnmatch.fnmatch(fname, file_filter):
                    fpath = os.path.join(root, fname)
                    try:
                        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                            for i, line in enumerate(f, 1):
                                if rx.search(line):
                                    rel = os.path.relpath(fpath, cwd)
                                    results.append(f"{rel}:{i}: {line.rstrip()}")
                    except Exception:
                        pass
        if not results:
            return "No matches found."
        return "\n".join(results[:60]) + ("\n... (truncated)" if len(results) > 60 else "")
    except re.error as ex:
        return f"ERROR: invalid regex: {ex}"

def tool_edit_file(path, old_string, new_string, cwd="."):
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    if not os.path.exists(full):
        return f"ERROR: file not found: {full}"
    try:
        with open(full, "r", encoding="utf-8") as f:
            content = f.read()
        if old_string not in content:
            return f"ERROR: old_string not found in {path}. Check exact whitespace/indentation."
        count = content.count(old_string)
        if count > 1:
            return f"ERROR: old_string appears {count} times — make it more specific."
        new_content = content.replace(old_string, new_string, 1)
        with open(full, "w", encoding="utf-8") as f:
            f.write(new_content)
        return f"OK: edited {path}"
    except Exception as ex:
        return f"ERROR: {ex}"

def tool_new_file(path, content, cwd="."):
    full = os.path.join(cwd, path) if not os.path.isabs(path) else path
    if os.path.exists(full):
        return f"ERROR: file already exists: {full}. Use edit_file instead."
    try:
        os.makedirs(os.path.dirname(full) or ".", exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(content)
        return f"OK: created {path}"
    except Exception as ex:
        return f"ERROR: {ex}"

# ── Book Lookup ────────────────────────────────────────────────────────────────
CONCEPT_GRAPH_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..",
    "src", "core", "concept_graph.json"
)
RAW_ATLAS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..",
    "register", "work", "00_raw_concepts.json"
)

def tool_lookup_book(query):
    """Search concept_graph.json + raw atlas for relevant prior art."""
    terms = [t.lower().strip() for t in re.split(r'[\s/,+]+', query) if t.strip()]
    if not terms:
        return "ERROR: empty query"
    results = []

    # Search concept graph (nodes have id, label, part, tier)
    try:
        cg_path = os.path.abspath(CONCEPT_GRAPH_PATH)
        if os.path.exists(cg_path):
            with open(cg_path, "r", encoding="utf-8") as f:
                cg = json.load(f)
            for node in cg.get("nodes", []):
                label = node.get("label", "").lower()
                nid   = node.get("id", "").lower()
                if any(t in label or t in nid for t in terms):
                    results.append(
                        f"[GRAPH] {node.get('id','?')} | {node.get('label','?')} "
                        f"| part={node.get('part','?')} tier={node.get('tier','?')}"
                    )
    except Exception as ex:
        results.append(f"[GRAPH ERROR] {ex}")

    # Search raw atlas (has cluster, essence, era, status, potential)
    try:
        ra_path = os.path.abspath(RAW_ATLAS_PATH)
        if os.path.exists(ra_path):
            with open(ra_path, "r", encoding="utf-8") as f:
                atlas = json.load(f)
            for entry in atlas:
                name    = entry.get("name", "").lower()
                essence = entry.get("essence", "").lower()
                cluster = entry.get("cluster", "").lower()
                if any(t in name or t in essence or t in cluster for t in terms):
                    results.append(
                        f"[ATLAS] {entry.get('name','?')} | "
                        f"cluster={entry.get('cluster','?')} era={entry.get('era','?')} "
                        f"status={entry.get('status','?')} | "
                        f"{entry.get('essence','')[:120]}"
                    )
    except Exception as ex:
        results.append(f"[ATLAS ERROR] {ex}")

    if not results:
        return f"No matches found for: {query}"
    return "\n".join(results[:20]) + (f"\n... ({len(results)} total, showing 20)" if len(results) > 20 else "")

def tool_run_cmd(cmd, cwd=".", dry_run=False):
    if dry_run:
        return f"[DRY-RUN] would execute: {cmd}"
    try:
        result = subprocess.run(
            cmd, shell=True, cwd=cwd,
            capture_output=True, text=True, timeout=30
        )
        out = result.stdout[-3000:] if len(result.stdout) > 3000 else result.stdout
        err = result.stderr[-1000:] if len(result.stderr) > 1000 else result.stderr
        return (out + err).strip() or "(no output)"
    except subprocess.TimeoutExpired:
        return "ERROR: command timed out after 30s"
    except Exception as ex:
        return f"ERROR: {ex}"

# ── XML Tool Parser ───────────────────────────────────────────────────────────
def parse_tool_calls(text):
    """Extract all <tool ...> blocks from Nemotron's response."""
    calls = []
    # Self-closing: <tool name="..." attr="..." />
    for m in re.finditer(r'<tool\s+([^>]*?)\/>', text, re.DOTALL):
        attrs = _parse_attrs(m.group(1))
        calls.append({"attrs": attrs, "body": None, "raw": m.group(0)})
    # Block: <tool name="...">...</tool>  (also accept </tool_file> as closing tag)
    for m in re.finditer(r'<tool\s+([^>]*?)>(.*?)</tool(?:_file)?>', text, re.DOTALL):
        attrs = _parse_attrs(m.group(1))
        calls.append({"attrs": attrs, "body": m.group(2), "raw": m.group(0)})
    return calls

def _parse_attrs(attr_str):
    attrs = {}
    for m in re.finditer(r'(\w+)=["\']([^"\']*)["\']', attr_str):
        attrs[m.group(1)] = m.group(2)
    return attrs

def dispatch_tool(call, cwd, dry_run):
    attrs = call["attrs"]
    body  = call["body"] or ""
    name  = attrs.get("name", "")

    if name == "read_file":
        return tool_read_file(attrs.get("path",""), attrs.get("start"), attrs.get("end"), cwd)
    elif name == "list_dir":
        return tool_list_dir(attrs.get("path","."), cwd)
    elif name == "find_files":
        return tool_find_files(attrs.get("path","."), attrs.get("pattern","*"),
                               attrs.get("extensions",""), int(attrs.get("depth",5)), cwd)
    elif name == "tree":
        return tool_tree(attrs.get("path","."), int(attrs.get("depth",3)), cwd)
    elif name == "search_code":
        return tool_search_code(attrs.get("path","."), attrs.get("pattern",""), attrs.get("filter","*"), cwd)
    elif name == "edit_file":
        old_m = re.search(r'<old>(.*?)</old>', body, re.DOTALL)
        new_m = re.search(r'<new>(.*?)</new>', body, re.DOTALL)
        if not old_m or not new_m:
            return "ERROR: edit_file requires <old>...</old> and <new>...</new> blocks"
        if dry_run:
            return f"[DRY-RUN] would edit {attrs.get('path','')}:\n  OLD: {old_m.group(1)[:80]}...\n  NEW: {new_m.group(1)[:80]}..."
        return tool_edit_file(attrs.get("path",""), old_m.group(1), new_m.group(1), cwd)
    elif name == "new_file":
        if dry_run:
            return f"[DRY-RUN] would create {attrs.get('path','')}"
        return tool_new_file(attrs.get("path",""), body.lstrip("\n"), cwd)
    elif name == "run_cmd":
        return tool_run_cmd(attrs.get("cmd",""), attrs.get("cwd", cwd), dry_run)
    elif name == "lookup_book":
        return tool_lookup_book(attrs.get("query", ""))
    elif name == "done":
        return "__DONE__:" + attrs.get("summary", "Task complete.")
    else:
        return f"ERROR: unknown tool '{name}'"

# ── Nemotron API Call (SSE streaming with reasoning traces) ──────────────────
def call_nemotron(messages, api_key, verbose=False):
    payload = json.dumps({
        "model": NIM_MODEL,
        "messages": messages,
        "temperature": 1,
        "top_p": 0.95,
        "max_tokens": 8192,
        "reasoning_budget": 8192,
        "chat_template_kwargs": {"enable_thinking": True},
        "stream": True,
    }).encode("utf-8")

    req = urllib.request.Request(NIM_URL, data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Accept", "application/json")

    ctx = ssl.create_default_context()
    thinking_buf = []
    content_buf  = []
    usage        = {}

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=120) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8").strip()
                if not line.startswith("data: "):
                    continue
                chunk = line[6:]
                if chunk == "[DONE]":
                    break
                try:
                    data = json.loads(chunk)
                except json.JSONDecodeError:
                    continue
                # Final usage payload has empty choices
                if not data.get("choices"):
                    usage = data.get("usage", {})
                    continue
                delta = data["choices"][0].get("delta", {})
                # Reasoning trace (thinking)
                rc = delta.get("reasoning_content") or ""
                if rc:
                    thinking_buf.append(rc)
                    if verbose:
                        print(rc, end="", flush=True)
                # Response content
                cc = delta.get("content") or ""
                if cc:
                    content_buf.append(cc)
                    if verbose:
                        print(cc, end="", flush=True)
        if verbose:
            print()
        full_content = "".join(content_buf)
        full_thinking = "".join(thinking_buf)
        # Embed thinking into response so the caller can extract it
        if full_thinking:
            full_content = f"<think>{full_thinking}</think>\n{full_content}"
        return full_content, usage
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return f"HTTP {e.code}: {body}", {}
    except Exception as ex:
        return f"ERROR: {ex}", {}

# ── Ledger Logger ─────────────────────────────────────────────────────────────
def log_transaction(task_summary, total_in, total_out, turns):
    try:
        init_db()
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        from gatekeeper.base import PREMIUM_IN_PRICE, PREMIUM_OUT_PRICE
        implied = (total_in / 1e6 * PREMIUM_IN_PRICE) + (total_out / 1e6 * PREMIUM_OUT_PRICE)
        txid = f"agent-{uuid.uuid4().hex[:8]}"
        c.execute("""INSERT INTO transactions
            (id, client_app, original_model, routed_model,
             input_tokens, output_tokens, estimated_cost, actual_cost, savings, status)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (txid, "gatekeeper-agent", "claude/gpt-4o", NIM_MODEL,
             total_in, total_out, implied, 0.0, implied, "crystallized"))
        conn.commit()
        conn.close()
        return implied
    except Exception:
        return 0.0

# ── GatekeeperTool Implementation ────────────────────────────────────────────
class AgentCommand(GatekeeperTool):
    @property
    def command_name(self): return "agent"

    @property
    def description(self): return "Run Nemotron as a coding agent with AEA tool-calling protocol"

    def configure_parser(self, parser):
        parser.add_argument("--task",    required=True,  help="Task description for the agent")
        parser.add_argument("--cwd",     default=".",    help="Working directory for file tools")
        parser.add_argument("--dry-run", action="store_true", help="Parse and plan but don't write files")
        parser.add_argument("--verbose", action="store_true", help="Print full Nemotron responses")
        parser.add_argument("--context",   nargs="*",   help="Paths to pre-read into context")
        parser.add_argument("--max-turns", type=int, default=MAX_TURNS, help="Max agent turns (default 40)")

    def execute(self, args, manifest):
        api_key = os.environ.get("NVIDIA_API_KEY", "")
        if not api_key:
            print("ERROR: NVIDIA_API_KEY not set.")
            return 1

        global _current_session_id
        cwd      = os.path.abspath(args.cwd)
        dry_run  = args.dry_run
        verbose  = args.verbose
        task     = args.task
        _current_session_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{uuid.uuid4().hex[:6]}"
        max_turns = args.max_turns

        _emit("session_start", task=task, cwd=cwd, dry_run=dry_run)
        print(f"\n{'='*60}")
        print(f"  NEMOTRON AGENT  {'[DRY-RUN] ' if dry_run else ''}— AEA tool protocol")
        print(f"  Task: {task}")
        print(f"  CWD:  {cwd}")
        print(f"{'='*60}\n")

        # Auto-inject BRAID memory + graph-RAG context
        try:
            from gatekeeper.tools.memory import braid_context
            mem_ctx = braid_context(task, last_n=6)
            if mem_ctx.strip():
                print(f"  [MEMORY] Graph-RAG context loaded ({len(mem_ctx)} chars)")
        except Exception as _me:
            mem_ctx = ""

        # Pre-load context files if provided
        user_content = f"Task: {task}"
        if mem_ctx:
            user_content += f"\n\n{mem_ctx}"
        if args.context:
            for p in args.context:
                fc = tool_read_file(p, cwd=cwd)
                user_content += f"\n\n--- {p} ---\n{fc}"

        messages = [
            {"role": "system",    "content": SYSTEM_PROMPT},
            {"role": "user",      "content": user_content},
        ]

        total_in  = 0
        total_out = 0
        turns     = 0
        last_summary = ""
        call_times = []

        while turns < max_turns:
            # Rate limit: stay under RATE_LIMIT_RPM
            now = time.time()
            call_times = [t for t in call_times if now - t < 60]
            if len(call_times) >= RATE_LIMIT_RPM:
                wait = 60 - (now - call_times[0]) + 1
                print(f"  [RATE LIMIT] waiting {wait:.0f}s...")
                time.sleep(wait)

            print(f"  ── Turn {turns+1} ──────────────────────────────────")
            _emit("turn_start", turn=turns+1)
            response, usage = call_nemotron(messages, api_key, verbose)
            call_times.append(time.time())

            total_in  += usage.get("prompt_tokens", estimate_tokens(str(messages)))
            total_out += usage.get("completion_tokens", estimate_tokens(response))
            turns     += 1

            if response.startswith("HTTP") or response.startswith("ERROR"):
                print(f"  [API ERROR] {response}")
                break

            # Show thinking trace
            think_m = re.search(r'<think>(.*?)</think>', response, re.DOTALL)
            if think_m:
                thinking = think_m.group(1).strip()
                _emit("thinking", turn=turns, content=thinking)
                print(f"  [THINKING] {thinking[:200]}{'...' if len(thinking)>200 else ''}")

            if verbose:
                print(f"\n{response}\n")

            # Parse and dispatch tool calls
            calls = parse_tool_calls(response)
            if not calls:
                print(f"  [NO TOOLS] Nemotron responded without tool calls.")
                if verbose:
                    print(response[:400])
                messages.append({"role": "assistant", "content": response})
                messages.append({"role": "user", "content": "Continue. Use a tool or call <tool name=\"done\" summary=\"...\"/> if complete."})
                continue

            tool_results = []
            done = False
            for call in calls:
                tname = call["attrs"].get("name", "?")
                targs = {k:v for k,v in call["attrs"].items() if k != "name"}
                print(f"  [TOOL] {tname}({', '.join(f'{k}={v}' for k,v in targs.items())})")
                _emit("tool_call", turn=turns, tool=tname, args=targs)
                result = dispatch_tool(call, cwd, dry_run)
                ok = not result.startswith("ERROR")
                _emit("tool_result", turn=turns, tool=tname, ok=ok,
                      preview=result[:200].replace("\n","↵"))
                if result.startswith("__DONE__:"):
                    last_summary = result[9:]
                    done = True
                    _emit("done", summary=last_summary, turns=turns,
                          tokens_in=total_in, tokens_out=total_out)
                    print(f"\n  [DONE] {last_summary}")
                else:
                    preview = result[:120].replace("\n", "↵")
                    print(f"         → {preview}{'...' if len(result)>120 else ''}")
                    tool_results.append(f"<tool_result name=\"{tname}\">\n{result}\n</tool_result>")

            messages.append({"role": "assistant", "content": response})
            if done:
                break
            if tool_results:
                messages.append({"role": "user", "content": "\n".join(tool_results)})

        # Summary
        _emit("session_end", turns=turns, tokens_in=total_in, tokens_out=total_out,
              summary=last_summary)
        implied = log_transaction(task, total_in, total_out, turns)
        print(f"\n{'='*60}")
        print(f"  AGENT SESSION COMPLETE")
        print(f"  Turns: {turns}  |  Tokens in: {total_in}  out: {total_out}")
        print(f"  Implied cost avoided: ${implied:.4f} USD (logged to ledger)")
        if last_summary:
            print(f"  Summary: {last_summary}")
        print(f"{'='*60}\n")
        return 0
