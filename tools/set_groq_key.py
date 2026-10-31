#!/usr/bin/env python3
"""Put a Groq key into .env - the one safe place for it - and prove the app can see it.

    python tools/set_groq_key.py            # ask for the key, write .env, verify
    python tools/set_groq_key.py --check    # verify only; never prints the key
    python tools/set_groq_key.py --check --live   # ... and make one real API call

The key is typed with hidden input, so it is not echoed, not in the shell history and not in
a screenshot. It is written to .env, which is gitignored: it never reaches GitHub. Nothing in
this tool ever prints the key itself, only its shape.
"""
from __future__ import annotations

import getpass
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
TEMPLATE = ROOT / ".env.example"


def write(key: str, model: str | None) -> None:
    text = ENV.read_text(encoding="utf-8") if ENV.exists() else TEMPLATE.read_text(encoding="utf-8")
    text = re.sub(r"(?m)^LLM_PROVIDER=.*$", "LLM_PROVIDER=groq", text)
    text = re.sub(r"(?m)^GROQ_API_KEY=.*$", f"GROQ_API_KEY={key}", text)
    if model:
        text = re.sub(r"(?m)^GROQ_MODEL=.*$", f"GROQ_MODEL={model}", text)
    if "GROQ_API_KEY=" not in text:
        text += f"\nGROQ_API_KEY={key}\n"
    ENV.write_text(text, encoding="utf-8")
    try:                                                   # tighten permissions where supported
        ENV.chmod(0o600)
    except OSError:
        pass


def check(live: bool) -> int:
    """Report what the app can see, without ever echoing the key."""
    sys.path.insert(0, str(ROOT / "api"))
    from app.config import ENV_FILES_LOADED, get_settings, reset_settings_cache

    reset_settings_cache()
    s = get_settings()
    key = s.groq_api_key or ""
    print("env files      :", ", ".join(ENV_FILES_LOADED) or "none found")
    print("LLM_PROVIDER   :", s.llm_provider)
    print("key present    :", "yes" if key else "NO")
    if key:
        print("key shape      :", "gsk_…" if key.startswith("gsk_") else "unexpected prefix",
              f"({len(key)} chars)")
        print("key has spaces :", "yes - remove them" if key != key.strip() else "no")
    print("model          :", s.groq_model, "-> fallback", s.groq_fallback_model)
    print("llm_enabled    :", s.llm_enabled)
    if not s.llm_enabled:
        print("\nThe app would run deterministically (still fully working). To switch it on:")
        print("  python tools/set_groq_key.py")
        return 1
    if live:
        import httpx

        print("\ncalling the provider…")
        try:
            r = httpx.post(
                f"{s.groq_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {key}"},
                json={"model": s.groq_model, "temperature": 0, "max_tokens": 5,
                      "messages": [{"role": "user", "content": "reply with the word ok"}]},
                timeout=20,
            )
            if r.status_code == 200:
                print("provider call  : ok (HTTP 200) - the key works")
                return 0
            print(f"provider call  : HTTP {r.status_code} - {r.text[:160]}")
            return 1
        except Exception as exc:                      # noqa: BLE001 - report, never raise
            print(f"provider call  : {type(exc).__name__}: {exc}")
            return 1
    print("\nAdd --live to make one real API call.")
    return 0


def main() -> int:
    if "--check" in sys.argv:
        return check(live="--live" in sys.argv)
    print("Groq key setup - it is stored only in .env (gitignored, never pushed).\n")
    key = getpass.getpass("Paste your Groq API key (input is hidden): ").strip()
    if not key:
        print("nothing entered - unchanged")
        return 1
    if not key.startswith("gsk_"):
        print("that does not look like a Groq key (they start with gsk_). Nothing changed.")
        return 1
    model = input("Model [llama-3.3-70b-versatile]: ").strip() or None
    write(key, model)

    sys.path.insert(0, str(ROOT / "api"))
    from app.config import get_settings, reset_settings_cache  # noqa: E402

    reset_settings_cache()
    s = get_settings()
    print(f"\nwritten to {ENV}")
    print(f"  LLM_PROVIDER = {s.llm_provider}")
    print(f"  key loaded   = {'yes' if bool(s.groq_api_key) else 'NO'}")
    print(f"  llm_enabled  = {s.llm_enabled}")
    if not s.llm_enabled:
        print("\nThe app still cannot see it. Check that .env has no quotes or spaces around the key.")
        return 1
    print("\nNow restart the server, then open http://localhost:8000/health")
    print('  "llm" should read "groq" (it reads "none" right now).')
    print("Or sign in as admin and run POST /api/ai/selftest for a real call.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
