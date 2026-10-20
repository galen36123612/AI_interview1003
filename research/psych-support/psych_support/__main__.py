"""Run with python3 -m psych_support --help. All commands are offline."""
import argparse
import json
from pathlib import Path

from .pipeline import preflight, run
from .review import record_review
from .router import route
from .schema import check


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    commands = ap.add_subparsers(dest="command", required=True)
    commands.add_parser("preflight")
    commands.add_parser("ingest")
    r = commands.add_parser("route")
    r.add_argument("input", type=Path, help="local JSON fixture, not a whole case card")
    review = commands.add_parser("review")
    review.add_argument("input", type=Path, help="one local case JSON, not JSONL")
    review.add_argument("--dimension", choices=["content", "privacy", "license", "safety", "localization"], required=True)
    review.add_argument("--decision", choices=["pending", "approved", "rejected"], required=True)
    review.add_argument("--reviewer", required=True)
    review.add_argument("--note", required=True)
    review.add_argument("--strategy")
    review.add_argument("--output", type=Path, required=True)
    args = ap.parse_args()
    try:
        if args.command == "preflight":
            result = preflight()
        elif args.command == "ingest":
            summary = run()
            result = {k: summary[k] for k in ("release_status", "hashes_match_reference", "counts", "windows",
                                             "malformed_records", "sample_locator_checks", "runtime_returned_samples")}
        elif args.command == "route":
            result = route(json.loads(args.input.read_text()))
        else:
            card = check("case_card", json.loads(args.input.read_text()))
            updated = record_review(card, dimension=args.dimension, decision=args.decision,
                                    reviewer=args.reviewer, note=args.note, approved_strategy=args.strategy)
            check("case_card", updated)
            # Review outputs contain sensitive text; constrain them to the ignored private tree.
            private = Path(__file__).resolve().parents[1] / "data/private"
            if not args.output.resolve().is_relative_to(private.resolve()):
                raise ValueError("Review output must be under data/private/")
            from .pipeline import write_json
            write_json(args.output, updated)
            result = {"case_id": updated["case_id"], "decision_recorded": True,
                      "runtime_retrieval_enabled": updated["runtime_retrieval_enabled"]}
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, KeyError, OSError) as exc:
        ap.exit(1, f"Validation failed ({type(exc).__name__}): {exc}\n")


if __name__ == "__main__":
    main()
