#!/usr/bin/env python3
"""Local structural audit; NOT a clinical review or production retrieval index.

Usage: python audit.py --esconv /path/ESConv.json --ed /path/train.csv --out ./audit_out
Uses only the Python standard library; sends no data to external services.
"""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

ED_HEADER = ['conv_id', 'utterance_idx', 'context', 'prompt', 'speaker_idx', 'utterance', 'selfeval', 'tags']


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_ed(path: Path) -> list[dict[str, Any]]:
    """Quotes are literal in this source format; decode _comma_ AFTER field parsing."""
    result = []
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.reader(f, delimiter=',', quoting=csv.QUOTE_NONE)
        header = next(reader)
        if header != ED_HEADER:
            raise ValueError(f'Unexpected EmpatheticDialogues header: {header}')
        for line_number, parts in enumerate(reader, 2):
            if len(parts) != len(header):
                raise ValueError(f'Line {line_number}: expected 8 fields, got {len(parts)}; do not silently drop this row')
            row = dict(zip(header, parts))
            row['source_line_1based'] = line_number
            for key in ('utterance_idx', 'speaker_idx'):
                row[key] = int(row[key])
            for key in ('prompt', 'utterance'):
                row[key] = row[key].replace('_comma_', ',')
            result.append(row)
    return result


