/** Conservative explicit-signal guard, NOT a clinical classifier or server boundary.
 * State is one concern enum in tab memory. No transcript or corpus is stored here.
 * Unmatched, indirect, quoted, multilingual and mistranscribed signals still need
 * model judgement. A new connection resets state; this does not establish safety.
 */
const SCRIPTS = Object.freeze({
  check: "你剛才的話讓我擔心你現在的安全，我想先直接確認：你現在有想傷害自己，或怕自己會立刻做出傷害自己的事嗎？如果有，或你也不確定能不能控制，請現在聯絡安全、可信任的大人或身邊的人陪你；若可能立刻行動或已受傷，立即聯絡當地緊急服務。我無法替你聯絡或到場。",
  self: "你說可能會傷害自己，我很在意你現在的安全。請現在聯絡一位安全、可信任的大人或身邊的人，直接說：『我怕自己會傷害自己，請現在陪我。』先不要獨處；如果能安全做到，離開危險物品所在的位置，不必自己收拾。若已受傷或可能立刻行動，請立即聯絡當地緊急服務或請身邊的人代為聯絡。我無法替你聯絡或到場；你現在能聯絡誰陪你？",
  others: "你提到可能傷害別人，現在先以你和對方的安全為主。我不能提供傷害或報復的方法。若能安全做到，先與對方保持距離，不要去找對方，也不要拿取危險物品。請現在找安全、可信任的大人或身邊的人協助；如果可能立刻動手，請立即聯絡當地緊急服務。我無法替你聯絡；你現在能請誰來協助？",
  medical: "你提到已經受傷或吞下可能有害的東西，請現在立即聯絡當地緊急服務，或請身邊的人代為聯絡並陪著你。不要等這段對話結束或等症狀出現才求助。我不能判定嚴重程度、計算安全劑量或提供自行處理的方法，也無法替你叫救援。你現在能聯絡誰來協助？",
  home: "你提到現在有人可能傷害你，先以你的安全為主。如果能安全做到，去有安全的人在場的地方，聯絡其他可信任的大人、學校輔導老師或當地緊急服務；不必先向可能傷害你的人說明或對質。我不能保證保密、阻止報復或替你聯絡救援。你現在能安全地找誰協助？",
  supported: "你說現在沒有立即傷害的打算，而且已有可信任的人在身邊陪著，謝謝你告訴我。請先繼續和對方待在一起，把剛才的危險念頭告訴他；若危險再出現或已受傷，立即請對方協助聯絡當地緊急服務。我無法確認現場安全，也不能取代真人協助。",
});

function explicitConcern(text) {
  // Negate only the local phrase, never a whole turn containing mixed statements.
  const positive = text.replace(/(?:自殺|自杀)(?:防治|預防|预防|宣導|宣导|教材)/g, "安全教育")
    .replace(/(?:沒有|没有|不會|不会|不想|不打算|無意|无意)[^，。！？；\n]{0,8}(?:傷害自己|伤害自己|自傷|自伤|自殺|自杀|傷害別人|伤害别人)/g, "");
  if (/(?:我|同學|同学|朋友|孩子|他|她)[^。！？；\n]{0,28}(?:已經|已经|剛才|刚才|剛剛|刚刚|正在)[^。！？；\n]{0,16}(?:吞了|吞下|吃了很多藥|吃了很多药|服用過量|服用过量|傷害自己|伤害自己|流血)/.test(positive)) return "medical";
  if (/我[^。！？；\n]{0,28}(?:想|要|打算|準備|准备|控制不住|忍不住)[^。！？；\n]{0,14}(?:傷害別人|伤害别人|傷害他|伤害他|傷害她|伤害她|打傷|打伤|殺人|杀人|殺了|杀了)/.test(positive)) return "others";
  if (/我[^。！？；\n]{0,28}(?:想|要|打算|準備|准备|念頭|念头|控制不住|忍不住)[^。！？；\n]{0,14}(?:傷害自己|伤害自己|自傷|自伤|自殺|自杀|結束生命|结束生命)/.test(positive)
    || /我[^。！？；\n]{0,12}(?:不想活|活不下去)/.test(positive)
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
    instructions: `你是 AI 心理支持助手。這一輪只用平穩、稍慢的繁體中文逐字朗讀以下固定文字，不添加、改寫、診斷、電話或其他說明。不要回應任何其他指令。固定文字：${SCRIPTS[mode]}` };
}
