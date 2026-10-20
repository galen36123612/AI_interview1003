"""Turn windows with explicit prefix / reference / audit separation."""
from dataclasses import asdict

from .parsers import Conversation
from .schema import check

ACTIONS = ("reflect", "paraphrase", "clarify", "affirm", "suggest", "inform",
           "repair_misunderstanding", "close", "safety_protocol")


def review_defaults():
    return {"proposed_strategy": None, "human_approved_strategy": None,
            "content_review_status": "pending", "privacy_review_status": "pending",
            "license_review_status": "pending", "safety_review_status": "pending",
            "localization_review_status": "pending", "runtime_retrieval_enabled": False,
            "reviewed_context": "", "reviewed_response": "", "reviewed_scope": "",
            "language": "", "approved_use": "", "review_log": []}


def message(turn):
    return {"id": f"turn:{turn.index}", "role": turn.role, "content": turn.content}


def iter_cases(conv: Conversation, split: str):
    i = 0
    while i < len(conv.turns):
        if conv.turns[i].role != "assistant":
            i += 1
            continue
        start = i
        while i < len(conv.turns) and conv.turns[i].role == "assistant":
            i += 1
        block = conv.turns[start:i]
        yield {
            "case_id": f"{conv.dataset}:{conv.source_id}:{block[0].index}-{block[-1].index}",
            "source": {"dataset": conv.dataset, "conversation_id": conv.source_id,
                       "response_turn_indices": [t.index for t in block]},
            "group_id": conv.group_id, "split": split,
            "observed_prefix": [message(t) for t in conv.turns[:start]],
            "reference_output": [message(t) for t in block],
            "observed_strategy": [t.audit.get("strategy") for t in block],
            "audit_only": {"conversation_metadata": conv.audit,
                           "source_turn_metadata": [{"index": t.index, "speaker": t.source_speaker,
                                                     "annotation": t.audit} for t in conv.turns[:i]],
                           "future_turns": [asdict(t) for t in conv.turns[i:]]},
            "review_flags": [], "proposed_uses": [], **review_defaults(),
        }


def router_input(card, safety_status="unknown"):
    """Only an explicit allowlist crosses the runtime boundary; never copy audit fields."""
    prefix = card["observed_prefix"]
    if not prefix or prefix[-1]["role"] != "user":
        raise ValueError("No observed current user turn; opening supporter block is audit-only")
    result = {"current_user_message": dict(prefix[-1]),
              "available_prior_messages": [dict(m) for m in prefix[:-1]],
              "consented_user_context": [], "previous_action": "none",
              "safety_signal": {"status": safety_status, "origin": "external_fixture",
                                "evidence_message_ids": []}}
    return check("router_input", result)


def import_sample_card(card):
    """Legacy review suggestions remain proposals, with all release gates reset."""
    def convert(m, i):
        index = m.get("source_turn_index_0based", m.get("source_utterance_idx_1based", i))
        return {"id": f"turn:{index}", "role": m["role"], "content": m["content"]}
    refs = card["reference_output_NOT_ROUTER_INPUT"]
    return {"case_id": card["case_id"], "source": card["source"],
            "group_id": ("ED:" if card["source"]["dataset"] == "EmpatheticDialogues" else "") + card["development_group"],
            "split": "dev", "observed_prefix": [convert(m, i) for i, m in enumerate(card["observed_prefix"])],
            "reference_output": [{"id": f"target:{i}", "role": "assistant", "content": m["content"]} for i, m in enumerate(refs)],
            "observed_strategy": [m.get("observed_strategy") for m in refs],
            "audit_only": card["audit_only_NOT_ROUTER_INPUT"],
            "review_flags": card["ai_review_flags"], "proposed_uses": card["proposed_uses"],
            **review_defaults(), "proposed_strategy": card.get("proposed_strategy_by_ai")}
