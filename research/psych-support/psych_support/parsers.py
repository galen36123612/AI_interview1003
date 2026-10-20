"""Strict source-specific parsers. Raw annotations never become message content."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from reference.audit import load_ed


class DataError(ValueError):
    """An error with a structural location, never a raw transcript payload."""


@dataclass
class Turn:
    index: int  # source index: ESConv zero-based, ED one-based
    role: str
    source_speaker: str | int
    content: str
    audit: dict[str, Any]


@dataclass
class Conversation:
    dataset: str
    source_id: str
    group_id: str
    turns: list[Turn]
    audit: dict[str, Any]


def parse_esconv(path: Path) -> list[Conversation]:
    raw = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(raw, list):
        raise DataError("ESConv root must be an array")
    result = []
    for ci, conversation in enumerate(raw):
        if not isinstance(conversation, dict) or not isinstance(conversation.get("dialog"), list):
            raise DataError(f"ESConv conversation {ci}: missing dialog array")
        if not conversation["dialog"]:
            raise DataError(f"ESConv conversation {ci}: empty dialog")
        turns = []
        for ti, turn in enumerate(conversation["dialog"]):
            if not isinstance(turn, dict) or turn.get("speaker") not in {"seeker", "supporter"}:
                raise DataError(f"ESConv {ci}/{ti}: invalid speaker")
            if not isinstance(turn.get("content"), str) or not turn["content"].strip():
                raise DataError(f"ESConv {ci}/{ti}: empty/non-text content")
            annotation = turn.get("annotation", {})
            if not isinstance(annotation, dict):
                raise DataError(f"ESConv {ci}/{ti}: invalid annotation")
            turns.append(Turn(ti, "user" if turn["speaker"] == "seeker" else "assistant",
                              turn["speaker"], turn["content"], annotation.copy()))
        source_id = f"ESConv:{ci}"
        result.append(Conversation("ESConv", source_id, source_id, turns,
                                   {k: v for k, v in conversation.items() if k != "dialog"}))
    return result


def parse_ed(path: Path) -> list[Conversation]:
    # Reuse the handoff's audited QUOTE_NONE parser. _comma_ decoding occurs AFTER splitting.
    try:
        rows = load_ed(path)
    except (ValueError, KeyError, StopIteration) as exc:
        raise DataError("ED: invalid header, field count, or integer; no rows silently dropped") from exc
    groups = defaultdict(list)
    for row in rows:
        if not row["conv_id"] or not row["utterance"].strip():
            raise DataError(f"ED source line {row['source_line_1based']}: missing id/content")
        groups[row["conv_id"]].append(row)
    result = []
    for cid, group in groups.items():
        group.sort(key=lambda r: r["utterance_idx"])
        if [r["utterance_idx"] for r in group] != list(range(1, len(group) + 1)):
            raise DataError(f"ED {cid}: duplicate, gap, or non-1-based utterance index")
        speakers = {r["speaker_idx"] for r in group}
        if len(speakers) > 2 or (len(group) > 1 and len(speakers) != 2):
            raise DataError(f"ED {cid}: expected two local participants")
        if any(group[i]["speaker_idx"] == group[i-1]["speaker_idx"] for i in range(1, len(group))):
            raise DataError(f"ED {cid}: roles do not alternate")
        if any(len({r[k] for r in group}) != 1 for k in ("context", "prompt")):
            raise DataError(f"ED {cid}: inconsistent scenario metadata")
        storyteller = group[0]["speaker_idx"]
        turns = [Turn(r["utterance_idx"], "user" if r["speaker_idx"] == storyteller else "assistant",
                      r["speaker_idx"], r["utterance"],
                      {k: r[k] for k in ("selfeval", "tags", "source_line_1based")}) for r in group]
        # Conservatively keep the paired conversations from one hit in one split.
        group_id = "ED:" + cid.split("_conv:")[0]
        result.append(Conversation("EmpatheticDialogues", cid, group_id, turns,
                                   {"context": group[0]["context"], "prompt": group[0]["prompt"]}))
    return result
