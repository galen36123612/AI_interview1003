# Phase 1 A–E 完成報告

日期：2026-10-20（Asia/Taipei）。Python 3.14.7，標準函式庫，零新增第三方依賴。

## 交付範圍

| 階段 | 結果 |
| --- | --- |
| A Preflight + privacy | 獨立本地 repository `research/phase1`；核對必要檔案／兩份 raw hash／bytes；原文與衍生資料加入 gitignore |
| B Ingestion | ESConv parser + 原 audit ED parser 的嚴格 wrapper；標準 conversation schema、保真來源資訊、response blocks、統計與本地預覽 |
| C Review gate | prefix／target／audit 邏輯隔離；弱標籤／提議／人工核准分開；五項獨立審核、內容 digest、預設零筆 |
| D Router | 嚴格 JSON I/O + deterministic stub；unknown／high 阻擋一般路由；不生成回覆、不做風險分類、不查外部資源 |
| E Tests + docs | 25 項自動測試通過；全量 ingestion 與原 audit 重跑；操作文件、架構與下一階段計畫 |

未修改 `AI_interview1003`，未觸碰 main，未建立／合併遠端 PR；未 commit、push、微調、呼叫外部 API、部署或啟用 Phase 2。

## 實測輸入

| 來源 | bytes | SHA-256 | 結果 |
| --- | ---: | --- | --- |
| ESConv.json | 9,017,487 | `aa0556c5b330562ba009c1cd5137486bfa2a7255f33225a6524cd58f7efdd9af` | 與交接稽核一致 |
| train.csv | 17,394,764 | `35053a4e1ef39f6766e7706c9a3c97b8fa090cfb28d32087a8316a606ab1a7dd` | 與交接稽核一致 |

`reference/audit.py` 獨立重跑得到的完整 audit summary 與交接版本 JSON 完全相等。
其輸出保存在 `data/private/independent_audit/`，含原文的案例檔不提交。

## 實測數量

| 項目 | 實測 |
| --- | ---: |
| ESConv conversations | 1,300 |
| ESConv turns | 38,365 |
| ESConv supporter messages | 18,376 |
| ESConv contiguous supporter blocks | 15,325 |
| 有連續 supporter 的 conversations | 996 |
| 沒有 current user 的 opening blocks | 683（保留稽核，不投影） |
| ED conversations | 19,533 |
| ED turns／8 欄資料列 | 84,169 |
| ED listener targets | 40,254 |
| ED 單則對話 | 2（保留，沒有 target） |
| ED 情境情緒標籤／來源 participant IDs | 32／810 |
| 全部 response blocks | 55,579 |
| 有 current user 的可投影 prefixes | 54,896 |
| dev conversations／blocks | 16,664／44,508 |
| holdout conversations／blocks | 4,169／11,071 |
| 格式異常／拒絕／默默丟棄 | 0／0／0 |
| 既有案例來源定位通過 | 8／8 |
| 正式核准案例／原案例 runtime 回傳 | 0／0 |

上表的 targets／prefixes 是可研究資料單位，不代表內容適用、安全、合法或可上線。
ED 預設 CSV reader 實測只得到 76,673 records，5 筆非 8 欄；因此必須 QUOTE_NONE，先拆欄再還原 `_comma_`。

## 八張卡片的審核狀態

全部固定在 dev；human_approved_strategy=null、runtime_retrieval_enabled=false。
內容／隱私／授權／安全／繁中在地化全部 pending。以下只是保留的初步複核方向。

| case_id | 後續需要複核的地方 |
| --- | --- |
| ES_REFLECTION_CANDIDATE | 反映情緒的候選；不可連帶採用鄰近高風險建議 |
| ES_PREMATURE_FINANCIAL_ADVICE | 排除正向檢索；有限背景的高影響財務建議 |
| ES_LABEL_CONTENT_MISMATCH | 重標策略，檢查是否忽略使用者限制 |
| ES_PERSONAL_EXPERIENCE | 人類自我揭露不可轉成 AI 虛構經歷；需另建改寫候選再審核 |
| ES_HIGH_SCORE_SAFETY_MISS | 排除正向檢索；高總分不推翻該段的安全處理缺口 |
| ED_GENERIC_REASSURANCE | 一般化安慰的開發反例，排除正向檢索 |
| ED_SCENARIO_DIALOGUE_MISMATCH | 情境欄與可見對話不一致；不可把情緒標籤當每輪真值 |
| ED_POSITIVE_EMOTION_STYLE | 正向分享風格候選；沒有 ESConv strategy，需要獨立標註 |

「候選」不等於核准；資料中的 Others／Self-disclosure 不會自動被當成無用或正確，也不被用來直接決定風險。

## 驗證命令與結果

```bash
python3 -m psych_support preflight
python3 -m psych_support ingest
python3 -m unittest discover -s tests -v
python3 reference/audit.py --esconv data/raw/ESConv.json --ed data/raw/train.csv --out data/private/independent_audit
python3 -m psych_support route tests/fixtures/unknown_safety.json
python3 -m psych_support route tests/fixtures/high_safety.json
python3 -m psych_support route tests/fixtures/support_request.json
```

所有命令成功；`Ran 25 tests ... OK`。測試包含全檔 counts／hash、錯誤 CSV、角色對調、supporter 區塊、目標／未來資訊隔離、樣本 gate、來源群組與變體切分、unknown／high 阻擋、內容指令無法覆寫安全狀態、審核失效／撤回及 gitignore。
CLI 人工標註 smoke test 僅記錄 pending，不核准實際語料。
Router 的一般策略測試與安全訊號測試是合成 fixture，不是臨床敏感度或療效測試。

## 主要實作

- `psych_support/parsers.py`：來源解析與正規化。
- `psych_support/cases.py`：三層窗口、legacy cards 匯入與 Router allowlist。
- `psych_support/review.py`：五項審核紀錄、內容綁定、撤回與 deny-by-default gate。
- `psych_support/splits.py`：來源群組固定 dev／holdout。
- `psych_support/router.py`：僅介面示範，安全訊號先於一般動作。
- `psych_support/pipeline.py`、`__main__.py`：可重跑的本地 CLI。
- `schemas/`、`tests/`：結構契約與自動驗證。

## 尚未解決的問題

1. 未完成逐筆臨床、隱私、授權、內容或安全審查；0 筆真實案例可正式檢索。
2. Router 是詞彙式 deterministic stub，沒有經驗證的風險偵測、策略模型或療效證據。
3. 只有安全移交介面需求，沒有實際真人接手、危機流程或最新資源資料庫。
4. 審核人身分與日誌仍是本地自我聲明，不具正式核准服務的權限保證。
5. ED 的 shared-hit grouping 仍需跨來源近重複／相關事件審查；此切分不是官方 test，不能宣稱模型未見過。
6. 原 Prompt 與補充規則保留參考定位，沒有被宣稱為經專業核准的操作規範。

下一階段僅列計畫於 `docs/phase2_plan.md`；沒有建立 embedding、向量庫、線上模型或正式 RAG。
**未經臨床、安全、法律及授權審核，不可作為正式心理照護系統上線。**
