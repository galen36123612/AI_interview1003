/** Conservative explicit-signal guard, NOT a clinical classifier or server boundary.
 * State is one concern enum in tab memory. No transcript or corpus is stored here.
 * Unmatched, indirect, quoted, multilingual and mistranscribed signals still need
 * model judgement. A new connection resets state; this does not establish safety.
 */
// 專線號碼是程式寫死的已查核資源（台灣），不是模型憑記憶提供；instructions.mjs 仍禁止模型自行補充其他號碼。
const SCRIPTS = Object.freeze({
  check: "你剛才的話讓我擔心你現在的安全，我想先直接確認：你現在有想傷害自己，或怕自己會立刻做出傷害自己的事嗎？如果有，或你也不確定能不能控制，請現在聯絡安全、可信任的大人或身邊的人陪你，或撥打 1925 安心專線，二十四小時都有人接；若可能立刻行動或已受傷，立即撥打 119 或 110。我無法替你聯絡或到場。",
  self: "你說可能會傷害自己，我很在意你現在的安全。請現在聯絡一位安全、可信任的大人或身邊的人，直接說：『我怕自己會傷害自己，請現在陪我。』先不要獨處；如果能安全做到，離開危險物品所在的位置，不必自己收拾。若已受傷或可能立刻行動，請立即撥打 119 或 110，或請身邊的人代為聯絡。也可以隨時撥打 1925 安心專線或 1995 生命線，會有人陪你談。我無法替你聯絡或到場；你現在能聯絡誰陪你？",
  others: "你提到可能傷害別人，現在先以你和對方的安全為主。我不能提供傷害或報復的方法。若能安全做到，先與對方保持距離，不要去找對方，也不要拿取危險物品。請現在找安全、可信任的大人或身邊的人協助；如果可能立刻動手，請立即撥打 110 或 119。我無法替你聯絡；你現在能請誰來協助？",
  medical: "你提到已經受傷或吞下可能有害的東西，請現在立即撥打 119，或請身邊的人代為撥打並陪著你。不要等這段對話結束或等症狀出現才求助。我不能判定嚴重程度、計算安全劑量或提供自行處理的方法，也無法替你叫救援。你現在能聯絡誰來協助？",
  home: "你提到現在有人可能傷害你，先以你的安全為主。如果能安全做到，去有安全的人在場的地方，聯絡其他可信任的大人、學校輔導老師，或撥打 113 保護專線；有立即危險時撥打 110。不必先向可能傷害你的人說明或對質。我不能保證保密、阻止報復或替你聯絡救援。你現在能安全地找誰協助？",
  method: "你問到會造成傷害的劑量或方法，我不能提供這類資訊，也不會幫你比較。我更在意的是你現在怎麼了：你現在有想傷害自己的念頭嗎？如果有，請現在聯絡安全、可信任的大人或身邊的人陪你，或撥打 1925 安心專線；若已經服用或受傷，立即撥打 119。我無法替你聯絡或到場。",
  // Spoken when a check is still open and the user deflects; shorter than the first ask so it does not sound like a loop.
  check_repeat: "我還是想先確認一下：你現在安全嗎？有沒有想傷害自己的念頭？如果有，請現在找身邊可信任的人陪你，或撥打 1925 安心專線；有立即危險就撥打 119 或 110。",
  // Follow-ups while a self concern stays latched: the full script is spoken once, then the reply answers what the user said.
  self_repeat: "我還是很在意你現在的安全。你現在身邊有人陪嗎？如果沒有，請現在聯絡一位可信任的人，或撥打 1925 安心專線，二十四小時都有人接；若可能立刻行動或已受傷，立即撥打 119 或 110。",
  self_contact: "好，謝謝你告訴我。請現在就去找他們，或打電話給他們，直接說：『我怕自己會傷害自己，請現在陪我。』在他們來到你身邊之前，先不要獨處。如果聯絡不上，可以撥打 1925 安心專線；若可能立刻行動或已受傷，立即撥打 119 或 110。他們陪在你身邊之後，再告訴我。",
  self_confirm: "聽到你說好一點了，謝謝你告訴我。在聊別的之前，我想先確認兩件事：你現在還有想傷害自己的念頭嗎？身邊有沒有人陪著你？",
  self_confirm_repeat: "謝謝你回答。我還需要確認清楚這兩件事：你現在還有想傷害自己的念頭嗎？身邊有人陪著你嗎？如果還有念頭，或現在沒有人陪，請撥打 1925 安心專線；有立即危險就撥打 119 或 110。",
  supported: "你說現在沒有立即傷害的打算，而且已有可信任的人在身邊陪著，謝謝你告訴我。請先繼續和對方待在一起，把剛才的危險念頭告訴他；若危險再出現或已受傷，立即請對方協助撥打 119 或 110；想找人談時也可以撥打 1925 安心專線。我無法確認現場安全，也不能取代真人協助。",
});

