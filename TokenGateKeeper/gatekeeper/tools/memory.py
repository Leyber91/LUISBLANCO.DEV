"""
memory.py — Graph-RAG Memory for the TokenGateKeeper Agent.

Implements the CONSTELLATION + ESSENCE + DATASPACE architecture from the Book of Luis:
  - Pico layer  : keyword seed search over concept_graph.json (690 nodes)
  - Nano layer  : BFS graph traversal via typed edges (1013 edges)
  - Micro layer : rerank paths by edge type priority
  - Macro layer : compress subgraph → BRAID notation (Was/Wasn't/Can Be)
  - BRAID store : ~/.token_gatekeeper/braid.jsonl (append-only session log)

Commands:
  memory write  --was TEXT --wasnt TEXT --canbe TEXT [--task TEXT] [--tools TEXT] [--cost N]
  memory load   --query TEXT [--depth N] [--top N]
  memory search --query TEXT [--depth N]
  memory list   [--last N]
"""

import argparse
import json
import math
import os
import re
import sqlite3
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone

from gatekeeper.base import GatekeeperTool, DB_DIR

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(__file__)
CONCEPT_GRAPH = os.path.abspath(os.path.join(_HERE, "..", "..", "..", "src", "core", "concept_graph.json"))
RAW_ATLAS     = os.path.abspath(os.path.join(_HERE, "..", "..", "..", "register", "work", "00_raw_concepts.json"))
BRAID_FILE    = os.path.join(DB_DIR, "braid.jsonl")

# ── Edge type priority (higher = more semantic weight) ─────────────────────────
EDGE_PRIORITY = {
    "proves_in":   1.0,
    "enables":     0.9,
    "implements":  0.8,
    "depends_on":  0.7,
    "part_of":     0.6,
    "related_to":  0.4,
    "references":  0.3,
}

# ── Graph loader (cached in module scope) ─────────────────────────────────────
_graph_cache = None

def _load_graph():
    global _graph_cache
    if _graph_cache:
        return _graph_cache
    nodes, edges = [], []
    if os.path.exists(CONCEPT_GRAPH):
        with open(CONCEPT_GRAPH, "r", encoding="utf-8") as f:
            cg = json.load(f)
        nodes = cg.get("nodes", [])
        edges = cg.get("edges", [])
    atlas = []
    if os.path.exists(RAW_ATLAS):
        with open(RAW_ATLAS, "r", encoding="utf-8") as f:
            atlas = json.load(f)
    # Build adjacency index: node_id → list of (neighbor_id, edge_type, weight)
    adj = defaultdict(list)
    for e in edges:
        s, t, etype = e.get("source",""), e.get("target",""), e.get("type","related_to")
        w = EDGE_PRIORITY.get(etype, 0.3) * e.get("weight", 0.5)
        adj[s].append((t, etype, w))
        adj[t].append((s, etype, w))   # bidirectional traversal
    # Build node lookup and atlas lookup
    node_by_id   = {n["id"]: n for n in nodes}
    # Merge atlas essences into node lookup by name match
    atlas_by_name = {}
    for entry in atlas:
        atlas_by_name[entry.get("name","").lower()] = entry
    _graph_cache = {
        "nodes": nodes,
        "edges": edges,
        "adj":   adj,
        "node_by_id": node_by_id,
        "atlas_by_name": atlas_by_name,
    }
    return _graph_cache

# ── Pico Layer: keyword seed search ──────────────────────────────────────────
def _tokenize(text):
    return set(re.split(r'[\s\-_/,+→]+', text.lower()))

def _score_node(node, query_tokens, atlas_by_name):
    """TF-IDF-like scoring: overlap of query tokens with node name + atlas essence."""
    name_tokens   = _tokenize(node.get("name",""))
    score = len(query_tokens & name_tokens) / max(1, math.sqrt(len(name_tokens)))
    # Boost tier S/A nodes
    tier_boost = {"S": 0.4, "A": 0.2, "B": 0.1, "C": 0.0}.get(node.get("tier",""), 0.0)
    # Atlas essence match
    essence = atlas_by_name.get(node.get("name","").lower(), {}).get("essence","")
    if essence:
        ess_tokens = _tokenize(essence)
        score += len(query_tokens & ess_tokens) / max(1, math.sqrt(len(ess_tokens))) * 0.5
    return score + tier_boost

