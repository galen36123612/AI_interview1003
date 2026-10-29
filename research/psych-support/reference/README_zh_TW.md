# 心理支持 AI：上傳資料盤點與分配草案

## 範圍與完成程度

這份套件依本次上傳的 `ESConv.json` 與 `train.csv` 產生。
已完成全檔結構統計、CSV 讀取方式檢查，以及 8 個特定片段的初步內容分析。
**未完成逐筆心理專業、隱私、授權或臨床安全審核；沒有任何樣本被標成可正式上線。**
案例建議與補充 Prompt 是 AI 提出的開發草案，不是資料集原作者或心理師的認證。

## 實測數量

| 檔案 | 對話數 | 訊息數 | 原始標記 |
|---|---:|---:|---|
| ESConv.json | 1,300 | 38,365 | 18,376 則 supporter 訊息，8 種 strategy |
| train.csv | 19,533 | 84,169 | 32 種 context 情緒標籤，沒有獨立 strategy 欄位 |

這裡的訊息數是檔案實際資料筆數，不是任何套件的訓練樣本數。
ESConv 有 150 段缺少 seeker 的 empathy、relevance 與 final_emotion_intensity；不能補成零。
ESConv 有 996 段存在連續多則 supporter 訊息，因此回應單位不必等於單一 JSON 訊息。
train.csv 有 2 段只有一則訊息，無法從中直接建立 listener 回應配對。

### CSV 讀取陷阱

本檔文字中的引號應當作字面字元。預設 `csv.reader` 會合併部分實體資料行：
它產生 76,673 筆解析記錄，其中 5 筆欄位數異常；按原始格式讀取則得到 84,169 筆、每筆 8 欄。
這不是刪除低品質樣本造成的差異。

本套件使用 `csv.reader(..., quoting=csv.QUOTE_NONE)`，先驗證欄位，再把文字欄中的 `_comma_` 還原成逗號。
原作者程式使用逐行讀取與 `.split(",")`，並在文字欄還原 `_comma_`：
https://github.com/facebookresearch/EmpatheticDialogues/blob/main/empchat/datasets/empchat.py

`load_ed` 專為本來源格式設計，不應直接當成所有 CSV 的通用讀取器。
不要先在整份檔案把 `_comma_` 換成逗號，那會破壞欄位邊界。

## 你要分配的不是整筆資料，而是資訊的用途

- System Prompt：少量跨情境行為原則，以及經審核、權利明確的精簡示範。
- Router：當下可取得的對話前文，以及另行標註的「適合採取什麼動作」。
- 案例檢索：經審核的情境、需求、限制、策略、示例回應、適用與不適用條件。
- 離線品質分析：原始策略、完整情境、後續回饋與整段分數。
- 獨立測試：先保留、未用於 Prompt 調整或索引的完整對話群組。

用途與資料切分是兩個不同軸線。一個開發案例可以同時啟發 Prompt、Router 和檢索設計；
但不能又當成未見過的獨立測試。壞回答不等於「自動成為測試集」。

## 八個可追溯案例

ESConv 的索引均為 Python 的 0-based；train.csv 的 utterance_idx 為來源原有的 1-based。

| case_id | 原始位置 | 初步判斷 |
|---|---|---|
| ES_REFLECTION_CANDIDATE | ESConv[5].dialog[14] | 可候選：反映付出很多卻得不到支持的落差；不能連同附近建議一併採用 |
| ES_PREMATURE_FINANCIAL_ADVICE | ESConv[5].dialog[11] | 不作正面示例：從有限背景提出破產建議 |
| ES_LABEL_CONTENT_MISMATCH | ESConv[1].dialog[50] | 標籤需複核：標為 Reflection of feelings，但實際在建議繼續上課，且未承接手指疼痛限制 |
| ES_PERSONAL_EXPERIENCE | ESConv[0].dialog[16:18] | 人類的第一人稱經驗不能成為 AI 虛構的親身經歷；保留完整連續 supporter 回應區塊 |
| ES_HIGH_SCORE_SAFETY_MISS | ESConv[394].dialog[3:5] | 對話總分高，但此回應區塊未優先確認前文明確自殺表述的安全狀況 |
| ED_GENERIC_REASSURANCE | hit:2_conv:5，utterance_idx=2 | 對面試焦慮只說不要緊張、準備好，列作一般化回應的開發反例 |
| ED_SCENARIO_DIALOGUE_MISMATCH | hit:1_conv:3，utterance_idx=4 | 情境欄寫焊接課的自豪，但對話談黑暗與牆；不可把情境標籤視為每輪真值 |
| ED_POSITIVE_EMOTION_STYLE | hit:3_conv:7，utterance_idx=2 | 可候選：回應正向感受；避免系統把所有分享都當成痛苦或危機 |

所有卡片均保留：
`observed_prefix`、`reference_output_NOT_ROUTER_INPUT`、`audit_only_NOT_ROUTER_INPUT`、
`proposed_strategy_by_ai`、`human_approved_strategy=null`、`runtime_retrieval_enabled=false`。
這些都是已看過的開發案例，不是保留測試集。

## 防止答案與未來資訊洩漏

Router 的輸入是回應之前的使用者訊息與可取得的前文，不包含它正要預測的答案、策略或下一輪回饋。
`survey_score`、`selfeval`、未來訊息及整段結局摘要留在離線分析區。
`situation`、`prompt`、情境情緒標籤只有在正式產品也確實事先取得時，才可當作該輪輸入。
`train.csv` 的 `prompt` 是事件描述，不是你的 system prompt。

`annotation.strategy` 記錄原資料中的策略分類，不代表最佳介入策略。
若要訓練決策 Router，應把原始分類與另行審核的建議分類分開，允許原始標籤有誤。
`selfeval` 的各分數位置在本次檔案中沒有說明，本套件保留原字串，不自行解釋。

## 最小開發流程建議

先以 50～100 個人工審核情境作為原型規模假設，而非效果保證。
先鎖定切分群組，再建立對話片段；翻譯、改寫和多個視窗都跟隨原始群組。
只收到 train.csv，不能宣稱已建立原作者的官方 test split。
案例檢索可以回傳零筆，不需要每輪強制檢索。
正式資源資訊應另外維護，不從這些歷史對話當中抽取成現行政策答案。
本套件沒有訓練模型、建立向量索引、連接外部服務或實作安全 Router。

## 檔案說明與重跑

`audit_summary.json`：全量結構統計與輸入 SHA-256。
`sample_cards.jsonl`：8 個初步開發案例；含原文與來源定位，不是可直接上線的資料。
`field_mapping.json`：各欄位建議用途與禁止混入的位置。
`routing_spec.json`：決策與檢索設計草案；不含可執行的危機分流器。
`system_prompt_addendum_zh_TW.txt`：補充原則，不是完整心理服務 Prompt。
`audit.py`：可在本機重跑的標準函式庫程式，不傳送資料到外部。

```bash
python audit.py --esconv /path/to/ESConv.json --ed /path/to/train.csv --out ./audit_out
```

此命令重建 audit_summary.json 與 sample_cards.jsonl。其餘是設計說明，並非自動從全量資料驗證出來的規則。
範例定位針對本次上傳版本；輸入檔案若更換版本，應先核對 SHA-256 與案例位置再使用。