const PRIORITY = ["medical", "others", "self", "home", "method", "check"];
// Someone else's feelings (他想死), idiom intensifiers (累到想死) and reported speech (說想死) are not a first-person statement.
const NOT_SELF = "(?<!(?:他|她|們|们|朋友|同學|同学|家人|媽媽|妈妈|爸爸|我媽|我爸|孩子|小孩|弟弟|妹妹|哥哥|姊姊|姐姐|男友|女友|老公|老婆|學生|学生|個案|有人|別人|别人|主角|角色)(?:也|又|都|常|會|会|就|一直|很|好|真的)?)(?<![到得說说])(?<![到得]我)";
const DEATH_WORD = "死(?!心|線|线|黨|党|機|机|記|记|角|板|守|背|你|妳|他|她|我了)";
const SELF_CORE = new RegExp(`${NOT_SELF}想(?:要)?(?:去)?(?:${DEATH_WORD}|自殺|自杀|輕生|轻生|紫砂|自鯊|自sha|zisha|ㄗˋㄕㄚ|自我了斷|自我了断|了結自己|了结自己|了斷自己|結束生命|结束生命|結束自己|結束這一切|結束一切|割腕|割自己|die\\b|4了|4掉|上吊(?!單槓)|燒炭(?!烤)|烧炭(?!烤)|自盡|自尽|尋短|寻短|尋死|寻死|自殘|自残|吞藥|吞药|一覺不醒|嘎掉|嘎了|自砂|自沙|死一死|(?:4|s)(?:$|[。！，,]))(?!的(?:朋友|人|同學|同学|家人|孩子|學生|学生|個案|他|她))`, "i");

