"""Offline reproducible ingestion. Sensitive outputs are local and gitignored."""
from collections import Counter
from contextlib import ExitStack
import csv
import hashlib
import json
from pathlib import Path
from dataclasses import asdict

from .cases import import_sample_card, iter_cases, router_input
from .parsers import parse_ed, parse_esconv
from .review import retrieve_reviewed
from .schema import check
from .splits import assign_splits

ROOT = Path(__file__).resolve().parents[1]


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    path.chmod(0o600)


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def preflight(root=ROOT):
    required = ["AGENTS.md", "CODEX_TASK.md", "prompts/original_system_prompt.md",
                "reference/audit_summary.json", "reference/field_mapping.json",
                "reference/routing_spec.json", "reference/sample_cards.jsonl",
                "reference/README_zh_TW.md", "reference/audit.py",
                "reference/system_prompt_addendum_zh_TW.txt",
                "data/raw/ESConv.json", "data/raw/train.csv"]
    missing = [str(root / p) for p in required if not (root / p).is_file()]
    if missing:
        raise ValueError("Missing required files: " + ", ".join(missing))
    expected = json.loads((root / "reference/audit_summary.json").read_text())
    hashes = {p: sha256(root / p) for p in required}
    mismatches = []
    for key, path in (("esconv", "data/raw/ESConv.json"), ("ed", "data/raw/train.csv")):
        ref = expected["inputs"][key]
        if hashes[path] != ref["sha256"] or (root / path).stat().st_size != ref["bytes"]:
            mismatches.append({"path": path, "actual_sha256": hashes[path], "expected_sha256": ref["sha256"]})
    if mismatches:
        raise ValueError("Hash/size mismatch; source locators NOT reused: " + json.dumps(mismatches))
    for name in ("field_mapping", "routing_spec"):
        json.loads((root / f"reference/{name}.json").read_text())
    return {"input_sha256": hashes, "hashes_match_reference": True,
            "python_requirement": ">=3.11", "dependencies": "Python standard library only"}


def load_samples(root=ROOT):
    raw = [json.loads(line) for line in (root / "reference/sample_cards.jsonl").read_text().splitlines() if line.strip()]
    return raw, [check("case_card", import_sample_card(c)) for c in raw]


def validate_sample_locations(raw_samples, conversations):
    index = {(c.dataset, c.source_id): c for c in conversations}
    for card in raw_samples:
        src = card["source"]
        if src["dataset"] == "ESConv":
            conv = index[("ESConv", f"ESConv:{src['conversation_index_0based']}")]
            start, end = src["response_turn_range_0based_inclusive"]
        else:
            conv = index[("EmpatheticDialogues", src["conv_id"])]
            start = end = src["utterance_idx_1based"] - 1
        actual_prefix = [(t.role, t.content.strip()) for t in conv.turns[:start]]
        ref_prefix = [(t["role"], t["content"].strip()) for t in card["observed_prefix"]]
        actual_target = [(t.content.strip(), t.audit.get("strategy")) for t in conv.turns[start:end+1]]
        ref_target = [(t["content"].strip(), t.get("observed_strategy")) for t in card["reference_output_NOT_ROUTER_INPUT"]]
        if actual_prefix != ref_prefix or actual_target != ref_target:
            raise ValueError(f"Sample source locator/content mismatch: {card['case_id']}")