def find_seeds(query, top_k=4):
    """Pico layer: find top-k seed nodes by keyword overlap."""
    g = _load_graph()
    query_tokens = _tokenize(query)
    scored = []
    for node in g["nodes"]:
        s = _score_node(node, query_tokens, g["atlas_by_name"])
        if s > 0:
            scored.append((s, node))
    scored.sort(key=lambda x: -x[0])
    return [n for _, n in scored[:top_k]]

# ── Nano Layer: BFS graph traversal ──────────────────────────────────────────
def traverse(seed_ids, depth=2):
    """Nano layer: BFS from seed nodes up to depth hops, weighted by edge type."""
    g = _load_graph()
    visited  = {}    # node_id → (score, path, depth)
    queue    = deque()
    for nid in seed_ids:
        if nid in g["node_by_id"]:
            queue.append((nid, [], 1.0, 0))
    while queue:
        nid, path, score, d = queue.popleft()
        if nid in visited:
            if visited[nid][0] >= score:
                continue
        visited[nid] = (score, path, d)
        if d >= depth:
            continue
        for (neighbor, etype, w) in g["adj"].get(nid, []):
            if neighbor not in visited or visited[neighbor][0] < score * w:
                queue.append((neighbor, path + [(nid, etype)], score * w, d + 1))
    return visited  # node_id → (score, path, depth)

# ── Micro Layer: rerank + compress subgraph ───────────────────────────────────
def _format_path(path, node_by_id):
    """Format a traversal path as a compact chain string."""
    if not path:
        return ""
    parts = []
    for (nid, etype) in path:
        n = node_by_id.get(nid, {})
        parts.append(f"{n.get('name', nid)[:40]} →[{etype}]→")
    return " ".join(parts)

def build_context_block(query, depth=2, top_n=8):
    """
    Full graph-RAG pipeline: Pico → Nano → Micro → DATASPACE compression.
    Returns a dense context string to inject into the agent's system prompt.
    """
    g      = _load_graph()
    seeds  = find_seeds(query, top_k=4)
    if not seeds:
        return f"[BOOK] No concepts found for: {query}"
    seed_ids = [s["id"] for s in seeds]
    visited  = traverse(seed_ids, depth=depth)
    # Rerank by score × edge_priority decay
    ranked = sorted(visited.items(), key=lambda x: -x[1][0])[:top_n]
    # Stage 3 compression: Coded notation
    lines = [f"[BOOK·RAG] query='{query}' seeds={len(seeds)} subgraph={len(visited)} nodes"]
    lines.append("─" * 60)
    for nid, (score, path, d) in ranked:
        node = g["node_by_id"].get(nid, {})
        atlas_entry = g["atlas_by_name"].get(node.get("name","").lower(), {})
        essence = atlas_entry.get("essence", "")[:80]
        era     = atlas_entry.get("era", "")
        status  = node.get("status", "") or atlas_entry.get("status","")
        tier    = node.get("tier","?")
        cluster = node.get("cluster","?")
        chain   = _format_path(path[-2:] if len(path) > 2 else path, g["node_by_id"])
        line = (
            f"[T{tier}·{cluster}] {node.get('name','?')[:60]}"
            f" | {era} | {status}"
        )
        if chain:
            line += f"\n  via: {chain}"
        if essence:
            line += f"\n  → {essence}"
        lines.append(line)
    # Stage 4: DATASPACE — cluster summary at the end
    cluster_counts = defaultdict(int)
    for nid, _ in ranked:
        n = g["node_by_id"].get(nid, {})
        cluster_counts[n.get("cluster","?")] += 1
    territory = ", ".join(f"{c}×{v}" for c,v in sorted(cluster_counts.items(), key=lambda x:-x[1]))
    lines.append(f"─" * 60)
    lines.append(f"TERRITORY: {territory}")
    return "\n".join(lines)

