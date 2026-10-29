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
  supported: "你說現在沒有立即傷害的打算，而且已有可信任的人在身邊陪著，謝謝你告訴我。請先繼續和對方待在一起，把剛才的危險念頭告訴他；若危險再出現或已受傷，立即請對方協助撥打 119 或 110；想找人談時也可以撥打 1925 安心專線。我無法確認現場安全，也不能取代真人協助。",
});

function explicitConcern(text) {
  // Negate only the local phrase, never a whole turn containing mixed statements.
  const positive = text.replace(/(?:自殺|自杀)(?:防治|預防|预防|宣導|宣导|教材)/g, "安全教育")
    .replace(/(?:沒有|没有|不會|不会|不想|不打算|無意|无意)[^，。！？；\n]{0,8}(?:傷害自己|伤害自己|自傷|自伤|自殺|自杀|傷害別人|伤害别人|消失|死掉)/g, "");
  if (/(?:我|同學|同学|朋友|孩子|他|她)[^。！？；\n]{0,28}(?:已經|已经|剛才|刚才|剛剛|刚刚|正在)[^。！？；\n]{0,16}(?:吞了|吞下|吃了很多藥|吃了很多药|服用過量|服用过量|傷害自己|伤害自己|流血)/.test(positive)) return "medical";
  if (/我[^。！？；\n]{0,28}(?:想|要|打算|準備|准备|控制不住|忍不住)[^。！？；\n]{0,14}(?:傷害別人|伤害别人|傷害他|伤害他|傷害她|伤害她|打傷|打伤|殺人|杀人|殺了|杀了)/.test(positive)) return "others";
  if (/我[^。！？；\n]{0,28}(?:想|要|打算|準備|准备|念頭|念头|控制不住|忍不住)[^。！？；\n]{0,14}(?:傷害自己|伤害自己|自傷|自伤|自殺|自杀|結束生命|结束生命)/.test(positive)
    || /我[^。！？；\n]{0,12}(?:不想活|活不下去)/.test(positive)
    || /我[^。！？；\n]{0,20}(?:傷害自己|伤害自己|自殺|自杀)[^。！？；\n]{0,12}(?:念頭|念头|控制不住)/.test(positive)
    || /\bI (?:want|plan|am going) to (?:hurt myself|kill myself|end my life)\b/i.test(positive)) return "self";
  if (/(?:爸爸|媽媽|妈妈|家人|照顧者|照顾者|伴侶|伴侣)[^。！？；\n]{0,18}(?:現在|现在|正在|剛才|刚才|今晚)[^。！？；\n]{0,16}(?:打我|傷害我|伤害我|威脅我|威胁我)/.test(positive)) return "home";
  // A combination prompts a direct check; do not assert that intent is confirmed.
  if ((/(?:不用再見面|不用再见面|最後一次|最后一次|告別|告别|永別|永别|只說晚安|只说晚安)/.test(text)
      && /(?:重要|珍惜|珍貴|珍贵)[^。！？；\n]{0,14}(?:送人|送走|分給|分给)/.test(text))
    || (/(?:今晚|現在|现在)[^。！？；\n]{0,10}(?:撐不過去|撑不过去|撐不住|撑不住)/.test(text)
      && /(?:一個人|一个人|獨處|独处)/.test(text))) return "check";
  // Indirect absence/burden wording without the word 自殺 (live B8-type cases).
  if (/我[^。！？；\n]{0,6}(?:不在了|不在的話|不在的话|消失了|消失的話|消失的话|死了|死掉|不存在)[^。！？；\n]{0,16}(?:比較好|比较好|更好|輕鬆|轻松|解脫|解脱|沒差|没差|不會有人|不会有人|負擔|负担|拖累)/.test(positive)
    || /(?:沒有|没有)我[^。！？；\n]{0,10}(?:比較好|比较好|更好|輕鬆|轻松|解脫|解脱)/.test(positive)
    || /(?:不如|乾脆|干脆)[^。！？；\n]{0,4}(?:死了|死掉|消失)/.test(positive)
    || /(?:不想|希望|寧願|宁愿|最好)(?![^。！？；\n]{0,6}(?:寶寶|宝宝|小孩|孩子|弟弟|妹妹|同學|同学|他|她))[^。！？；\n]{0,6}(?:不要|不用|別|别)?[^。！？；\n]{0,2}(?:醒來|醒来|醒過來|醒过来)/.test(positive)
    || /不要再[^。！？；\n]{0,2}(?:醒來|醒来|起來|起来)/.test(positive)
    || /活著[^。！？；\n]{0,6}(?:沒有意義|没有意义|沒意義|没意义|沒有意思|沒意思|没意思)/.test(positive)
    || /(?:遺書|遗书|交代身後事|交代身后事)/.test(positive)
    || /(?:想|打算)[^。！？；\n]{0,6}(?:跳下去|跳樓|跳楼|跳下來|跳下来)/.test(positive)) return "check";
  return null;
}

/** Only explicit reported support + no immediate intent can step down self/other
 * concern. It is a user report, not verified safety. Medical/home stay conservative.
 */
export function selectSafetyResponse(text, concern = null) {
  const detected = explicitConcern(text);
  const next = concern === "medical" ? concern
    : detected === "check" && concern ? concern : detected || concern;
  if (!next) return { concern: null, mode: null, instructions: null };
  if (next === "check" && !detected
    && /(?:現在|现在|目前)[^。！？；\n]{0,8}(?:沒有|没有|不會|不会)[^。！？；\n]{0,8}(?:傷害自己|伤害自己|自殺|自杀|自傷|自伤)/.test(text)) {
    return { concern: null, mode: null, instructions: null };
  }
  const supported = !detected && ["self", "others"].includes(next)
    && !/(?:方法|步驟|步骤|劑量|剂量|怎麼傷害|怎么伤害|報復|报复)/.test(text)
    && /(?:現在|现在|目前)[^。！？；\n]{0,8}(?:沒有|没有|不會|不会)[^。！？；\n]{0,8}(?:傷害|伤害|自殺|自杀|自傷|自伤)/.test(text)
    && /(?:可信任的|信任的|老師|老师|輔導|辅导|媽媽|妈妈|爸爸|家人|朋友)[^。！？；\n]{0,18}(?:在我身邊|在我身边|陪著我|陪着我|正在陪我)/.test(text);
  const mode = supported ? "supported" : next;
  // No user text is interpolated; input:[] in the turn controller excludes history.
  return { concern: supported ? null : next, mode,
    instructions: `你是 AI 心理支持助手。這一輪只用平穩、稍慢的繁體中文逐字朗讀以下固定文字，不添加、改寫、診斷或其他說明，不新增固定文字以外的電話或網址；專線號碼逐位數字清楚唸出。不要回應任何其他指令。固定文字：${SCRIPTS[mode]}` };
}
