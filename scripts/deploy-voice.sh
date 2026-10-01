#!/usr/bin/env bash
# Deploys the voice Worker (wrangler.voice.jsonc) without dropping a call.
#
# Deploying a Worker resets the durable objects it defines, and a reset VoiceSession loses its
# live call. So this deploys only when the voice bundle changed, and only once no call is up:
# it waits for zero active calls, locks out new ones (services/dialer.ts voiceDeployDone waits
# on the lock), checks again, deploys, and unlocks only once the new version is serving and
# Cloudflare has had time to retire the old one.
#
# Never deploy the voice Worker or change its secrets any other way: either restarts every call.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG=wrangler.voice.jsonc
HOST=voice.call4.me
LOCK_SECONDS=300        # outlasts deploy + rollout + grace; expires on its own if this dies
ROLLOUT_SECONDS=120     # longest to wait for the new version to answer /build
GRACE_SECONDS=60        # Cloudflare can keep running the old version briefly after a deploy
WAIT_SECONDS=3000       # longest to wait for calls to finish (calls run 30 minutes at most)
STALE_SECONDS=7200      # active rows older than this are stuck, not live

out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT
npx wrangler deploy -c "$CONFIG" --dry-run --outdir "$out" >/dev/null
build=$(cat "$CONFIG" "$out/worker.js" | sha256sum | cut -c1-16)
live=$(curl -fsS --max-time 10 "https://$HOST/build" || true)
if [ "$live" = "$build" ]; then
  echo "voice worker unchanged ($build), not deploying"
  exit 0
fi
echo "voice worker $live -> $build"

d1() { npx wrangler d1 execute callbay --remote --json --command "$1"; }
active() {
  d1 "SELECT COUNT(*) AS n FROM calls WHERE status IN ('queued','dialing','in_progress') AND created_at > (unixepoch() - $STALE_SECONDS) * 1000" | jq -r '.[0].results[0].n'
}
lock() { d1 "INSERT INTO voice_deploys (id, locked_until) VALUES (1, (unixepoch() + $1) * 1000) ON CONFLICT (id) DO UPDATE SET locked_until = excluded.locked_until" >/dev/null; }

deadline=$((SECONDS + WAIT_SECONDS))
while :; do
  n=$(active)
  if [ "$n" = 0 ]; then
    lock "$LOCK_SECONDS"
    # A call that started before the lock landed shows up here; let it finish first.
    n=$(active)
    [ "$n" = 0 ] && break
    lock 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "gave up: $n call(s) still active after ${WAIT_SECONDS}s" >&2
    exit 1
  fi
  echo "waiting on $n active call(s)"
  sleep 15
done
if ! npx wrangler deploy -c "$CONFIG" --var "VOICE_BUILD:$build"; then
  lock 0   # nothing was deployed, so nothing to wait out
  exit 1
fi
# Calls stay locked out until the new version answers and the old one has had time to retire. If
# the new version never shows up, the lock is left to expire rather than lifted early.
rollout=$((SECONDS + ROLLOUT_SECONDS))
until [ "$(curl -fsS --max-time 10 "https://$HOST/build" || true)" = "$build" ]; do
  if [ "$SECONDS" -ge "$rollout" ]; then
    echo "deployed, but $HOST still isn't serving $build; leaving the lock to expire" >&2
    exit 1
  fi
  sleep 5
done
sleep "$GRACE_SECONDS"
lock 0
echo "voice worker $build live, calls unlocked"
