"""Privacy gate for the public site: fails on forbidden names, secret-shaped strings and leaked passphrases.

Scans every tracked text file (or the files given as arguments). The forbidden names come from the WATCHLIST
environment variable (one per line), set from a repository secret so the list itself is never in the repository.
Prints file, line and category only; a matched name or secret is never printed. Fails closed: no WATCHLIST, no pass.

Run: python tools/privacy_gate.py [files...]        (exit 0 clean, 1 hits, 2 cannot run)
     python tools/privacy_gate.py --selftest
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".mp4",
            ".wav", ".ogg", ".webm", ".pdf", ".zip", ".npz", ".bin", ".glb", ".gltf"}
SKIP_FILES = {"codex.enc.json"}  # ciphertext by design; its lock is checked at build time, not here
TICK = chr(96)
PATTERNS = [
    ("key-shaped string", re.compile(r"sk-(?:ant-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}"
                                     r"|gsk_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{12,}|AIza[A-Za-z0-9_-]{20,}|xox[bp]-[A-Za-z0-9-]{10,}"
                                     r"|hf_[A-Za-z]{20,}|nvapi-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("passphrase in the clear", re.compile(r"(?i)pass(?:phrase|word)\s*[:=]\s*" + TICK + r"?(?!\[rotated)(?!![01](?:[,;})\]]|$))"
                                           r"(?-i:(?![A-Z][A-Z0-9_]*(?![A-Za-z0-9_])))[^\s" + TICK + r"'\"]{6,}")),
    ("codex key assignment", re.compile(r"CODEX_PASS\s*=\s*['\"]?(?!\$|\[rotated)[^\s'\";]{4,}")),
]


def watchlist() -> list[str] | None:
    raw = os.environ.get("WATCHLIST", "")
    terms = [t.strip() for t in raw.splitlines() if t.strip() and not t.strip().startswith("#")]
    return terms or None


def tracked() -> list[str]:
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout
    return [p for p in out.splitlines() if p]


def term_res(terms: list[str]) -> list[re.Pattern]:
    """Whole word, any case: a short name must not fire inside a longer word (qzx in qzxadmin). A term written with a
    leading = matches its exact case only, for a name that is also an ordinary lowercase word on the site."""
    out = []
    for t in terms:
        exact = t.startswith("=")
        t = t[1:] if exact else t
        out.append(re.compile(r"(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])", 0 if exact else re.IGNORECASE))
    return out


def scan_text(name: str, text: str, terms: list[str]) -> list[str]:
    hits = []
    rxs = term_res(terms)
    for n, line in enumerate(text.splitlines(), 1):
        for i, rx in enumerate(rxs):
            if rx.search(line):
                hits.append("%s:%d  forbidden name #%d" % (name, n, i + 1))
        for cat, rx in PATTERNS:
            if rx.search(line):
                hits.append("%s:%d  %s" % (name, n, cat))
    return hits


def scan(paths: list[str], terms: list[str]) -> list[str]:
    hits = []
    for p in paths:
        base = os.path.basename(p)
        if base in SKIP_FILES or os.path.splitext(p)[1].lower() in SKIP_EXT or not os.path.isfile(p):
            continue
        try:
            text = open(p, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        hits.extend(scan_text(p, text, terms))
    return hits


def selftest() -> int:
    terms = ["Planted Corp", "intranet-x", "QZX", "=Beacon"]
    cases = [
        ("clean", "An essay about agents and guards.", 0),
        ("exact-case name, lowercase word passes", "animation: beacon 2s infinite", 0),
        ("exact-case name as written", "the Beacon dashboards", 1),
        ("an env var named after the passphrase passes", "Passphrase: CODEX_PASS env var, or omit to generate one", 0),
        ("short name inside a word passes", "the qzxadmin panel and its qzxers", 0),
        ("short name as a word", "QZX Holdings shared folder", 1),
        ("short name beside punctuation", "(qzx)", 1),
        ("name, case-insensitive", "worked at PLANTED corp for years", 1),
        ("second name", "see the intranet-x dashboard", 1),
        ("anthropic key", "key sk-ant-" + "A" * 30, 1),
        ("github token", "ghp_" + "b" * 30, 1),
        ("passphrase line", "passphrase: " + TICK + "Hunter2Hunter2" + TICK, 1),
        ("minified boolean in a bundle passes", "number:!0,password:!0,range:!0,search:!0", 0),
        ("passphrase starting with !0 is still caught", "pass" + "word: !0hunter2hunter", 1),  # split so the gate passes its own source
        ("rotated passphrase passes", "passphrase: " + TICK + "[rotated 2026-11-10]" + TICK, 0),
        ("codex key", "$env:CODEX_PASS=" + chr(34) + "abcdef12" + chr(34), 1),
        ("codex key from a variable passes", "CODEX_PASS=$SECRET node tools/build_codex.mjs", 0),
        ("private key", "-----BEGIN RSA " + "PRIVATE KEY-----", 1),  # split so the gate passes its own source
    ]
    bad = 0
    for name, text, want in cases:
        got = len(scan_text("t", text, terms))
        if (got > 0) != (want > 0):
            bad += 1
            print("BAD", name, "want", want, "got", got)
    print("privacy_gate selftest: %d of %d" % (len(cases) - bad, len(cases)))
    return 1 if bad else 0


def main() -> int:
    if "--selftest" in sys.argv:
        return selftest()
    terms = watchlist()
    if terms is None:
        print("FAIL: WATCHLIST is empty or unset, so the forbidden-name check cannot run. Not cleared.")
        return 2
    paths = [a for a in sys.argv[1:] if not a.startswith("--")] or tracked()
    hits = scan(paths, terms)
    for h in hits:
        print(h)
    print("privacy gate: %d files, %d hits, %d forbidden names checked" % (len(paths), len(hits), len(terms)))
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
