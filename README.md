# AI 心理支持研究預覽

本分支 `experiment/psych-support-realtime`（PR #2）將整個網站轉為繁體中文心理支持 AI。首頁 `/` 直接使用心理支持人設與 `gpt-realtime`；原有聊天版型、訊息氣泡、時間、複製、滿意度與麥克風操作保留。`/psych-support` 舊網址會轉回首頁。

`main` 保留完整 AI 面試官。本分支未合併，Vercel production 仍是面試官；心理支持請使用 PR #2 的 Vercel Preview 首頁。

## Prompt 與資料

- `src/app/psych-support/instructions.mjs`：原心理支持設計方向及研究預覽限制，包含情緒承接、少問深聽、不診斷、不捏造經驗與安全優先。
- `src/app/psych-support/policy.mjs`：心理支持固定開場。
- `src/app/agentConfigs/psychologicalSupport.ts`：唯一預設角色，引用同一份心理支持 prompt。
- `src/app/psych-support/turns.mjs`：文字與語音的回合協調；文字收到確認後才回應，空白語音不觸發回答。
- `src/app/api/session/route.ts`：以固定心理支持設定建立 Realtime 連線；瀏覽器不取得標準 API key。
- `research/psych-support/`：離線 Phase 1 Parser、Router Schema、審核與驗證程式。本次線上 A 版僅使用 prompt，尚未串接 Router、RAG 或原始案例。

本分支已移除面試 prompt、面試知識與題目腳本。ESConv、EmpatheticDialogues 原始語料與案例卡不提交 Git，也不部署。

## 本地執行與驗證

```bash
npm install
# 在 .env.local 設定 OPENAI_API_KEY，請勿提交此檔
npm run dev
npm run check
```

開啟首頁，點綠色麥克風開始語音，或直接輸入文字並送出。麥克風旁的小字顯示連線／聆聽／說話狀態，點小字可結束連線；點標題清除對話。

打字時暫停收音，文字回答播放完才恢復；空白辨識只提示重試。一般回答以 2–3 句為目標，語速設定為 0.9 倍。這些是設定與回歸檢查，實際對話效果仍需試聽。

此研究測試會將語音與文字傳送至 OpenAI；請使用虛構情境。Vercel Preview 沿用專案既有的 `OPENAI_API_KEY`。詳見 [預覽測試說明](docs/psych-support-preview.md)。

這是心理支持研究原型，不取代真人心理師。回歸測試驗證接線與資料限制，不代表已完成臨床或實際語音品質驗證。
