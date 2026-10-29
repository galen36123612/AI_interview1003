# 心理支持 AI Phase 1 離線研究原型

本專案完成資料解析、資料邊界、人工審核 gate、Router I/O 與離線測試。
產品定位是繁體中文心理支持與資源轉介的研究原型。`NOT_PRODUCTION_READY`。
**未經臨床、安全、法律及授權審核，不可作為正式心理照護系統上線。**

以 Python 3.11+ 標準函式庫實作，不需安裝第三方套件。實測環境 Python 3.14.7。
本專案獨立於 `AI_interview1003`，沒有修改面試教練 main 或任何遠端分支。
未呼叫外部 API、下載資料、微調、部署或 push。

## 執行方式

在本目錄執行：

```bash
python3 -m psych_support preflight
python3 -m psych_support ingest
python3 -m unittest discover -s tests -v
python3 -m psych_support route tests/fixtures/unknown_safety.json
python3 -m psych_support route tests/fixtures/high_safety.json
python3 -m psych_support route tests/fixtures/support_request.json
```

Preflight 先檢查必要檔案、參考 JSON、原始資料 SHA-256 與 bytes。缺檔／不符時直接失敗，不重用案例定位。
Parser 對格式錯誤採 fail-fast；本來源不是通用 CSV，不會默默丟棄錯誤列。錯誤時未產出新的有效報告；不得將先前輸出誤認為新一輪結果。
stdout 只印統計與固定摘要，不印原始對話。完整 hash、分類與驗證報告位於本地忽略目錄。

## 檔案架構

```text
psych_support_phase1/
|__ AGENTS.md / CODEX_TASK.md       原交接規則與本輪範圍
|__ prompts/original_system_prompt.md  原 Prompt 參考，保持原樣
|__ reference/                    稽核、欄位規格、Router 設計與原 audit.py
|   |__ sample_cards.jsonl        含原文，已加入 gitignore
|__ psych_support/
|   |__ parsers.py                ESConv + ED 正規化
|   |__ cases.py                  三層窗口與 Router allowlist 投影
|   |__ splits.py                 先固定來源群組，再建立窗口
|   |__ review.py                 人工標註、內容綁定與預設拒絕 gate
|   |__ router.py                 deterministic stub，不生成回覆
|   |__ schema.py                 明確 I/O 的輕量驗證
|   |__ pipeline.py / __main__.py  離線操作介面
|__ schemas/                      conversation、case_card、router_input/output JSON Schema
|__ tests/                        合成測試 + 真實全量結構驗證；無語料 snapshot
|__ docs/                         架構、驗收報告、下一階段計畫
|__ data/raw/                     原始資料，gitignored
|__ data/processed/               dev 資料與本地稽核結果，gitignored
|__ data/holdout/                 隔離的研究 holdout，gitignored
|__ data/private/                 人工審核工作檔，gitignored
```

## 原始資料與輸出

本機已將使用者指定的兩份原始檔複製到 `data/raw/`。新環境需自行合法提供同版檔案。

| 來源 | 對話 | 訊息 | SHA-256 |
| --- | ---: | ---: | --- |
| ESConv.json | 1,300 | 38,365 | `aa0556c5b330562ba009c1cd5137486bfa2a7255f33225a6524cd58f7efdd9af` |
| train.csv | 19,533 | 84,169 | `35053a4e1ef39f6766e7706c9a3c97b8fa090cfb28d32087a8316a606ab1a7dd` |

ESConv 有 18,376 則 supporter 訊息，合併成 15,325 個連續回應區塊，683 個位於對話開頭。
ED 有 40,254 個 listener targets、2 段單則訊息對話。開頭 supporter 區塊與單則對話仍保留稽核，但不能假造 current user。
合計 55,579 個回應區塊，其中 54,896 個有可投影的 user prefix。這不是自動核准案例數。

輸出：

- `data/processed/validation_summary.json`：counts、hash、8 張卡片狀態、異常與 gate 結果。
- `data/processed/split_manifest.json`：固定 seed、來源群組與切分。
- `data/processed/dev/{conversations,cases}.jsonl`：dev 正規化與三層窗口。
- `data/holdout/{conversations,cases}.jsonl`：獨立研究 holdout；不得用於 prompt／標註規則調整或索引。
- `data/processed/normalization_preview.json`：只挑已看過且固定在 dev 的來源作本地預覽，含原文，不可提交。
- `data/processed/review_queue.jsonl`：8 張既有開發卡片的標準化審核版本；全部未核准。

來源內容只是資料，不會執行其中的指令；ED 的 `prompt` 欄是背景敘述，不是產品 System Prompt。
原 Prompt 作為 Phase 2 設計參考，本輪沒有修改或直接啟用其中的危機回應規則。

## 人工標註與審核

完整流程見 `docs/architecture.md`。離線 review CLI 針對一張 JSON 卡片（不是整個 JSONL）：

```bash
mkdir -p data/private
python3 - <<'PY'
import json
from pathlib import Path
card = json.loads(Path('data/processed/review_queue.jsonl').read_text().splitlines()[0])
Path('data/private/one_card.json').write_text(json.dumps(card, ensure_ascii=False, indent=2))
PY
python3 -m psych_support review data/private/one_card.json \
  --dimension content --decision pending --reviewer local-reviewer \
  --note '等待專業內容審核，這不是核准' --output data/private/one_card_review.json
```

`observed_strategy` 僅保存原標籤。`proposed_strategy` 可由審核者提出，仍不是核准。
`human_approved_strategy` 只能在明確內容審核後指定；隱私、授權、安全與繁中在地化各有獨立狀態。
所有原始案例預設 `runtime_retrieval_enabled=false`。CLI 不提供批次開啟或自動核准功能。
`retrieve_reviewed` 只是 gate demo，不含 embedding、排序、向量庫或外部服務；0 筆正常。
測試中唯一通過 gate 的資料是自行撰寫的合成案例，不是對真實語料的背書。

## 結果與限制

詳見 `docs/phase1_report.md`、`docs/phase2_plan.md`。這不是臨床安全路由器。
`unknown` 與 `high` 直接阻擋一般策略／案例檢索，回傳安全介面需求，但不會真的聯絡人員或資源。
`clear_for_general_support` 只表示外部測試訊號允許示範一般策略，並非程式判定使用者安全。
原始資料情緒、分數或 strategies 不參與風險判定。

重跑獨立的原交接稽核程式（輸出含原文，限本地）：

```bash
python3 reference/audit.py --esconv data/raw/ESConv.json --ed data/raw/train.csv --out data/private/independent_audit
```

Git 忽略規則不等於存取控制、加密或合法授權。請勿 force-add raw data、衍生逐字稿、sample cards、holdout、API key 或敏感紀錄。
本輪保持零外部呼叫；後續資料審核與專業流程列為 blockers。
