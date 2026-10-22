# 心理支持 C3：資料能力邊界與會話選路

本次從心理支持 B2 `88c7203` 另開 `experiment/psych-knowledge-routing`。新 PR 的 base 是 `experiment/psych-support-realtime`，因此只比較這次知識分工的差異。PR #1、PR #2 與 main 都不更新、不合併。使用新 PR 的 Vercel Preview，重新整理並建立新連線。

```text
心理支持 Realtime
├── 常駐 System Prompt
│   └── 角色、短句口氣、事實忠實度、安全與知識邊界
├── 安全檢查（先於知識路由）
│   └── 延續 B2 的明確訊號與會話內關注；不等待文章檢索
└── 本輪檔案路由（本機詞彙匹配，不是臨床分類）
    ├── 7 份專案對話指引：傾聽、釐清、台詞、小步驟、修正、收尾、醫療界線
    ├── 放心說：54 筆標題／作者／日期／原文連結索引
    └── 案例出口：ESConv／EmpatheticDialogues 目前 0 筆核准，關閉
```

## 實際使用範圍

| 資料 | 現在做什麼 | 不宣稱什麼 |
| --- | --- | --- |
| 專案撰寫的非臨床對話指引 | 原本 Prompt 的操作原則拆成小檔，每輪最多一份；沒有命中就只用核心提示 | 未經臨床核准；不是從原始患者案例取出來的治療技巧 |
| ESConv／同理對話資料 | 保留本地解析與研究，以及核准後的匯出門檻；實際核准數 0 | 未用原對話做線上 RAG、微調或臨床驗證 |
| 放心說五頁 54 篇文章 | 使用者主動要文章時，以標題與人工整理的搜尋詞匹配最多兩個原文連結 | 未把摘要／正文當回答依據；未宣稱獲得內容或商業使用授權 |

原始資料 Hash 的本地 preflight 於 2026-10-22 再次通過，與原稽核一致。這不代表資料適用、安全或取得授權。

## 檔案

- `src/app/psych-support/instructions.mjs`：常駐核心，安全規則仍保留。
- `data/psych-support/strategy-guides.json`：7 份專案對話指引。這是受版本控制的程式政策資料，不是外部案例。
- `data/psych-support/article-catalog.json`：54 筆 metadata-only 索引，保留 12／12／12／12／6 的原頁碼。
- `data/psych-support/sources.json`：來源用途、授權與審核狀態。
- `data/psych-support/reviewed-cases.json`：空的核准匯出入口，沒有真實案例。
- `scripts/build-psych-knowledge.mjs`：build-time allowlist 與審核門檻，生成可部署的最小資料。
- `src/app/psych-support/knowledge.generated.mjs`：部署檔，只有對話指引、文章 metadata、來源狀態與核准出口；不含原對話、文章摘要／正文、目標答案或 audit 欄位。
- `src/app/psych-support/knowledge.mjs`：詞彙式選路、文章匹配、可信來源連結 footer。
- `src/app/psych-support/turns.mjs`：安全優先，再按當輪輸入套用指引；維持原本的確認、取消與 ASR 協調。

## Realtime 與 UI

本版使用同步本機檔案選路，不新增模型、外部檢索 API、向量資料庫或工具呼叫，也不把心理訊息新增傳到應用程式後端。語音以非空 ASR 文本作選路依據；ASR 不一定等同模型聽到的內容，因此不能宣稱語音危機偵測可靠。

