# Secrets: what happened, and the rule from now on

## What happened

`GROQ_API_KEY` was pasted into **`.env.example`**, which is a *tracked* file (it is the
template everyone copies), instead of `.env`, which is gitignored and never committed.
GitHub's secret scanning noticed the key-shaped string and emailed about it.

Good news, verified here against every commit on every branch:

```bash
git rev-list --all | while read c; do git grep -n "gsk_" $c -- .; done
# only api/tests/test_llm.py shows "gsk_test_key_not_real" - a fake used in a test
```

So no real key is in the reachable history. The `Clear GROQ_API_KEY in .env.example` commit
put the file back to `GROQ_API_KEY=` (empty).

## Do this now (2 minutes, costs nothing)

1. **Rotate the key** - console.groq.com -> API Keys -> delete the key that was exposed ->
   `Create API Key`. Deleting the line from git is *not* enough: the value may still exist in
   an unreachable object on GitHub, in a screenshot, or in a chat log. A rotated key is dead.
2. Put the new key in **`.env`** only (this repo ships `.env` gitignored; if it is missing in
   your clone: `sh tools/setup_env.sh`).
3. Never paste it into `.env.example`, a commit, an issue, a PR, a screenshot, or a chat -
   including this one. If a key ever appears in chat, treat it as public and rotate it.

## Where the key may live

| Place | Allowed | Why |
| --- | --- | --- |
| `.env` (gitignored) | yes | local only, never leaves the machine |
| Render / hosting dashboard -> Environment | yes | the platform injects it at runtime |
| `.env.example` | **no** | it is committed; it must stay empty |
| `.github/workflows/*.yml` | **no** | CI logs and repo are public |
| anywhere in a commit | **no** | history is forever |

`.env.example` keeps exactly this line, with nothing after the `=`:

```
GROQ_API_KEY=
```

## What stops it from happening again

| Guard | What it does |
| --- | --- |
| `tools/check_secrets.py` | scans every tracked file for Groq/OpenAI/Google/GitHub/Slack key shapes, JWTs and private-key blocks; exits 1 on a hit |
| `tools/install_hooks.sh` | one-time install of the same check as a `pre-commit` hook |
| CI job `secrets` | runs the scan on every push, so a leaked key fails the build instead of sitting in `main` |
| `.gitignore` | `.env`, `.env.local`, `api/.env`, `*.db` |

```bash
python3 tools/check_secrets.py          # tracked files
python3 tools/check_secrets.py --all    # working tree too
sh tools/install_hooks.sh               # block it at commit time
```

## Editing history (only if a key really was pushed)

Rotating the key is sufficient; the leaked value becomes useless. If you also want it gone
from history (for tidiness, not safety):

```bash
pip install git-filter-repo
git filter-repo --path .env.example --invert-paths --force   # or scrub the value
```

Never force-push `main` during judging - the commit history is audited. Rotation first.
