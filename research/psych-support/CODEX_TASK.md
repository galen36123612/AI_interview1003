# Codex 任務：心理支持 AI 資料解析與決策架構 v0.1

## Goal
將 ESConv、EmpatheticDialogues 和初步盤點轉成**可重現、可測試、可審核**的離線開發流程。第一輪只完成 Phase 1；先不建立可用於實際使用者的心理諮商服務，也不呼叫外部模型。

## Inputs / 先讀哪些檔案
1. `AGENTS.md`（repo 長期規則）
2. `prompts/original_system_prompt.md`（產品語氣與定位的參考草案，不是臨床核准）
3. `reference/README_zh_TW.md`（資料盤點與已知問題）
4. `reference/audit_summary.json`（數量和原始檔 SHA-256）
5. `reference/field_mapping.json`（哪些欄位能當輸入；哪些只能離線分析）
6. `reference/routing_spec.json`（策略與安全依賴的設計草案）
7. `reference/sample_cards.jsonl`（8 筆已看過的開發案例，不是獨立測試）
8. `reference/system_prompt_addendum_zh_TW.txt`（建議行為限制）
9. `reference/audit.py`（原始資料解析方式，可重用，不要盲目重寫）
10. `data/raw/ESConv.json` 與 `data/raw/train.csv`（若存在，僅本地解析；勿提交或對外傳輸）

## Phase 1 — 本輪要實作

### A. Preflight + privacy
- 先確認 repo 的技術棧、git 狀態、上列檔案和其 hash；缺檔時提供精確路徑與可處理的替代模式，不編造資料。
- 若不是乾淨的工作樹，不覆蓋未提交更動；可建議獨立分支或 worktree，但不自行 push。
- 確保 `.gitignore` 忽略 `data/raw/`、`data/processed/`、`data/holdout/`、原始對話輸出及金鑰（避免把敏感內容寫進測試 snapshot）。

### B. Reproducible ingestion
- 使用現有 `reference/audit.py` 或設計更可測試的 parser，將 ESConv/ED 轉成標準 conversation / turn 結構，保存來源識別碼、序號、原始標籤。
- ESConv：保留 `seeker`/`supporter`，支援連續 supporter 訊息合併為一個候選 response block，原始訊息仍可追溯。
- ED：先解析 CSV 的 8 欄再還原 `_comma_`；依 `conv_id` + `utterance_idx` 分組、排序，判定 speaker 的對話內角色；保留情境 `context`、事件敘述 `prompt` 作為 audit metadata，不能假裝每輪已知。
- 逐步輸出 schema、正規化樣本預覽、統計結果及拒絕/異常筆數。以 `reference/audit_summary.json` 中的 count/hash 當驗證基準。

### C. Three-way turn contract and review gate
為每個候選回應保留三個**邏輯隔離**欄位（可以是實體檔分離）：
1. `observed_prefix`：當時已發生、允許 Router 看到的訊息。
2. `reference_output`：預測目標或待審查回覆；Router 不得取得。
3. `audit_only`：後續回應、回饋分數、未觀察到的背景、原始標籤等。
另新增 `observed_strategy`, `proposed_strategy`, `human_approved_strategy`, `privacy_review_status`, `license_review_status`, `safety_review_status`, `runtime_retrieval_enabled`；預設審核未完成、檢索關閉。

### D. Offline Router interface (research prototype only)
- 定義可測試的 JSON I/O schema (例如 Pydantic 或 JSON Schema，依 repo 既有依賴取捨)。
- 輸入只有 current message、available history、已同意且當輪真正已知的 context、上一輪 action、獨立安全訊號。
- 回傳 provisional need、primary action (`reflect`, `paraphrase`, `clarify`, `affirm`, `suggest`, `inform`, `repair_misunderstanding`, `close` 或 `safety_protocol`)、可見證據摘要、uncertainty、是否檢索案例及是否需資源檢索。
- 不依賴資料集 label 直接判斷危機；未知安全訊號不回傳『確定安全』。安全流程先保留可阻擋一般案例回應的介面，不實作或宣稱臨床級風險判定。
- 沒有經人工與授權審核的案例時，case retrieval 必須安全地回傳零筆。
- 不需建立實際模型服務；可用 deterministic stub / fixture 展示 API 邊界。

### E. Tests + documentation
至少加入 automated tests：
1. ESConv 正確 1,300 conversations / 38,365 turns / 18,376 supporter messages。
2. ED 正確 19,533 conversations / 84,169 turns / 8 欄，不能用預設 CSV quoting 得到錯誤計數。
3. 連續 supporter 訊息被保留並可組塊，回應 target 不進 Router prefix。
4. 未來 feedback / target strategy / final emotion / unseen background 不進 runtime input。
5. 未審查卡片（包括 8 個既有 sample cards）都不能被 runtime retriever 回傳。
6. 不可把 ED 的情緒 `context` 視為當輪真值，不能把 `speaker_idx` 當全域 user/assistant。
7. 不同 group 的切分不導致同一 source conversation 的片段出現在 dev 和 holdout；同源變體維持同一組。
8. `unknown` 風險標記不自動當作 `low`；遇到高風險模擬輸入，一般建議流程應能被阻斷或移交安全介面。

## Phase 2 — 只規劃，不在這輪啟用
- 正式 RAG/embedding：僅經權利、隱私、內容及安全審核的自有或合法案例能被索引；先 0 筆是合理狀態。
- 另外建立台灣官方資源的有日期與來源的資料庫，勿從歷史語料抽出現行政策。
- A/B/C 比較：A 原 Prompt、B +Router、C +Reviewed Retrieval；同一個安全底座、相同 holdout 評測群組；測量同理/主線追蹤/策略合適性/安全漏判。
- 真正的安全分流、人工交接與危機處置需要心理專業驗證和運作流程；未完成前不得公開提供臨床功能。

## Done means
請回報：
- 是否完成 Phase 1 A-E，缺失與受阻原因；
- 主要實作檔案和變更差異；
- 可重現的指令、實測 count、hash、測試通過/失敗結果；
- 哪些 sample cards 維持拒絕檢索、哪些標籤尚待人工複核；
- 值得做但**未**實作的 Phase 2 項目；
- 明確標示『未經臨床、安全、法律及授權審核，不可作為正式心理照護系統上線』。
