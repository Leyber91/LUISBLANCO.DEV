"""
plan.py — Task Planning & Complexity-Aware Execution for the Nemotron Agent.

Solves the core problem: the agent acts turn-by-turn with no persistent awareness
of a larger plan. When it hits a wall it loops; when it succeeds it forgets the next step.

COMPLEXITY LADDER (from CONSTELLATION framework):
  PICO   — 1-2 tool calls, single file, done in 1 turn
  NANO   — 3-5 tool calls, single concept, done in 3-5 turns
  MICRO  — 6-12 tool calls, multiple files, done in 6-12 turns
  MACRO  — 13+ tool calls or repetitive N-item batch → CRYSTALLIZE FIRST
  CLUSTER — multiple agents needed → delegate

CRYSTALLIZATION RULE:
  MACRO tasks must be crystallized into a local script BEFORE the agent attempts them.
  The script runs deterministically (zero additional tokens, no failure risk).
  This is how the Gemini 20-hour session worked.

Commands:
  plan create  --task TEXT --steps "step1|step2|step3" [--complexity PICO|NANO|MICRO|MACRO]
  plan read                          # show current plan + what's next
  plan update  --step N --status done|failed|skip
  plan done                          # mark entire plan complete
  plan assess  --task TEXT           # estimate complexity and recommend approach
  plan reset                         # clear current plan (start fresh)
"""

import argparse
import json
import os
import re
from datetime import datetime, timezone

from gatekeeper.base import GatekeeperTool, DB_DIR

PLAN_FILE = os.path.join(DB_DIR, "current_plan.json")

COMPLEXITY_RULES = {
    "PICO":    {"max_steps": 2,  "max_turns": 3,  "crystallize": False,
                "desc": "Single lookup or read — do it directly"},
    "NANO":    {"max_steps": 5,  "max_turns": 6,  "crystallize": False,
                "desc": "A few connected steps — follow plan sequentially"},
    "MICRO":   {"max_steps": 12, "max_turns": 16, "crystallize": False,
                "desc": "Multi-file work — write plan first, track each step"},
    "MACRO":   {"max_steps": 99, "max_turns": 40, "crystallize": True,
                "desc": "Batch/system-level — CRYSTALLIZE to a script first, then run it"},
    "CLUSTER": {"max_steps": 99, "max_turns": 99, "crystallize": True,
                "desc": "Needs multiple agents — not yet implemented"},
}

MACRO_SIGNALS = [
    r'\b(\d{2,})\s*(images?|files?|items?|pages?|blueprints?)',  # "30 images"
    r'\ball\s+\d+', r'every\s+(file|image|item)',
    r'batch|bulk|loop|iterate|for each|process all',
    r'convert.*(all|every|each)',
]

def detect_complexity(task_text: str) -> str:
    """Estimate complexity from task description."""
    t = task_text.lower()
    for pat in MACRO_SIGNALS:
        if re.search(pat, t):
            return "MACRO"
    word_count = len(t.split())
    if word_count < 20:
        return "PICO"
    if word_count < 60:
        return "NANO"
    if word_count < 150:
        return "MICRO"
    return "MACRO"

