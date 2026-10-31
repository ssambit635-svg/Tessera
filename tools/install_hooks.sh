#!/bin/sh
# One-time, per clone: makes git run the secret check before every commit.
set -e
cp tools/pre_commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
python3 tools/check_secrets.py
echo "installed .git/hooks/pre-commit"