# ── BRAID Store ───────────────────────────────────────────────────────────────
def braid_write(was, wasnt, canbe, task="", tools="", cost=0.0, tokens=0):
    """Write a compressed session BRAID entry to the append-only log."""
    os.makedirs(DB_DIR, exist_ok=True)
    entry = {
        "id":      str(uuid.uuid4())[:8],
        "ts":      datetime.now(timezone.utc).isoformat(),
        "task":    task,
        "was":     was,
        "wasnt":   wasnt,
        "canbe":   canbe,
        "tools":   tools,
        "cost":    cost,
        "tokens":  tokens,
    }
    with open(BRAID_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    return entry

def braid_load(last_n=20):
    """Load the last N BRAID entries."""
    if not os.path.exists(BRAID_FILE):
        return []
    entries = []
    with open(BRAID_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return entries[-last_n:]

def braid_context(query, last_n=6):
    """
    Build the session-start context block: BRAID memory + graph-RAG.
    This is what gets injected into the agent at session start.
    Total target: ~400 tokens.
    """
    lines = []
    # Was/Wasn't/Can Be from last N sessions
    entries = braid_load(last_n)
    if entries:
        lines.append("── BRAID MEMORY (recent sessions) ─────────────────────")
        for e in reversed(entries[-3:]):   # last 3 most recent
            lines.append(
                f"[{e['ts'][:10]}·{e['id']}] task={e.get('task','?')[:40]}\n"
                f"  WAS:    {e.get('was','')[:80]}\n"
                f"  WASNT:  {e.get('wasnt','')[:80]}\n"
                f"  CANBE:  {e.get('canbe','')[:80]}"
            )
    # Graph-RAG context for current query
    if query:
        lines.append("")
        lines.append(build_context_block(query, depth=2, top_n=6))
    return "\n".join(lines)

# ── GatekeeperTool ────────────────────────────────────────────────────────────
class MemoryCommand(GatekeeperTool):
    @property
    def command_name(self): return "memory"

    @property
    def description(self): return "Graph-RAG memory: write session BRAID, load relevant context, search concept graph"

    def configure_parser(self, parser):
        sub = parser.add_subparsers(dest="subcmd")

        w = sub.add_parser("write", help="Write a BRAID session entry")
        w.add_argument("--was",    required=True, help="What was done (compressed)")
        w.add_argument("--wasnt",  required=True, help="What failed / must not repeat")
        w.add_argument("--canbe",  required=True, help="Next target state")
        w.add_argument("--task",   default="",    help="Task description")
        w.add_argument("--tools",  default="",    help="Tools used/created")
        w.add_argument("--cost",   type=float, default=0.0, help="Implied cost avoided ($)")
        w.add_argument("--tokens", type=int,   default=0,   help="Tokens used")

        lo = sub.add_parser("load", help="Load BRAID + graph-RAG context for a task")
        lo.add_argument("--query",  required=True, help="Task description to retrieve context for")
        lo.add_argument("--depth",  type=int, default=2, help="Graph traversal depth (default 2)")
        lo.add_argument("--top",    type=int, default=6, help="Top N nodes to return")

        se = sub.add_parser("search", help="Search concept graph only (no BRAID)")
        se.add_argument("--query",  required=True, help="Search query")
        se.add_argument("--depth",  type=int, default=1, help="Traversal depth")

        li = sub.add_parser("list", help="List recent BRAID entries")
        li.add_argument("--last",   type=int, default=10, help="Number of entries to show")

    def execute(self, args, manifest):
        sub = getattr(args, "subcmd", None)

        if sub == "write":
            entry = braid_write(
                was=args.was, wasnt=args.wasnt, canbe=args.canbe,
                task=args.task, tools=args.tools, cost=args.cost, tokens=args.tokens
            )
            print(f"[BRAID] Written entry {entry['id']} at {entry['ts'][:19]}")
            print(f"  WAS:   {entry['was']}")
            print(f"  WASNT: {entry['wasnt']}")
            print(f"  CANBE: {entry['canbe']}")
            return 0

        elif sub == "load":
            ctx = braid_context(args.query, last_n=6)
            print(ctx)
            return 0

        elif sub == "search":
            result = build_context_block(args.query, depth=args.depth, top_n=10)
            print(result)
            return 0

        elif sub == "list":
            entries = braid_load(args.last)
            if not entries:
                print("[BRAID] No entries yet. Run: gatekeeper memory write --was ... --wasnt ... --canbe ...")
                return 0
            for e in reversed(entries):
                print(f"\n[{e['ts'][:19]}·{e['id']}] {e.get('task','?')[:50]}")
                print(f"  WAS:   {e.get('was','')}")
                print(f"  WASNT: {e.get('wasnt','')}")
                print(f"  CANBE: {e.get('canbe','')}")
                if e.get("cost"):
                    print(f"  COST:  ${e['cost']:.4f} avoided / {e.get('tokens',0)} tokens")
            return 0

        else:
            print("Usage: gatekeeper memory [write|load|search|list] --help")
            return 1