def load_plan():
    if os.path.exists(PLAN_FILE):
        with open(PLAN_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def save_plan(plan):
    os.makedirs(DB_DIR, exist_ok=True)
    plan["updated"] = datetime.now(timezone.utc).isoformat()
    with open(PLAN_FILE, "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)

def format_plan(plan) -> str:
    if not plan:
        return "[PLAN] No active plan. Use: gatekeeper plan create --task '...' --steps 'step1|step2'"
    c = plan.get("complexity", "MICRO")
    rule = COMPLEXITY_RULES.get(c, {})
    lines = [
        f"{'='*60}",
        f"  ACTIVE PLAN  [{plan.get('id','?')}]",
        f"  Task      : {plan.get('task','?')}",
        f"  Complexity: {c} — {rule.get('desc','')}",
        f"  Status    : {plan.get('status','active')}",
        f"  Created   : {plan.get('created','?')[:19]}",
    ]
    if rule.get("crystallize"):
        lines.append(f"  ⚠  MACRO TASK — crystallize to a script before executing step by step!")
    lines.append(f"{'─'*60}")
    steps = plan.get("steps", [])
    current = next((i for i, s in enumerate(steps) if s.get("status") == "pending"), None)
    for i, step in enumerate(steps):
        status = step.get("status", "pending")
        icon = {"done": "✓", "failed": "✗", "skip": "→", "pending": "○", "in_progress": "►"}.get(status, "?")
        marker = " ← NEXT" if i == current else ""
        lines.append(f"  [{icon}] Step {step['id']}: {step['action']}{marker}")
        if step.get("note"):
            lines.append(f"        note: {step['note']}")
    done  = sum(1 for s in steps if s.get("status") == "done")
    total = len(steps)
    lines.append(f"{'─'*60}")
    lines.append(f"  Progress: {done}/{total} steps done")
    if current is not None:
        lines.append(f"  Next    : Step {steps[current]['id']} — {steps[current]['action']}")
    elif plan.get("status") == "complete":
        lines.append(f"  ✓ PLAN COMPLETE")
    lines.append(f"{'='*60}")
    return "\n".join(lines)

class PlanCommand(GatekeeperTool):
    @property
    def command_name(self): return "plan"

    @property
    def description(self): return "Task planning with complexity detection — prevents turn-by-turn forgetting"

    def configure_parser(self, parser):
        sub = parser.add_subparsers(dest="subcmd")

        c = sub.add_parser("create", help="Create a new plan")
        c.add_argument("--task",       required=True, help="Task description")
        c.add_argument("--steps",      required=True, help="Steps separated by | ")
        c.add_argument("--complexity", default="auto",
                       choices=["auto","PICO","NANO","MICRO","MACRO","CLUSTER"])

        u = sub.add_parser("update", help="Update a step status")
        u.add_argument("--step",   type=int, required=True, help="Step number (1-indexed)")
        u.add_argument("--status", required=True,
                       choices=["done","failed","skip","in_progress","pending"])
        u.add_argument("--note",   default="", help="Optional note about the step")

        sub.add_parser("read",  help="Show current plan")
        sub.add_parser("done",  help="Mark entire plan complete")
        sub.add_parser("reset", help="Clear current plan")

        a = sub.add_parser("assess", help="Estimate complexity of a task")
        a.add_argument("--task", required=True)

    def execute(self, args, manifest):
        sub = getattr(args, "subcmd", None)

        if sub == "create":
            complexity = args.complexity
            if complexity == "auto":
                complexity = detect_complexity(args.task)
            steps_raw = [s.strip() for s in args.steps.split("|") if s.strip()]
            steps = [{"id": i+1, "action": s, "status": "pending", "note": ""}
                     for i, s in enumerate(steps_raw)]
            plan = {
                "id":         datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S"),
                "task":       args.task,
                "complexity": complexity,
                "steps":      steps,
                "status":     "active",
                "created":    datetime.now(timezone.utc).isoformat(),
                "updated":    datetime.now(timezone.utc).isoformat(),
            }
            save_plan(plan)
            rule = COMPLEXITY_RULES.get(complexity, {})
            print(format_plan(plan))
            if rule.get("crystallize"):
                print(f"\n  ⚠  MACRO TASK DETECTED")
                print(f"  Do NOT execute step-by-step through the model.")
                print(f"  → Write a Python script that does it all, then run it once.")
                print(f"  → Example: scratch/run_svg_batch.py processes all 30 images")
                print(f"     with zero model turns beyond the initial script generation.")
            return 0

        elif sub == "update":
            plan = load_plan()
            if not plan:
                print("ERROR: No active plan. Create one first.")
                return 1
            steps = plan.get("steps", [])
            matches = [s for s in steps if s["id"] == args.step]
            if not matches:
                print(f"ERROR: Step {args.step} not found.")
                return 1
            matches[0]["status"] = args.status
            if args.note:
                matches[0]["note"] = args.note
            # If failed twice → auto-skip to prevent loops
            if args.status == "failed":
                fail_count = sum(1 for s in steps if s.get("status") == "failed")
                if fail_count >= 2:
                    print(f"  ⚠  2 failures detected — forcing skip to prevent loop")
                    matches[0]["status"] = "skip"
                    matches[0]["note"] = "auto-skipped after 2 failures"
            save_plan(plan)
            print(format_plan(plan))
            return 0

        elif sub == "read":
            plan = load_plan()
            print(format_plan(plan))
            return 0

        elif sub == "done":
            plan = load_plan()
            if not plan:
                print("No active plan.")
                return 0
            plan["status"] = "complete"
            for s in plan.get("steps", []):
                if s.get("status") == "pending":
                    s["status"] = "skip"
            save_plan(plan)
            print(format_plan(plan))
            return 0

        elif sub == "reset":
            if os.path.exists(PLAN_FILE):
                os.remove(PLAN_FILE)
            print("[PLAN] Cleared.")
            return 0

        elif sub == "assess":
            complexity = detect_complexity(args.task)
            rule = COMPLEXITY_RULES[complexity]
            print(f"\n  COMPLEXITY ASSESSMENT")
            print(f"  Task      : {args.task}")
            print(f"  Complexity: {complexity}")
            print(f"  Rule      : {rule['desc']}")
            print(f"  Crystallize: {'YES — write a script first' if rule['crystallize'] else 'No — proceed step-by-step'}")
            print(f"  Max turns : {rule['max_turns']}")
            return 0

        else:
            print("Usage: gatekeeper plan [create|read|update|done|reset|assess]")
            return 1
