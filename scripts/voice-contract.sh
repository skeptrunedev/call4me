#!/usr/bin/env bash
# Prints a hash of the interface between the site and the voice Worker: the session routes and
# the SessionSetup payload (voice/session.ts) and how the site reaches a session (voice/stub.ts).
# The voice Worker serves the hash it was deployed with at /contract; the site deploys ahead of
# the voice Worker only while the two match (scripts/deploy-site.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
cat src/server/voice/session.ts src/server/voice/stub.ts | sha256sum | cut -c1-16
