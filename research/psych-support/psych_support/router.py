"""Deterministic interface demonstration, NOT an executable crisis classifier.

Safety is an independently supplied fixture signal. No text/label risk inference,
clinical advice, resource database, external service, or generated reply here.
"""
from .schema import check


def route(payload):
    check("router_input", payload)
    messages = payload["available_prior_messages"] + [payload["current_user_message"]]
    ids = [m["id"] for m in messages]
    if len(ids) != len(set(ids)):
        raise ValueError("Message ids must be unique")
    user_ids = {m["id"] for m in messages if m["role"] == "user"}
    signal = payload["safety_signal"]
    if set(signal["evidence_message_ids"]) - user_ids:
        raise ValueError("Safety evidence must reference observed user messages")
    for context in payload["consented_user_context"]:
        if context["provided_at_message_id"] not in user_ids:
            raise ValueError("Consented context must have an observed user-message source")
    current = payload["current_user_message"]
    status = signal["status"]
    action, need, summary = "clarify", "clarification", "當輪需求尚不明確；先釐清。"
    if status != "clear_for_general_support":
        action, need = "safety_protocol", "safety_review_required"
        summary = "獨立安全訊號要求保守流程；一般策略與案例檢索已阻擋。"
    else:
        text = current["content"].lower()
        if any(t in text for t in ("誤會", "不是這個意思", "misunderstood")):
            action, need, summary = "repair_misunderstanding", "repair", "使用者指出理解落差。"
        elif any(t in text for t in ("不要建議", "只想有人聽", "just listen")):
            action, need, summary = "reflect", "emotional_support", "使用者要求傾聽而非建議。"
        elif any(t in text for t in ("不要再", "已經試過", "tried that")):
            action, need, summary = "clarify", "constraints", "使用者提出限制或拒絕；需先確認可行方向。"
        elif any(t in text for t in ("建議", "怎麼說", "怎麼做", "advice")):
            action, need, summary = "suggest", "practical_help", "使用者明確要求實際協助。"
        elif any(t in text for t in ("謝謝", "先這樣", "bye")):
            action, need, summary = "close", "closure", "使用者表達結束意圖。"
        elif any(t in text for t in ("開心", "成功", "happy", "proud")):
            action, need, summary = "affirm", "positive_sharing", "使用者分享正向感受。"
        elif any(t in text for t in ("難過", "委屈", "害怕", "sad", "afraid")):
            action, need, summary = "reflect", "emotional_support", "使用者直接描述困擾感受。"
    result = {"provisional_need": need, "primary_action": action,
              "evidence": [{"message_id": current["id"], "summary": summary}],
              "uncertainty": "研究用規則示範；非校準機率，非臨床判定。",
              "safety_status": status, "general_support_blocked": status != "clear_for_general_support",
              "case_retrieval": {"requested": False, "reason": "Phase 1 不啟用 RAG；未審核庫為零筆。"},
              "resource_retrieval": {"requested": action == "safety_protocol",
                                     "reason": "交給另行審核的安全／資源介面；本輪不執行查詢。" if action == "safety_protocol" else "此規則示範未要求資源查詢。"},
              "release_status": "NOT_PRODUCTION_READY"}
    return check("router_output", result)
