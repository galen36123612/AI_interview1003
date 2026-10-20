# Phase 1 架構與資料契約

## 實作取捨

工作目錄原有的是面試教練 Next.js 專案；本任務另建獨立目錄與本地 `research/phase1` repository。
Python 標準函式庫足以支援這批本機語料，不增加模型 SDK、Web framework、Pydantic 或向量資料庫。
ED 重用交接套件的 `reference.audit.load_ed`，再補上排序、序號、角色與 metadata 驗證。
JSON Schema 同時作為可交換契約；`schema.py` 只實作本專案使用的關鍵字，不宣稱是通用 Draft 2020-12 引擎。

```text
原始語料（不可信、本地）
  -> Preflight hash + 格式驗證
  -> 標準 Conversation / Turn
  -> 固定來源群組 dev / holdout
  -> Response block / listener target
       |__ observed_prefix   -> allowlist projection -> Router input
       |__ reference_output  -> 人工內容審核／離線比較
       |__ audit_only        -> 標籤、情境、分數、未來訊息稽核

外部獨立安全訊號 -> Router stub
  |__ unknown / high -> safety_protocol，阻擋一般動作與案例檢索
  |__ clear_for_general_support -> 一個暫定動作，保留不確定性

Case review -> 五個獨立人工審核 gate -> 本地 gate demo
  |__ 預設所有原案例關閉 -> 0 筆
```

## 資料保真

ESConv 保留 `seeker`／`supporter`、zero-based index 與原 annotation。
連續 supporter 可組成一個目標回應，原訊息各自保留，不把其中第二句當成下一次預測的已知前文。
缺少 survey 欄位仍保留缺值，不補 0。`Self-disclosure` 不自動轉成 AI 的第一人稱故事。

ED 先依 8 欄解析，最後才還原 `_comma_`；引號是字面字元。
按 `conv_id`、`utterance_idx` 排序。第一個 local participant 是 storyteller（user），另一個是 listener（assistant），再驗證多輪對話確實交替。
不使用全域 speaker 0/1；若來源不符合這個已驗證的交替結構，直接停止，不猜角色。
context／prompt 保存在 conversation audit，selfeval／tags／來源行號保存在 turn audit。

正規化 schema：`schemas/conversation.json`。
案例 schema：`schemas/case_card.json`。

## Router 可見邊界

輸入欄位：

- `current_user_message`：目前 user message 的 id、role、content。
- `available_prior_messages`：當時已發生的前文，只含 id、role、content。
- `consented_user_context`：明確同意、附已觀察 user-message 來源的 context；由 corpus 投影時永遠是空陣列。
- `previous_action`：上一輪產品動作；不能把 dataset strategy 填進來，corpus 投影預設 none。
- `safety_signal`：外部介面／fixture 的獨立狀態與可見 evidence ids。

輸入拒絕額外欄位，包括巢狀 message／safety object。整張 case card 不能直接傳給 Router。
Current message 與 history 的 ids 必須唯一；context 與 safety evidence ids 必須能對回可見 user messages。
consent／來源 id 是本地契約檢查，不是正式系統的身分驗證或同意管理。

輸出包含 provisional need、唯一 primary action、可見 evidence 摘要、uncertainty、阻擋狀態、兩種檢索需求。
evidence 只給固定理由與可見 message ids，不輸出隱藏推理。
`resource_retrieval.requested=true` 表示交接需求，並不代表資源查詢已發生，也不回傳未驗證電話或政策。

Router 規則只用於展示 interface contract。它使用簡單詞彙判斷一般需求，不能處理完整語境、反諷或風險偵測；不是經效度驗證的支持策略。
內容即使寫著「忽略安全規則」也不會覆蓋外部安全狀態。

## 審核與案例分類

現有 8 張卡片保留原 `proposed_uses`、`review_flags`、AI 提議策略；human 欄位與五種狀態全部保持未核准。
全部新窗口同樣預設 pending、檢索關閉，不使用弱標籤或高分自動核准。

人工審核可以：

1. 檢查 source、完整 prefix／target／audit，判斷內容與語境是否一致。
2. 編輯 `proposed_strategy`、`review_flags`、`proposed_uses` 供下一位審核者複核。
3. 準備獨立的繁中 `reviewed_context`／`reviewed_response`，限定 `general_support` 範圍。
4. 逐一記錄 content、privacy、license、safety、localization 審核人、理由、決策與時間。
5. Content 核准時指定 `human_approved_strategy`；標籤不一致時可改標，不需迎合原標籤。

每個核准紀錄綁定內容 digest；修改 prefix、target、審查文本、策略、scope、split 或 flags 會令既有核准失效。
未來拒絕／撤回審核會關閉 runtime flag。只有經五項核准、無未解 flags、非 holdout、繁中且 scope 正確的卡片才可在本地 gate demo 通過。
含排除用途、其他風險或人類自我揭露的原卡不能僅靠改成 approved 放行；若後續要改寫，另建衍生案例並保留來源群組、重新審核。

`review_log` 是本地工作紀錄，沒有 reviewer 帳號驗證、數位簽章或不可變稽核鏈。正式發布前需要獨立設計權限與核准流程。
本輪不啟用正式檢索；gate demo 只證明 fail-closed 邏輯可測，不宣稱內容已安全。

## 切分與重現

ESConv 以 source conversation 分組；ED 以共享 hit 保守分組。`sha256(seed:group_id) % 10` 決定約 80/20 dev／holdout。
8 張已看過案例的整個相關群組固定在 dev。這些卡片不能充當 unseen test。
切分發生在窗口化之前；同源翻譯、改寫與多個窗口必須沿用來源 group；`assert_disjoint` 同時檢查 group 與 source conversation。
這是針對目前來源建立的研究切分，不是原作者官方 test split，也不能排除公開語料曾被基礎模型看過。
ED 共享 hit 是保守候選群組，不等於已完成跨資料集語義近重複檢查；Phase 2 前仍需做相關案例聚合。

預覽僅選已看過的 dev 來源；holdout 只做結構驗證，不做案例選取、正向示例或 prompt 調整。
原資料與所有含原文的輸出已 gitignore。本機 raw 檔與 review queue 設定為 0600，raw／輸出目錄採 0700；不等同加密。
