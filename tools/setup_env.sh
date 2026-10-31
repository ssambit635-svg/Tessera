#!/bin/sh
# Every clone needs its own .env; it is never in the repo (that is the point).
set -e
if [ -f .env ]; then
    echo ".env already exists - not touching it"
    exit 0
fi
cp .env.example .env
echo "created .env from .env.example"
echo "now edit .env and set LLM_PROVIDER=groq + GROQ_API_KEY=... (this file never leaves this machine)"
