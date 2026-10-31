#!/usr/bin/env python3
"""Fail if a real-looking credential is about to be committed.

Usage:
    python tools/check_secrets.py          # scan every file git tracks
    python tools/check_secrets.py --all    # scan the working tree too (untracked files)

Rules: this is a tripwire, not a fortress. It knows the shapes the services we use emit,
so a pasted `gsk_...` or a private key block cannot reach `main` by accident. A key is only
ever safe in `.env` (gitignored) or in the host's environment variables.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PATTERNS = [
    ("Groq API key", re.compile(r"gsk_[A-Za-z0-9]{20,}")),
    ("OpenAI-style key", re.compile(r"\bsk-[A-Za-z0-9]{20,}")),
    ("Google API key", re.compile(r"AIza[0-9A-Za-z_\-]{30,}")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}")),
    ("Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}")),
    ("private key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
]

# files whose job is to show the *shape* of a key, never a real one
ALLOW = {
    "tools/check_secrets.py",
    "tools/pre_commit",
    "docs/SECRETS.md",
}
SKIP_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".pdf", ".db", ".sqlite3", ".pyc", ".zip"}


def tracked_files() -> list[Path]:
    out = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True)
    return [Path(p) for p in out.stdout.splitlines() if p.strip()]


def working_tree_files() -> list[Path]:
    return [p for p in Path(".").rglob("*")
            if p.is_file() and ".git/" not in p.as_posix() and "node_modules" not in p.parts]


def scan(files: list[Path]) -> list[tuple[str, str, int, str]]:
    hits = []
    for path in files:
        if path.suffix.lower() in SKIP_SUFFIX or path.as_posix() in ALLOW:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, ValueError):
            continue
        for label, pattern in PATTERNS:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                snippet = match.group(0)[:8] + "…"
                hits.append((path.as_posix(), label, line, snippet))
    return hits


def main() -> int:
    files = working_tree_files() if "--all" in sys.argv else tracked_files()
    hits = scan(files)
    if not hits:
        print(f"check_secrets: clean ({len(files)} file(s) scanned)")
        return 0
    print("check_secrets: a real credential looks committed\n")
    for path, label, line, snippet in hits:
        print(f"  {path}:{line}  {label}  {snippet}")
    print("\nFix: keep the value in .env (gitignored) or in the host's env vars, then rotate the"
          "\nkey that was exposed - deleting the line is not enough once it has been pushed.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
