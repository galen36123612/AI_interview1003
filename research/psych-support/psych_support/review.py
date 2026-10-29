"""Local human attestation and deny-by-default gate; not reviewer authentication."""
from copy import deepcopy
import hashlib
import json
from datetime import datetime, timezone

from .cases import ACTIONS
from .schema import check

DIMENSIONS = ("content", "privacy", "license", "safety", "localization")
STATES = ("pending", "approved", "rejected")


def content_digest(card):
    # Review evidence is bound to the actual content, including subsequent adaptations.
    keys = ("case_id", "source", "observed_prefix", "reference_output", "reviewed_context",
            "reviewed_response", "reviewed_scope", "language", "approved_use",
            "human_approved_strategy", "review_flags", "proposed_uses", "split", "group_id")
    return hashlib.sha256(json.dumps({k: card.get(k) for k in keys}, ensure_ascii=False,
                                    sort_keys=True).encode()).hexdigest()


def record_review(card, *, dimension, decision, reviewer, note, approved_strategy=None):
    check("case_card", card)
    if dimension not in DIMENSIONS or decision not in STATES:
        raise ValueError("Unknown review dimension or decision")
    if not isinstance(reviewer, str) or not reviewer.strip() or not isinstance(note, str) or not note.strip():
        raise ValueError("Reviewer and review evidence/note are required")
    updated = deepcopy(card)
    updated["runtime_retrieval_enabled"] = False
    if dimension == "content" and decision == "approved":
        if approved_strategy not in ACTIONS[:-1]:
            raise ValueError("Human content approval requires a supported general action")
        updated["human_approved_strategy"] = approved_strategy
    if decision != "approved":
        updated["runtime_retrieval_enabled"] = False
    updated[f"{dimension}_review_status"] = decision
    updated["review_log"].append({"dimension": dimension, "decision": decision,
                                  "reviewer": reviewer.strip(), "note": note.strip(),
                                  "at_utc": datetime.now(timezone.utc).isoformat(),
                                  "content_sha256": content_digest(updated)})
    return updated


def gate_reasons(card, *, require_enabled=True):
    try:
        check("case_card", card)
    except ValueError:
        return ["invalid_card_schema"]
    reasons = []
    if require_enabled and card.get("runtime_retrieval_enabled") is not True:
        reasons.append("runtime_disabled")
    if card.get("human_approved_strategy") not in ACTIONS[:-1]:
        reasons.append("strategy_not_human_approved")
    if card.get("split") != "dev":
        reasons.append("holdout_or_unknown_split")
    if card.get("review_flags") or "exclude_from_positive_retrieval" in card.get("proposed_uses", []):
        reasons.append("unresolved_review_flags_or_excluded_use")
    if card.get("approved_use") != "general_support" or card.get("reviewed_scope") != "general_support":
        reasons.append("scope_not_approved")
    if card.get("language") != "zh-TW":
        reasons.append("localization_not_zh_TW")
    if not all(isinstance(card.get(k), str) and card[k].strip()
               for k in ("reviewed_context", "reviewed_response")):
        reasons.append("reviewed_text_missing")
    digest = content_digest(card)
    for dimension in DIMENSIONS:
        log = [r for r in card.get("review_log", []) if r.get("dimension") == dimension]
        last = log[-1] if log else {}
        if card.get(f"{dimension}_review_status") != "approved" or last.get("decision") != "approved":
            reasons.append(f"{dimension}_not_approved")
        elif last.get("content_sha256") != digest or not last.get("reviewer") or not last.get("note"):
            reasons.append(f"{dimension}_review_stale_or_missing_evidence")
    return reasons


def enable_for_local_gate_demo(card):
    reasons = gate_reasons(card, require_enabled=False)
    if reasons:
        raise ValueError("Cannot enable case: " + ", ".join(reasons))
    result = deepcopy(card)
    result["runtime_retrieval_enabled"] = True
    return result


def retrieve_reviewed(cards, *, safety_status, scope="general_support", limit=2):
    """Gate demonstration only: no vector index or semantic matching is implemented."""
    if safety_status != "clear_for_general_support" or scope != "general_support":
        return []
    matches = []
    for c in cards:
        if gate_reasons(c):
            continue
        matches.append({"case_id": c["case_id"], "authority": "untrusted_reference_data",
                        "context": c["reviewed_context"], "response": c["reviewed_response"],
                        "strategy": c["human_approved_strategy"]})
        if len(matches) >= max(0, min(limit, 2)):
            break
    return matches if limit > 0 else []
