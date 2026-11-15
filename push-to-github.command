#!/bin/bash
cd "$(dirname "$0")"
git checkout feat/agents-runtime
git push -u origin feat/agents-runtime
echo "--- pushing main (fast-forward, no force) ---"
git push origin feat/agents-runtime:main
echo; echo "Done. Close this window."
read -n1