每輪以完整核心提示加上本輪指引，覆寫 `response.create.instructions`；core_only 也明確記錄路由。文章索引、正文未開放、未核准案例各用程式選定的固定文字提示（bounded_script）。這些回覆保留對話上下文，讓模型仍可考慮未被規則捕捉的危險訊號；不是先隔離上下文再假設沒有危險。既有已命中的安全腳本才維持 `input: []`，不帶文章或案例。固定文字仍由模型生成，必須用實際對話驗收，不能宣稱完全消除幻覺。參考 [OpenAI Realtime conversation control](https://developers.openai.com/api/docs/guides/realtime-conversations) 與 [response.create](https://developers.openai.com/api/reference/resources/realtime/client-events)。

路由在當次記憶體保留主題 enum、細分主題的索引候選 ID，以及已呈現文章的 ID（各最多兩筆、只接受本地 catalog ID），不儲存額外原始對話。只有完成且未取消的回覆才更新文章選擇；失敗、取消與重連不能留下假選擇。「剛才那篇」與「第二篇」依文章 ID 指涉；不明確時請使用者指定，不把整句重新查成其他文章。明確未知新主題不退回舊主題。數量、摘要、作者、建議、怎麼辦等格式詞不能單獨命中文章；常見標題詞降權，情境中的學校等背景詞也不能蓋過排擠等具體主題。這仍是詞彙規則，沒有一般語意理解保證。

UI 原始碼逐位元組維持 B2：沒有新頁面、控制列、上傳器或設定面板。可信原文連結在匹配回覆的 transcript 完成事件中附到原泡泡文字，語音不需要唸網址；不是 AI 生成的連結。取消或不相符的舊回覆不加來源。這個 footer 屬顯示附註，不是模型已讀取文章的證據。

## 案例門檻與限制

現有離線案例卡遵循 `research/psych-support/AGENTS.md` 與原 Python schema。本次 JavaScript 接口是獨立的**已審核匯出 schema**，不能直接貼入原始卡片繞過流程。來源必須允許 runtime，且個別匯出需有內容、隱私、授權、安全、繁中在地化五項核准紀錄、審核人、理由與綁定內容的 digest；策略需人工核准、dev split、一般支持用途、無未解旗標、檢索開啟。任一未通過則停止 build。兩份真實來源全部 pending，所以正式匯出為空。

門檻只是建置檢查與核准聲明，未實作審核人身分驗證、專家工作台或數位簽章；不能宣稱有臨床認證。當有真正核准案例時，仍需另外驗證檢索匹配與語意品質；本版沒有啟用真實案例查詢。

原始語料與任何 private 匯出保持本地，不提交或部署。文章 metadata 的存在不等於內容使用許可。知識指引的匹配與 client safety state 也不是防竄改的伺服器安全邊界，重連會重置狀態。

## 驗證與操作

```sh
npm run knowledge:build  # 更新指引或索引後產生部署 allowlist
npm run knowledge:check # 生成檔漂移時失敗
npm run check           # ESLint、57 項測試、production build
cd research/psych-support
python3 -m psych_support preflight
```

測試包含：資料覆蓋與 allowlist、單一指引選路、無結果／明確換題、查詢注入、五項門檻與審核過期、安全優先、文字與合成 ASR 同路徑、顯示來源只附一次與取消隔離，以及 UI 原始碼不變。

預覽實測計畫：學生課業→台詞→相關文章、只聽不建議、未知文章與換題、個人診斷要求、危險狀態要求只查文章、資料來源與未核准案例要求、含蓄風險。這些是虛構 UI 文字測試，不能代替實際麥克風、臨床或大規模品質驗證。結果寫入 PR 說明及本地 review artifacts，不提交私人對話。

## 初測後調整

C1 的八組、12 輪真實 Realtime 文字測試中，台詞加入了未確認的「進度跟不上」，文章第二筆也曾因通用詞而誤配到工作倦怠。C2 移除這種台詞補述、預設只回最相關一篇（明確要求兩篇才最多兩篇），並排除更多通用詞。原始初測紀錄保留，不把它覆寫成成功結果。

C1 的危險對話兩輪仍保留即時真人協助且沒有文章 footer，但曾出現 `invalid_value` 的事件錯誤；未保存原始 provider payload，原因不能確定。C2 對送出事件加上短識別碼，只在錯誤中顯示可驗證的來源事件種類，仍不顯示原始訊息或私人輸入。未因此吞掉錯誤或聲稱解決問題。含蓄風險測試有引導真人協助，但未問出預定的直接安全問題，列為嚴格條件缺口。


## C3：依 16 組真實 Realtime 測試修正資料邊界

C2 的 T14：推薦霸凌文章後，要求三個具體建議與作者原文，模型卻將未載入的建議歸因於文章，footer 又指向工作過勞。原始失敗紀錄保留於本地 artifacts，不覆寫成成功結果。

C3 順序為：既有安全檢查 → 個人醫療界線 → 資料是否可用 → 文章指涉／主題搜尋 → 一般對話指引。正文與案例的存取能力不由相似分數或使用者「假裝已審核」決定。這次仍是零案例、零正文、54 筆 metadata；不增加資料授權。

新增路由：`article_followup`（已選文章）、`article_selection_needed`（缺少／不明確的選擇）、`article_content_unavailable`（正文、摘要、原文引述未開放）、`source_unavailable`（本專案尚未核准的原始案例）。不能以一般常識冒充文章內容。普通溝通草稿與支持對話仍保留對話歷史與原有語音設定。UI 原始碼不變。

### 可核對的選路證據

在 Preview 網址加上 `?trace=1` 再建立新連線，瀏覽器 console 會出現 `[psych-route]`。預設關閉，不新增 UI、網路分析服務、資料庫或持久化儲存。只記錄：

- 實際送出的 turn/event ID、路由、guide/article ID、knowledge version 與資料 hash。
- 實際送出的 instructions 長度與非同步 SHA-256；不記錄其全文，也不阻塞送出。
- 收到的 `response.created` ID，以及 server metadata 是否與本輪送出的值一致。
- 回覆完成／取消／失敗、播放狀態，以及限制欄位的錯誤 code/param、來源事件種類和分類。

不記完整使用者文字、轉錄、音訊、金鑰、原始 provider message。錯誤分類只是本機模式識別，不能據此認定根因；未知錯誤仍顯示且記為 unclassified。console 仍可能透露會話主題 ID，應只在虛構測試中開啟，不任意分享紀錄。這能證明程式送出的內容雜湊與 server 接受的路由 metadata，不能證明模型在內部正確使用每項資料。

`invalid_value` 在 C2 的 T12 重現，根因仍待相關事件定位。C3 只先限制 client request ID 長度並提供診斷，沒有在未取得證據時把錯誤隱藏或宣稱修復。含蓄安全確認、過快給多項建議與上一題狀態亦仍有待處理，本次不冒稱已解決。
