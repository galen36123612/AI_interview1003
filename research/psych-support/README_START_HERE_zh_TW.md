# Codex 心理支持 AI：交接套件

這個套件是為了把 **資料理解、Router、RAG 案例索引與評估** 拆開開發。
它不是合格的臨床心理服務或可直接公開上線的自動危機處置產品。

## 你要提供 Codex 哪些資料？

必備：
1. `AGENTS.md`：放在 Git repository 根目錄，作為長期開發限制。
2. `CODEX_TASK.md`：本輪要完成的工作與驗收標準。
3. `CODEX_START_PROMPT.md`：開啟 Codex 工作階段時可直接貼上的短訊息。
4. `prompts/original_system_prompt.md`：你之前設計的 System Prompt，這裡依對話內容整理成易讀版，仍需人工確認。
5. `reference/`：上一輪對兩份語料做的初步盤點、8 個案例、原始欄位對應與 Router 草案。
6. 另將你手邊的 `ESConv.json` 和 `train.csv` 放在 `data/raw/` 供 Codex 本地解析。本 ZIP **不含兩份原始大型資料集**。

## 使用方式

1. 將 ZIP 解壓後，把其內容合併放到你的專案 repository 根目錄。若已有 `AGENTS.md`，請先合併規則，不要直接覆蓋。
2. 把原始檔案放好：
   - `data/raw/ESConv.json`
   - `data/raw/train.csv`
3. 將 `.gitignore.snippet` 中的規則**合併**到既有 `.gitignore`；不要提交原始語料、衍生逐字稿、個人資料或 API 金鑰。
4. 在同一個 Codex 工作空間開啟專案，貼上 `CODEX_START_PROMPT.md` 的內容。Codex 只看得到該工作空間實際存在的檔案；這裡的 ChatGPT 附件不會自動同步過去。
5. 先完成 Phase 1 的資料解析、路由介面和測試；是否接上線上模型、實際檢索與部署，是之後分開核准的工作。

如使用雲端 Codex，確認工作空間真的已有 `data/raw/` 兩個檔案，並先確認資料授權和雲端處理方式；若無法合法提供原始語料給該環境，只用 `reference/` 分析資料和自行撰寫的合成測試案例做第一輪規劃。

## 為什麼不讓 Codex 全量建立 RAG？

- 原始策略標籤不等於最佳策略；高分不等於安全。
- `sample_cards.jsonl` 的 `human_approved_strategy` 是 `null`，`runtime_retrieval_enabled` 為 `false`。
- ESConv/EmpatheticDialogues 的授權必須另行確認，不應把原文直接放到商用正式服務。
- 高風險路由和真人交接需要心理專業人員審查；這個階段只做研究原型與阻止不合格案例被放行的技術邊界。

## 交付完畢的標準

Codex 能提供可重現的解析命令、數量核對、型別化的 Router I/O、可追溯的案例審核欄位、避免資料外洩/答案洩漏的測試，以及變更與未完成事項清單。不要以「已經能提供安全心理諮商服務」作為本階段結論。
