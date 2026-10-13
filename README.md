# 面試陪練

給學生與新鮮人的 Realtime AI 面試教練。使用者可以用語音或文字練習自我介紹、論文與專案經驗；教練會一次問一題，逐層追問個人角色、關鍵決策、證據、限制與反思。

## Prompt 結構

- `src/app/agentConfigs/simpleExample.ts`：穩定的人設、口氣、行為邊界、路由原則與安全護欄。
- `src/app/data/interviewCoachKnowledge.ts`：從兩本 benchmark 書整理出的提問方法與回饋規準。
- `src/app/data/interviewCoachScripts.ts`：自我介紹、論文、專案與模擬面試的分支腳本。
- `src/app/data/interviewCoachDomains.ts`：第一版 domain 路由索引；日後可加入經審查且有版本的專業知識包。
- `scripts/validate-interview-coach.mjs`：prompt 必備行為與舊角色移除檢查。

## 本地執行

需求：Node.js 20 以上，以及可使用 Realtime API 的 `OPENAI_API_KEY`。

```bash
npm install
cp .env.example .env.local
npm run dev
```

打開 `http://localhost:3000`，點選「開始語音練習」並允許麥克風權限。

## 驗證

```bash
npm run check
```

這會依序執行 ESLint、prompt 行為契約測試與 Next.js production build。

## Vercel

在 Vercel project 設定 `OPENAI_API_KEY`。推送 `main` 後，既有 Git integration 會觸發 production deployment。

## 第一版產品邊界

- 目標使用者：學生與新鮮人。
- 核心題型：自我介紹、論文研究、專案經驗。
- 評分只在證據足夠時針對相關性、具體性、個人貢獻與表達結構進行。
- 不捏造經歷；專業內容沒有可靠 reference 時標記待查證。
