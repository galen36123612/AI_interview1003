"""Deterministic conversation-group split, fixed BEFORE building windows."""
import hashlib


def assign_splits(conversations, inspected_groups, seed="psych-phase1-v1"):
    return {c.group_id: "dev" if c.group_id in inspected_groups or
            int(hashlib.sha256(f"{seed}:{c.group_id}".encode()).hexdigest(), 16) % 10 < 8
            else "holdout" for c in conversations}


def assert_disjoint(records):
    groups, sources = {}, {}
    for r in records:
        for seen, key in ((groups, r["group_id"]),
                          (sources, (r["source"]["dataset"], r["source"]["conversation_id"]))):
            if key in seen and seen[key] != r["split"]:
                raise ValueError("Source conversation or related group crosses dev/holdout")
            seen[key] = r["split"]