def write_json(path: Path, obj: Any) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--esconv', type=Path, required=True)
    ap.add_argument('--ed', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True)
    a = ap.parse_args()
    for p in (a.esconv, a.ed):
        if not p.is_file():
            ap.error(f'Input file not found: {p}')
    a.out.mkdir(parents=True, exist_ok=True)
    es = json.loads(a.esconv.read_text(encoding='utf-8-sig'))
    if not isinstance(es, list):
        raise ValueError('Expected an ESConv list')
    rows = load_ed(a.ed)
    groups: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in rows:
        groups[row['conv_id']].append(row)
    for cid, group in groups.items():
        group.sort(key=lambda r: r['utterance_idx'])
        if [r['utterance_idx'] for r in group] != list(range(1, len(group) + 1)):
            raise ValueError(f'Nonsequential utterance_idx in {cid}')

    strategies = collections.Counter(t['annotation'].get('strategy', '<missing>') for c in es for t in c['dialog'] if t['speaker'] == 'supporter')
    supporter_blocks = 0
    opening_blocks = 0
    for c in es:
        for i, t in enumerate(c['dialog']):
            if t['speaker'] == 'supporter' and (i == 0 or c['dialog'][i-1]['speaker'] != 'supporter'):
                supporter_blocks += 1
                opening_blocks += int(i == 0)
    with a.ed.open('r', encoding='utf-8-sig', newline='') as f:
        naive = csv.reader(f)
        next(naive)
        naive_rows = list(naive)
    summary = {
        'scope': 'Complete structural counts plus selected developmental content examples. Not a row-by-row clinical, privacy, or license review.',
        'inputs': {
            'esconv': {'filename': a.esconv.name, 'sha256': sha256(a.esconv), 'bytes': a.esconv.stat().st_size},
            'ed': {'filename': a.ed.name, 'sha256': sha256(a.ed), 'bytes': a.ed.stat().st_size}
        },
        'esconv': {
            'conversations': len(es),
            'utterances': sum(len(c['dialog']) for c in es),
            'speakers': dict(collections.Counter(t['speaker'] for c in es for t in c['dialog'])),
            'observed_strategy_counts': dict(strategies.most_common()),
            'conversation_emotion_counts': dict(collections.Counter(c['emotion_type'] for c in es)),
            'conversation_problem_counts': dict(collections.Counter(c['problem_type'] for c in es)),
            'seeker_survey_missing_counts': {k: sum(k not in c['survey_score'].get('seeker', {}) for c in es) for k in ('empathy', 'relevance', 'initial_emotion_intensity', 'final_emotion_intensity')},
            'conversations_with_adjacent_supporter_messages': sum(any(c['dialog'][i]['speaker'] == c['dialog'][i-1]['speaker'] == 'supporter' for i in range(1, len(c['dialog']))) for c in es),
            'contiguous_supporter_blocks': supporter_blocks,
            'supporter_blocks_at_conversation_start': opening_blocks,
            'strategy_counts_are_not_quality_or_recommendation_counts': True
        },
        'empathetic_dialogues_uploaded_train': {
            'physical_data_rows': len(rows),
            'conversations': len(groups),
            'emotion_label_count': len(set(r['context'] for r in rows)),
            'conversation_emotion_counts': dict(collections.Counter(g[0]['context'] for g in groups.values())),
            'utterance_emotion_counts': dict(collections.Counter(r['context'] for r in rows)),
            'dialogue_length_counts': dict(collections.Counter(len(g) for g in groups.values())),
            'speaker_id_count': len(set(r['speaker_idx'] for r in rows)),
            'single_utterance_conversations': [cid for cid, g in groups.items() if len(g) == 1],
            'even_index_listener_messages': sum(r['utterance_idx'] % 2 == 0 for r in rows),
            'context_label_constant_within_each_conversation': all(len(set(r['context'] for r in g)) == 1 for g in groups.values()),
            'prompt_constant_within_each_conversation': all(len(set(r['prompt'] for r in g)) == 1 for g in groups.values()),
            'all_multiturn_conversations_alternate_between_two_speakers': all(len(set(r['speaker_idx'] for r in g)) == 2 and all(g[i]['speaker_idx'] != g[i-1]['speaker_idx'] for i in range(1, len(g))) for g in groups.values() if len(g) > 1),
            'available_columns': ED_HEADER,
            'no_explicit_strategy_field': True,
            'supplied_split': 'train filename only; no official validation/test files supplied'
        },
        'csv_parser_comparison': {
            'source_compatible_quote_none_rows': len(rows),
            'default_csv_reader_rows': len(naive_rows),
            'default_csv_reader_non_8_column_records': sum(len(r) != 8 for r in naive_rows),
            'warning': 'Default quote handling merges physical source records; do not use those parsed rows for indexing.',
            'official_loader_reference': 'https://github.com/facebookresearch/EmpatheticDialogues/blob/main/empchat/datasets/empchat.py'
        },
        'production_approval': {
            'approved_in_this_audit': 0,
            'meaning': 'No examples underwent professional review or deployment approval; not a claim that no examples are usable.',
            'license_status': 'not established by these uploaded data files',
            'clinical_risk_labels_available': False
        }
    }
    write_json(a.out / 'audit_summary.json', summary)

    specs = [
        (5, 14, 'ES_REFLECTION_CANDIDATE', ['router_annotation_candidate', 'retrieval_candidate_after_review', 'system_rule_inspiration'], 'reflect', 'Reflects the effort/support mismatch the seeker has described. Do not copy the neighboring financial advice.', []),
        (5, 11, 'ES_PREMATURE_FINANCIAL_ADVICE', ['development_regression', 'exclude_from_positive_retrieval'], 'support_then_scope_check', 'Proposes bankruptcy from limited conversation context; unsuitable as an authoritative support example.', ['unverified_high_stakes_advice']),
        (1, 50, 'ES_LABEL_CONTENT_MISMATCH', ['relabel_review', 'development_regression', 'exclude_from_positive_retrieval'], 'acknowledge_constraint', 'Tagged Reflection of feelings, but the response suggests lessons after the seeker reports painful finger limitations.', ['strategy_content_mismatch', 'missed_user_constraint']),
        (0, 16, 'ES_PERSONAL_EXPERIENCE', ['adaptation_review', 'system_rule_inspiration'], 'reflect_or_inform_without_invented_experience', 'A human tells a personal debt-collection story. An AI must not present this as its own lived experience.', ['personal_experience_not_portable_to_ai']),
        (394, 3, 'ES_HIGH_SCORE_SAFETY_MISS', ['safety_development_regression', 'exclude_from_positive_retrieval'], 'safety_protocol_review_required', 'The preceding seeker turn explicitly mentions suicide. The next supporter block reassures and explores the relationship rather than first checking immediate safety. High conversation survey scores do not validate this turn.', ['explicit_suicide_content', 'safety_response_gap'])
    ]
    cards: list[dict[str, Any]] = []
    for conv_idx, start, key, uses, proposed, explanation, flags in specs:
        c = es[conv_idx]
        dialog = c['dialog']
        if dialog[start]['speaker'] != 'supporter':
            raise ValueError(f'Expected supporter at ESConv[{conv_idx}].dialog[{start}]')
        end = start
        while end + 1 < len(dialog) and dialog[end+1]['speaker'] == 'supporter':
            end += 1
        prefix = [{'source_turn_index_0based': i, 'role': 'user' if t['speaker'] == 'seeker' else 'assistant', 'content': t['content'].strip()} for i, t in enumerate(dialog[:start])]
        block = dialog[start:end+1]
        cards.append({
            'case_id': key,
            'source': {'dataset': 'ESConv', 'file': a.esconv.name, 'conversation_index_0based': conv_idx, 'conversation_number_1based': conv_idx + 1, 'response_turn_range_0based_inclusive': [start, end]},
            'development_group': f'ESConv:{conv_idx}',
            'split_status': 'development_example_already_inspected_NOT_heldout',
            'observed_prefix': prefix,
            'reference_output_NOT_ROUTER_INPUT': [{'content': t['content'].strip(), 'observed_strategy': t['annotation'].get('strategy')} for t in block],
            'audit_only_NOT_ROUTER_INPUT': {'situation': c['situation'], 'emotion_type': c['emotion_type'], 'problem_type': c['problem_type'], 'survey_score': c['survey_score'], 'next_seeker_annotation': dialog[end+1]['annotation'] if end+1 < len(dialog) else None},
            'proposed_uses': uses,
            'proposed_strategy_by_ai': proposed,
            'human_approved_strategy': None,
            'ai_review_note': explanation,
            'ai_review_flags': flags,
            'review_status': 'ai_preliminary_human_review_required',
            'risk_review_status': 'not_clinically_assessed',
            'license_review_status': 'pending',
            'runtime_retrieval_enabled': False
        })
    ed_specs = [
        ('hit:2_conv:5', 2, 'ED_GENERIC_REASSURANCE', ['development_regression', 'exclude_from_positive_retrieval'], 'acknowledge_specific_anxiety', 'The listener says not to be nervous and to be prepared, without engaging with the described interview anxiety.'),
        ('hit:1_conv:3', 4, 'ED_SCENARIO_DIALOGUE_MISMATCH', ['label_audit', 'development_regression'], None, 'The stored scenario is pride about welding, but the actual dialogue discusses darkness and blank walls. The scenario emotion must not be treated as a per-turn truth.'),
        ('hit:3_conv:7', 2, 'ED_POSITIVE_EMOTION_STYLE', ['style_review_candidate'], 'acknowledge_positive_event_and_invite_detail', 'Useful for checking that the system can respond to positive feelings instead of treating every message as distress. No ESConv-style strategy annotation is supplied.')
    ]
    for cid, target, key, uses, proposed, note in ed_specs:
        g = groups[cid]
        r = next(x for x in g if x['utterance_idx'] == target)
        first = g[0]['speaker_idx']
        cards.append({
            'case_id': key,
            'source': {'dataset': 'EmpatheticDialogues', 'file': a.ed.name, 'conv_id': cid, 'utterance_idx_1based': target, 'physical_line_1based': r['source_line_1based']},
            'development_group': cid.split('_conv:')[0],
            'split_status': 'uploaded_train_development_example_already_inspected_NOT_heldout',
            'observed_prefix': [{'source_utterance_idx_1based': x['utterance_idx'], 'role': 'user' if x['speaker_idx'] == first else 'assistant', 'content': x['utterance']} for x in g if x['utterance_idx'] < target],
            'reference_output_NOT_ROUTER_INPUT': [{'content': r['utterance'], 'observed_strategy': None}],
            'audit_only_NOT_ROUTER_INPUT': {'context': r['context'], 'prompt': r['prompt'], 'selfeval': r['selfeval'], 'tags': r['tags']},
            'proposed_uses': uses,
            'proposed_strategy_by_ai': proposed,
            'human_approved_strategy': None,
            'ai_review_note': note,
            'ai_review_flags': [],
            'review_status': 'ai_preliminary_human_review_required',
            'risk_review_status': 'not_clinically_assessed',
            'license_review_status': 'pending',
            'runtime_retrieval_enabled': False
        })
    with (a.out / 'sample_cards.jsonl').open('w', encoding='utf-8') as f:
        for card in cards:
            f.write(json.dumps(card, ensure_ascii=False) + '\n')
    print(json.dumps({'esconv_conversations': len(es), 'ed_conversations': len(groups), 'ed_rows': len(rows), 'sample_cards': len(cards), 'out': str(a.out)}, indent=2))

if __name__ == '__main__':
    main()