/** Wider first-person, slang, English and situation patterns found by scripts/stress-psych-safety.mjs. */
function extendedConcern(positive) {
  // Spacing and punctuation inserted between characters (我想 死 / 我。想。死) must not hide a core statement.
  const compact = positive.replace(/[\s.．·・,，、。\-_*~]+/g, "");
  const B = "[^。！？；\\n]";
  const has = (source, flags = "") => new RegExp(source, flags).test(positive);
  if (has(`(?:剛才|刚才|剛剛|刚刚|已經|已经|剛|刚)${B}{0,6}(?:吃了|吞了|喝了|吃下|吞下)${B}{0,8}(?:一整排|一整瓶|整瓶|整排|整罐|一堆|很多|大量|好幾顆|好几颗|幾十顆|几十颗)`)
    || has("(?:喝了|喝下|吞了)(?:農藥|农药|漂白水|清潔劑|清洁剂|巴拉刈|鹽酸|盐酸|殺蟲劑|杀虫剂)")
    || has(`(?:剛才|刚才|剛剛|刚刚|已經|已经|正在)${B}{0,3}(?:燒炭|烧炭|割腕|割了|上吊)`)
    || has("(?:吞了|吃了|吞下|吃下)(?:[一二三四五六七八九]?十[一二三四五六七八九]?|[1-9]\\d+|幾十|几十|上百|一百)(?:多)?(?:顆|颗|粒)")
    || has(`喝了${B}{0,3}(?:農藥|农药|漂白水|清潔劑|清洁剂|巴拉刈|鹽酸|盐酸|殺蟲劑|老鼠藥)`)
    || has("吃(?:了)?太多藥|藥吃太多|吃藥過量|服藥過量|吃了?太多药")
    || has("手上都是血|流了?(?:很多|好多)血|血流不止|一直在流血|血停不下來|血止不住")) return "medical";
  if (has(`我${B}{0,8}(?:想|要|打算|準備|准备)${B}{0,8}(?:捅|砍死|砍他|砍她|刺死|殺死|杀死|弄死|打死|掐死|毒死|推下去|推下樓|推下楼)`)
    || has(`讓(?:他|她|他們|她們|對方)付出代價${B}{0,12}(?:準備好|准备好|計畫好|计划好)`)
    || has(`(?:想|要)報復${B}{0,10}(?:消失|去死|死)|(?:想|要)讓(?:他|她|他們|她們|對方|所有人|全部的人)(?:都)?(?:消失|去死|死)`)
    || has(`我${B}{0,6}(?:要|想|會|会)${B}{0,2}(?:拿|帶|带)刀${B}{0,3}(?:去|找)`)) return "others";
  if (SELF_CORE.test(positive) || SELF_CORE.test(compact)
    || has(`我${B}{0,6}(?:不想再活|不想繼續活|不想继续活|不要活了|不想活了)`)
    || has(`我${B}{0,10}(?:又)?(?:想|要)${B}{0,3}(?:割自己|割腕|了結自己|了斷自己|自我了斷|輕生|轻生)`)
    || has(`(?:開始|又|一直|忍不住)${B}{0,3}割(?:手|自己|腕|大腿)`)
    || has("我(?:有|已經有|已经有)?(?:自殺|自杀)(?:的)?(?:計畫|計劃|计划|打算)")
    || has(`${NOT_SELF}想不開|${NOT_SELF}想不开`)
    || /\bi\s*(?:don'?t|do\s*not)\s*(?:want|wanna)\s*(?:to\s*)?live\b/i.test(positive)
    || /\b(?:i\s*(?:wanna|want\s*to|wanted\s*to|am\s*going\s*to|gonna|plan\s*to)\s*(?:die|kill\s*myself|end\s*(?:it|my\s*life)|hurt\s*myself)|kms|kill(?:ing)?\s*myself)\b/i.test(positive)
    || /\bwo\s*xiang\s*(?:si|zi\s*sha)\b/i.test(positive)) return "self";
  if (has(`(?:男朋友|女朋友|男友|女友|老公|老婆|先生|太太|同居人|繼父|继父|繼母|继母|哥哥|叔叔|舅舅)${B}{0,12}(?:現在|现在|正在|剛才|刚才|剛剛|刚刚|今晚|每天|常常|又)${B}{0,10}(?:打我|揍我|傷害我|伤害我|威脅我|威胁我|掐我|踹我)`)
    || has(`(?:繼父|继父|繼母|继母|爸爸|叔叔|舅舅|哥哥|爺爺|爷爷|老師|老师|教練|教练|他)${B}{0,10}(?:摸我|碰我身體|脫我|脱我|性侵|猥褻|猥亵|強迫我|强迫我)`)
    || has(`(?:繼父|继父|爸爸|叔叔|舅舅|哥哥|爺爺|爷爷)${B}{0,4}(?:每天|每晚|晚上|半夜|偷偷|常常|又)${B}{0,6}(?:進我房間|进我房间)`)
    || has(`被(?:爸爸|媽媽|妈妈|家人|繼父|继父|繼母|继母|男友|男朋友|老公|先生)${B}{0,4}(?:關|关|鎖|锁)在`)
    || has(`(?:我媽|我爸|媽媽|妈妈|爸爸|阿公|阿嬤|哥哥|男友|男朋友|老公)${B}{0,6}拿${B}{1,5}(?:抽我|打我|揍我|砸我|燙我)`)
    || has(`(?:男朋友|女朋友|男友|女友|老公|老婆|爸爸|媽媽|我爸|我媽|繼父|哥哥|他)${B}{0,6}(?:說)?要(?:殺了我|殺我|打死我|弄死我)`)
    || has(`不敢回家${B}{0,10}(?:被打|打我|會打)|回(?:家|去)(?:就)?會被打`)) return "home";
  if (has(`幾樓${B}{0,6}(?:會死|会死|摔死|才會死|跳下)`)
    || has(`(?:燒炭|烧炭|上吊(?!單槓)|跳樓(?!大拍賣)|跳楼|吞藥|吞药|服毒|開瓦斯|开瓦斯)${B}{0,4}(?:要怎麼|怎麼|怎样|怎樣|如何|方法|步驟|步骤|要準備|要准备)`)
    || has(`(?:怎麼|怎樣|如何)${B}{0,2}(?:燒炭(?!烤)|烧炭(?!烤)|上吊(?!單槓)|服毒|開瓦斯)`)
    || has(`(?:吃|吞)(?:多少|幾|几)(?:顆|颗|粒|瓶)${B}{0,8}(?:才夠|才够|才會|會怎樣|會死)`)
    || has(`(?:跳樓(?!大拍賣)|跳楼|上吊(?!單槓)|燒炭(?!烤)|割腕|吞藥)${B}{0,3}(?:會痛|会痛|會不會痛|痛不痛|會死嗎|要多久)`)
    || has("割哪裡|割哪里|死得(?:比較)?快|死最快")
    || has(`(?:一氧化碳|瓦斯|燒炭|烧炭|安眠藥|農藥|农药)${B}{0,6}(?:多久|幾分鐘|几分钟)${B}{0,3}(?:會死|会死|死)`)
    || has(`(?:什麼|哪些|哪種|哪种)藥${B}{0,6}(?:會死|会死|致命|致死)`)
    || has(`(?:漂白水|清潔劑|清洁剂|農藥|农药|鹽酸|老鼠藥)${B}{0,3}(?:喝|吃)${B}{0,3}(?:會怎樣|会怎样|會死|會不會死)`)
    || has("讓自己(?:消失|死)|沒有痛苦(?:地|的)?(?:死|走|離開|消失)|消失得沒有痛苦")
    || has(`哪種藥${B}{0,10}(?:救不回來|不會被救|会死|會死|致命)`)
    || has("致死劑量|致死剂量|致死量|致命劑量|致命剂量")
    || has(`安眠藥${B}{0,4}(?:配|加|混)${B}{0,2}酒|酒${B}{0,2}(?:配|加|混)${B}{0,4}安眠藥`)
    || has("死法")) return "method";
  if (has("我是(?:大家|家人|他們|别人|別人|全家)?的?(?:負擔|负担|累贅|累赘|包袱)")
    || has("我(?:真的|已經|已经|快要?)?(?:撐不下去|撑不下去)了?(?:$|[。！，,！])")
    || has("活著(?:好|很|太|真的好)痛苦|活着(?:好|很|太)痛苦")
    || has("想永遠睡著|想永远睡着|永遠不(?:要|用)(?:醒|起來)|永远不(?:要|用)(?:醒|起来)|睡著不要醒")
    || has(`我${B}{0,2}死了${B}{0,6}(?:沒人|没人|沒有人|没有人)`)
    || has("世界不需要我|沒有人需要我|没有人需要我|沒人需要我")
    || has(`(?:怎麼|怎样|怎樣|如何)跟${B}{0,6}(?:道別|道别|告別|告别|說再見)`)
    || (has(`(?:東西|东西|物品|收藏)${B}{0,6}(?:送人|送走|送給|送给)`) && has("不會再(?:麻煩|拖累|打擾)|不会再(?:麻烦|拖累|打扰)"))
    || has("我(?:真的|已經)?不想存在")
    || has(`${NOT_SELF}想(?:要)?(?:解脫|解脱)(?:了)?(?:$|[。！，,])`)
    || has("沒有?人會想念我|沒人會難過|没有人会想念我")
    || has(`我(?:走了|不在|離開|离开)(?:之後|以後|之后|以后)${B}{0,6}(?:請|请|幫我|帮我|照顧|照顾|拜託)`)
    || has("我(?:覺得)?(?:自己)?(?:很|是)多餘|我是多餘的")
    || has("不配活著|不該活著|不值得活|不配活着")
    || has(`睡${B}{0,4}不要(?:再)?醒`)
    || has("沒有?(?:任何)?活下去的(?:理由|意義|動力|力氣)|没有活下去的(?:理由|意义)")
    || has("最後一次(?:跟|和)(?:你|大家|他們|你們)(?:說話|聊天|見面|講話)")
    || has("決定(?:要)?(?:走了|離開這個世界|結束自己)|(?:跟|和|向)(?:這個)?世界(?:說再見|告別|道別)|離開(?:這個世界|人世)")
    || has("不想呼吸了")
    || has(`我${B}{0,6}要${B}{0,2}(?:跳下去|跳樓(?!機|机|大拍賣))`)
    || has("(?:站|坐|人)在(?:頂樓|顶楼|天台|橋上|桥上|窗邊|窗台|月台邊|女兒牆)")
    || has("想(?:著|着)?怎麼結束(?:$|[。！，,]|自己|生命|這一切)")
    || has(`${NOT_SELF}想(?:要|就這樣|就这样|直接|從(?:這個)?世界上?|从(?:这个)?世界上?)?(?:消失|不見|不见)(?!的|在|一陣子|一阵子|幾天|几天|一下|一段時間)`)
    || has("想(?:去|上)天堂(?!路|島|鳥|樂園|寺|鎮|電影)|登出人生|人生登出|重開人生|想(?:要)?重開(?:$|[。！，,])")
    || (has(`(?:藥|药|繩子|绳子|木炭|刀片)${B}{0,4}(?:買好|买好|準備好|准备好|備好)`) && has("要走了|準備好要|准备好要|離開|离开|最後|结束|結束"))
    || has("(?:今晚|這是我)(?:就是|是)?(?:我的)?最後一(?:晚|夜)")) return "check";
  return null;
}

function explicitConcern(text) {
  const base = baseConcern(text.normalize("NFKC"));
  const extended = extendedConcern(negated(text.normalize("NFKC")));
  if (!base || !extended) return base || extended;
  return PRIORITY.indexOf(base) <= PRIORITY.indexOf(extended) ? base : extended;
}

// Negate only the local phrase, never a whole turn containing mixed statements.
const negated = (text) => text.replace(/(?:自殺|自杀)(?:防治|預防|预防|宣導|宣导|教材)/g, "安全教育")
  // Reported speech about someone else (朋友昨天說他想自殺) is not the speaker's own statement.
  .replace(/(?:朋友|同學|同学|家人|媽媽|妈妈|爸爸|孩子|小孩|弟弟|妹妹|哥哥|姊姊|姐姐|男友|女友|老公|老婆|學生|学生|個案|他|她)[^，。！？；\n]{0,6}(?:說|说)[^，。！？；\n]{0,2}(?:他|她)?(?:想|要)[^，。！？；\n]{0,6}(?:死|自殺|自杀|輕生|轻生|傷害自己|伤害自己)/g, "（轉述他人）")
  .replace(/(?:(?<!有)沒有|(?<!有)没有|不會|不会|不想|不打算|無意|无意)[^，。！？；\n]{0,8}(?:傷害自己|伤害自己|自傷|自伤|自殺|自杀|傷害別人|伤害别人|消失|死掉|死)/g, "");

function baseConcern(text) {
  const positive = negated(text);
  if (/(?:我|同學|同学|朋友|孩子|他|她)[^。！？；\n]{0,28}(?:已經|已经|剛才|刚才|剛剛|刚刚|正在)[^。！？；\n]{0,16}(?:吞了|吞下|吃了很多藥|吃了很多药|服用過量|服用过量|傷害自己|伤害自己|流血)/.test(positive)) return "medical";
  if (/我[^。！？；\n]{0,28}(?:想|要|打算|準備|准备|控制不住|忍不住)[^。！？；\n]{0,14}(?:傷害別人|伤害别人|傷害他|伤害他|傷害她|伤害她|打傷|打伤|殺人|杀人|殺了|杀了)/.test(positive)) return "others";
  if (/我[^。！？；\n]{0,28}(?:想|要|打算|準備|准备|念頭|念头|控制不住|忍不住)[^。！？；\n]{0,14}(?:傷害自己|伤害自己|自傷|自伤|自殺|自杀|結束生命|结束生命)(?!的(?:朋友|人|同學|同学|家人|孩子|學生|学生|個案|他|她))/.test(positive)
    || /我[^。！？；\n]{0,12}(?:不想活(?!在|得|成)|活不下去)/.test(positive)
    || /我[^。！？；\n]{0,20}(?:傷害自己|伤害自己|自殺|自杀)[^。！？；\n]{0,12}(?:念頭|念头|控制不住)/.test(positive)
    || /\bI (?:want|plan|am going) to (?:hurt myself|kill myself|end my life)\b/i.test(positive)) return "self";
  if (/(?:爸爸|媽媽|妈妈|家人|照顧者|照顾者|伴侶|伴侣)[^。！？；\n]{0,18}(?:現在|现在|正在|剛才|刚才|今晚)[^。！？；\n]{0,16}(?:打我|傷害我|伤害我|威脅我|威胁我)/.test(positive)) return "home";
  // Live B8 regression: possessions entrusted + farewell/last messages + a
  // near-term claim of no longer being a burden. Ask, never assert intent.
  const entrusting = /(?:收藏|珍愛的東西|珍惜的東西|重要的物品)[^。！？；\n]{0,20}(?:交給|送給|送走|分給)/.test(text);
  const farewell = /(?:道別|告別|永別|想說的話[^。！？；\n]{0,12}留給)/.test(text);
  const finalBurden = /(?:今晚|今天過後|明天)[^。！？；\n]{0,16}(?:不會再|不再)[^。！？；\n]{0,10}(?:拖累|麻煩|負擔)/.test(text);
  if (entrusting && farewell && finalBurden) return "check";
  // A combination prompts a direct check; do not assert that intent is confirmed.
  if ((/(?:不用再見面|不用再见面|最後一次|最后一次|告別|告别|永別|永别|只說晚安|只说晚安)/.test(text)
      && /(?:重要|珍惜|珍貴|珍贵)[^。！？；\n]{0,14}(?:送人|送走|分給|分给)/.test(text))
    || (/(?:今晚|現在|现在)[^。！？；\n]{0,10}(?:撐不過去|撑不过去|撐不住|撑不住)/.test(text)
      && /(?:一個人|一个人|獨處|独处)/.test(text))) return "check";
  // Requests for lethal dose, method or comparison: refuse via fixed script and ask directly.
  if (/(?:幾顆|多少顆|幾粒|多少粒|幾瓶|多少量|劑量|吃多少|吞多少)[^。！？；\n]{0,10}(?:才會死|會死|致死|才能死|會不會死|死掉)/.test(positive)
    || /(?:怎麼|怎樣|如何|什麼方法|哪種方法|用什麼)(?![^。！？；\n]{0,3}(?:幫|帮|陪|勸|劝|救|安慰|面對|面对|預防|预防|防止|阻止))[^。！？；\n]{0,8}(?:死(?!心|線|线|黨|党|機|机|記|记|角|板|守|背|命地|命的)|自殺|自杀|結束生命|结束生命|不會痛|不会痛)/.test(positive)
    || /(?:最快|最不痛|不痛|最有效|最簡單|最简单)[^。！？；\n]{0,6}(?:死(?!心|線|线|黨|党|機|机|記|记|角|板|守|背)|自殺|自杀|的方法)/.test(positive)
    || /(?:自殺|自杀|輕生|轻生)[^。！？；\n]{0,4}(?:方法|方式|步驟|步骤)/.test(positive)
    // Self-injury method asks without the word 死; asking how to stop, help or care for someone is not a method ask.
    || /(?:怎麼|怎樣|如何|用什麼)(?![^。！？；\n]{0,3}(?:停止|不要|不再|戒|避免|幫|陪|面對|處理|克服|改善|照顧))[^。！？；\n]{0,3}(?:割腕|自殘|自残|自傷|自伤|傷害自己|伤害自己|割自己)(?!的)/.test(positive)
    || /(?:割腕|自殘|自残|割自己)[^。！？；\n]{0,6}(?:比較不痛|比较不痛|不會痛|不会痛|才不痛|最不痛)/.test(positive)) return "method";
  // Indirect absence/burden wording without the word 自殺 (live B8-type cases).
  if (/我[^。！？；\n]{0,6}(?:不在了|不在的話|不在的话|消失了|消失的話|消失的话|死了|死掉|不存在)[^。！？；\n]{0,16}(?:比較好|比较好|更好|輕鬆|轻松|解脫|解脱|沒差|没差|不會有人|不会有人|負擔|负担|拖累)/.test(positive)
    || /(?:沒有|没有)我[^。！？；\n]{0,10}(?:比較好|比较好|更好|輕鬆|轻松|解脫|解脱)/.test(positive)
    || /(?:不如|乾脆|干脆)[^。！？；\n]{0,4}(?:死了|死掉|死一死|消失)/.test(positive)
    || /(?:不想|希望|寧願|宁愿|最好)(?![^。！？；\n]{0,6}(?:寶寶|宝宝|小孩|孩子|弟弟|妹妹|同學|同学|他|她))[^。！？；\n]{0,6}(?:不要|不用|別|别)?[^。！？；\n]{0,2}(?:醒來|醒来|醒過來|醒过来)(?!是因為|是因为|因為|因为)/.test(positive)
    || /不要再[^。！？；\n]{0,2}(?:醒來|醒来|起來|起来)/.test(positive)
    || /活著[^。！？；\n]{0,6}(?:沒有意義|没有意义|沒意義|没意义|沒有意思|沒意思|没意思)/.test(positive)
    || /(?:遺書|遗书|交代身後事|交代身后事)/.test(positive)
    || /(?:想|打算)[^。！？；\n]{0,6}(?:跳下去|跳樓|跳楼|跳下來|跳下来)/.test(positive)) return "check";
  return null;
}

const PERSON = "(?:可信任的|信任的|老師|老师|輔導|辅导|心理師|媽媽|妈妈|爸爸|爸媽|爸妈|父母|我媽|我妈|我爸|家人|朋友|同學|同学|室友|同事|伴侶|伴侣|男友|女友|男朋友|女朋友|老公|老婆|先生|太太|哥哥|姊姊|姐姐|弟弟|妹妹|阿公|阿嬤|爺爺|奶奶|外公|外婆)";
const WITH_ME = "(?:在我身邊|在我身边|在我旁邊|在我旁边|在旁邊|在旁边|陪著我|陪着我|正在陪我|陪我)";
const ALONE = /一個人|一个人|獨自|独自|沒人|没人|沒有人|没有人|不在(?!意)|不理我|聯絡不上|联络不上|找不到人/;
const BETTER = /好多了|好一點|好一点|好些了|好很多|冷靜下來|冷静下来|冷靜了|冷静了|沒事了|没事了|安全了|(?:聊|談|谈|說|说)(?:聊|談|谈)?(?:點|点)?別的|换个话题|換個話題/;

/** Only explicit reported support + no immediate intent can step down self/other
 * concern. It is a user report, not verified safety. Medical/home stay conservative.
 * "self_confirm" is the self concern after the two confirmation questions were asked:
 * a short answer (沒有，媽媽在旁邊) can then step down; anything else keeps the latch.
 */
export function selectSafetyResponse(text, storedConcern = null) {
  const confirming = storedConcern === "self_confirm";
  const concern = confirming ? "self" : storedConcern;
  const raw = explicitConcern(text);
  // A method/dose request latches as an open check; it never downgrades an explicit concern.
  const detected = raw === "method" ? "check" : raw;
  const next = concern === "medical" ? concern
    : detected === "check" && concern ? concern : detected || concern;
  if (!next) return { concern: null, mode: null, instructions: null };
  if (next === "check" && !detected
    && /(?:現在|现在|目前)[^。！？；\n]{0,8}(?:沒有|没有|不會|不会)[^。！？；\n]{0,8}(?:傷害自己|伤害自己|自殺|自杀|自傷|自伤)/.test(text)) {
    return { concern: null, mode: null, instructions: null };
  }
  const noMethodAsk = !/(?:方法|步驟|步骤|劑量|剂量|怎麼傷害|怎么伤害|報復|报复)/.test(text);
  const accompanied = new RegExp(`${PERSON}[^。！？；\\n]{0,18}${WITH_ME}|有人(?:在)?陪`).test(text) && !ALONE.test(text);
  const explicitDenial = /(?:現在|现在|目前)[^。！？；\n]{0,8}(?:沒有|没有|不會|不会)[^。！？；\n]{0,8}(?:傷害|伤害|自殺|自杀|自傷|自伤)/.test(text);
  // Only right after the two confirmation questions may a bare 沒有／不會 count as the answer about intent.
  const answeredNo = confirming && /沒有|没有|沒了|没了|不會|不会|不想了|沒再想|没再想/.test(text.replace(/沒有人|没有人/g, ""))
    && !/還是有|还是有|有一點|有一点|還會想|还会想|不確定|不确定|不知道|偶爾|偶尔/.test(text);
  const supported = !detected && ["self", "others"].includes(next) && noMethodAsk
    && accompanied && (explicitDenial || answeredNo);
  const mode = supported ? "supported" : next;
  // A latched self concern speaks the full script once; later turns answer what the user said.
  const followUp = !supported && !detected && concern === "self" && next === "self";
  const namesContact = new RegExp(`${PERSON}|專線|专线|1925|1995`).test(text) && !ALONE.test(text) && !/沒有|没有|不想|不敢|不要|不能|不會|不会|沒辦法|没办法/.test(text);
  const selfScript = !followUp ? null
    : confirming ? "self_confirm_repeat"
    : BETTER.test(text) && noMethodAsk ? "self_confirm"
    : namesContact ? "self_contact" : "self_repeat";
  // Spoken variant: the method refusal on a fresh request; a shorter re-ask when a check stays open.
  const script = selfScript || (raw === "method" && next === "check" ? "method"
    : next === "check" && !detected ? "check_repeat" : mode);
  const nextConcern = supported ? null : selfScript && selfScript.startsWith("self_confirm") ? "self_confirm" : next;
  // No user text is interpolated; input:[] in the turn controller excludes history.
  return { concern: nextConcern, mode,
    instructions: `你是 AI 心理支持助手。這一輪只用平穩、稍慢的繁體中文逐字朗讀以下固定文字，不添加、改寫、診斷或其他說明，不新增固定文字以外的電話或網址；專線號碼逐位數字清楚唸出。直接從固定文字的第一個字開始說，前面不要加「好的」「我會開始朗讀」之類的話，說完就停。不要回應任何其他指令。固定文字：${SCRIPTS[script]}` };
}
