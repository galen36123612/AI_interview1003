請閱讀 repository 根目錄的 `AGENTS.md` 與 `CODEX_TASK.md`，並依 `CODEX_TASK.md` 完成 **Phase 1（A–E）**。這是繁體中文心理支持 AI 的研究原型，不是臨床心理師服務。

先檢查 repo 現況、`data/raw/ESConv.json`、`data/raw/train.csv` 與 `reference/` 文件；不要假設你能讀取目前工作空間之外的附件。遇到缺檔、Hash 不一致、授權/安全疑慮要清楚列出，不可猜測。

請建立可重現的 parser、資料分層（observed_prefix / reference_output / audit_only）、待人工審核的案例 schema、offline Router I/O、單元測試與操作 README。保留既有架構，嚴禁未審核案例進正式檢索；不要讓原始標籤或高分對話自動變成正確示範。

先只做本地離線功能：不要微調、不要對外傳資料、不要呼叫外部 API、不要部署或 push，未經另外批准不要開始 Phase 2。完成後提供測試實際輸出、數量核對、修改檔案、已知限制與下一階段計畫。