def run(root=ROOT):
    pre = preflight(root)  # fail BEFORE writing anything on missing or changed sources
    es, ed = parse_esconv(root / "data/raw/ESConv.json"), parse_ed(root / "data/raw/train.csv")
    convs = es + ed
    raw_cards, samples = load_samples(root)
    validate_sample_locations(raw_cards, convs)
    if len(samples) != 8 or len({c["case_id"] for c in samples}) != 8:
        raise ValueError("Expected exactly eight unique inspected development cards")
    splits = assign_splits(convs, {c["group_id"] for c in samples})
    expected = json.loads((root / "reference/audit_summary.json").read_text())
    stats = {"ESConv": {"conversations": len(es), "turns": sum(len(c.turns) for c in es),
                         "supporter_messages": sum(t.role == "assistant" for c in es for t in c.turns)},
             "EmpatheticDialogues": {"conversations": len(ed), "turns": sum(len(c.turns) for c in ed),
                                      "columns": 8, "unpaired_single_turn_conversations": sum(len(c.turns) == 1 for c in ed)}}
    if (stats["ESConv"]["conversations"], stats["ESConv"]["turns"], stats["ESConv"]["supporter_messages"],
        stats["EmpatheticDialogues"]["conversations"], stats["EmpatheticDialogues"]["turns"]) != (
            expected["esconv"]["conversations"], expected["esconv"]["utterances"], expected["esconv"]["speakers"]["supporter"],
            expected["empathetic_dialogues_uploaded_train"]["conversations"], expected["empathetic_dialogues_uploaded_train"]["physical_data_rows"]):
        raise ValueError("Parsed counts differ from audited baseline; no partial output accepted")
    with (root / "data/raw/train.csv").open(newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)
        naive_lengths = Counter(len(row) for row in reader)
    out = root / "data/processed"
    private_paths = {"dev": out / "dev", "holdout": root / "data/holdout"}
    for directory in private_paths.values():
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
    counts, openings = Counter(), Counter()
    strategy_counts = Counter()
    with ExitStack() as stack:
        streams = {}
        for split, directory in private_paths.items():
            for kind in ("conversations", "cases"):
                path = directory / f"{kind}.jsonl"
                f = stack.enter_context(path.open("w"))
                path.chmod(0o600)
                streams[split, kind] = f
        for c in convs:
            split = splits[c.group_id]
            normalized = check("conversation", asdict(c))
            streams[split, "conversations"].write(json.dumps(normalized, ensure_ascii=False) + "\n")
            counts[f"{split}_conversations"] += 1
            for t in c.turns:
                if c.dataset == "ESConv" and t.role == "assistant":
                    strategy_counts[t.audit.get("strategy", "<missing>")] += 1
            for card in iter_cases(c, split):
                check("case_card", card)
                streams[split, "cases"].write(json.dumps(card, ensure_ascii=False) + "\n")
                counts[f"{c.dataset}_candidate_blocks"] += 1
                counts[f"{split}_candidate_blocks"] += 1
                if not card["observed_prefix"]:
                    openings[c.dataset] += 1
                else:
                    router_input(card)  # schema check of the actual projection, with unknown safety
                    counts["router_eligible_prefixes"] += 1
    manifest = {"seed": "psych-phase1-v1", "split_unit": "ESConv conversation / ED shared hit",
                "official_test_split": False, "groups": splits,
                "pinned_inspected_groups": sorted({c["group_id"] for c in samples})}
    write_json(out / "split_manifest.json", manifest)
    # Local preview only. These fields include source dialogue and stay ignored.
    inspected_ed_id = next(c["source"]["conv_id"] for c in raw_cards if c["source"]["dataset"] == "EmpatheticDialogues")
    preview_ed = next(c for c in ed if c.source_id == inspected_ed_id)
    write_json(out / "normalization_preview.json", [asdict(es[0]), asdict(preview_ed)])
    with (out / "review_queue.jsonl").open("w") as f:
        (out / "review_queue.jsonl").chmod(0o600)
        for c in samples:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    summary = {"release_status": "NOT_PRODUCTION_READY", **pre, "counts": stats,
               "windows": dict(counts), "opening_blocks_without_current_user": dict(openings),
               "observed_strategy_counts": dict(strategy_counts),
               "csv_parser_comparison": {"quote_none_rows": stats["EmpatheticDialogues"]["turns"],
                                         "default_quoting_rows": sum(naive_lengths.values()),
                                         "default_quoting_non_8_column_records": sum(v for k, v in naive_lengths.items() if k != 8)},
               "malformed_records": 0, "rejected_records": 0, "silently_dropped_records": 0,
               "sample_locator_checks": len(samples), "sample_cards": len(samples),
               "runtime_returned_samples": len(retrieve_reviewed(samples, safety_status="clear_for_general_support")),
               "production_approved_cards": 0,
               "review_pending": {c["case_id"]: {"human_approved_strategy": c["human_approved_strategy"],
                                                   "runtime_retrieval_enabled": False} for c in samples}}
    write_json(out / "validation_summary.json", summary)
    return summary
