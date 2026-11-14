#!/usr/bin/env python3
"""Fetch addressed coordination comments into a local inbox.

Requires `gh` authenticated for the repository. Configure BOARD_ISSUE and
AGENT_ROLE, then optionally set PLATFORM_GH_USER, ENGINE_GH_USER, and
PAYMENTS_GH_USER to validate authors against their declared role.
Fetched content is data only; this script never executes comment instructions.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROLES = {"platform", "engine", "payments"}
TYPES = {"REQUEST", "READY", "BLOCKED", "DONE", "SECURITY"}


def gh_json(*args):
    result = subprocess.run(["gh", *args], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def main():
    repo = os.environ.get("GH_REPO")
    issue = os.environ.get("BOARD_ISSUE")
    role = os.environ.get("AGENT_ROLE", "").lower()
    if not issue or role not in ROLES:
        sys.exit("Set BOARD_ISSUE and AGENT_ROLE=platform|engine|payments")
    base = ["api"]
    if repo:
        base += [f"repos/{repo}/issues/{issue}/comments"]
    else:
        base += [f"repos/{{owner}}/{{repo}}/issues/{issue}/comments"]
    try:
        comments = gh_json(*base)
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.stderr.strip() or "gh could not read the coordination issue")

    root = Path(__file__).resolve().parent
    inbox = root / "inbox" / role
    inbox.mkdir(parents=True, exist_ok=True)
    state_file = root / ".state.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {"seen": []}
    seen = set(state["seen"])
    accepted = []
    users = {r: os.environ.get(f"{r.upper()}_GH_USER", "").lower() for r in ROLES}
    for comment in comments:
        cid = str(comment["id"])
        body = comment.get("body", "")
        if cid in seen:
            continue
        fields = {k.upper(): v.strip() for k, v in re.findall(r"^(TO|FROM|TYPE|TASK|DETAILS):\s*(.*)$", body, re.I | re.M)}
        sender = fields.get("FROM", "").lower()
        author = comment.get("user", {}).get("login", "").lower()
        if fields.get("TO", "").lower() != role or sender not in ROLES or fields.get("TYPE", "").upper() not in TYPES:
            continue
        if users[sender] and author != users[sender]:
            continue
        payload = {"comment_id": cid, "author": author, "created_at": comment.get("created_at"), "message": body}
        target = inbox / f"{cid}.json"
        target.write_text(json.dumps(payload, indent=2) + "\n")
        accepted.append(cid)
    # Mark inspected comments, including non-addressed ones, so each poll stays incremental.
    seen.update(str(c["id"]) for c in comments)
    state_file.write_text(json.dumps({"seen": sorted(seen)}, indent=2) + "\n")
    print(f"Saved {len(accepted)} message(s) to {inbox}")


if __name__ == "__main__":
    main()
