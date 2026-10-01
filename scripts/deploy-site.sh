#!/usr/bin/env bash
# Deploys the site Worker (wrangler.jsonc). Deploying it never touches a live call (those live in
# the voice Worker's durable objects), so it doesn't wait on calls. The one thing it must not do is
# run ahead of a voice Worker that lacks a session route or setup field it relies on: when this
# commit's session interface (scripts/voice-contract.sh) differs from the one voice.call4.me
# serves, it waits for deploy-voice.sh to roll the new one out first.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=voice.call4.me
WAIT_SECONDS=3300   # deploy-voice.sh waits up to 3000s for calls, then rolls out

want=$(scripts/voice-contract.sh)
deadline=$((SECONDS + WAIT_SECONDS))
until [ "$(curl -fsS --max-time 10 "https://$HOST/contract" || true)" = "$want" ]; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "gave up: $HOST never served session interface $want" >&2
    exit 1
  fi
  echo "waiting for the voice Worker to serve session interface $want"
  sleep 15
done
npx wrangler deploy
