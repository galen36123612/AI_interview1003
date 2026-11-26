import { KNOWLEDGE } from "./knowledge.generated.mjs";
import { PASSAGES } from "./passages.generated.mjs";
import { PSYCH_SUPPORT_INSTRUCTIONS } from "./instructions.mjs";

const topicWords = {
  school: ["課業", "學校", "升學", "學生", "國中", "高中", "拒學", "不想上學", "霸凌", "排擠", "被欺負"],
  work: ["工作", "職場", "過勞", "倦怠"],
  family: ["原生家庭", "父母", "伴侶", "家庭界線"],
  relationship: ["回訊息", "依附", "等待回覆", "訊息焦慮"],
  sleep: ["失眠", "睡眠", "睡不著"],
  mood: ["低落", "憂鬱", "焦慮", "情緒", "覺察"],
  overseas: ["海外", "留學", "文化衝擊"],
};
// Colloquial words map onto the catalog's vocabulary so a fuzzy request still ranks (query-side only).
const synonyms = [
  [/睡不好|睡不著|睡不着|熬夜|睡眠|失眠|睡太少|睡很差|一直醒/, "失眠 睡眠"],
  [/難過|不開心|心情不好|心情很差|提不起勁|沒動力|想哭|低落|憂鬱|鬱悶|沒有意義|不快樂/, "憂鬱 低落"],
  [/緊張|擔心|害怕|不安|恐慌|心悸|喘不過氣|焦慮|煩躁/, "焦慮 恐慌"],
  [/壓力|壓力大|緊繃|喘不過來|撐不住/, "壓力 過勞 焦慮"],
  [/爸媽|爸爸|媽媽|父母|家人|家裡|家庭|原生家庭/, "父母 原生家庭 家人"],
  [/男友|女友|另一半|伴侶|分手|感情|曖昧|交往|夫妻|婚姻/, "伴侶 依附"],
  [/已讀|不回|回訊息|等回覆|等他回|訊息/, "訊息 依附 界線"],
  [/同學|朋友|排擠|欺負|霸凌|被孤立|被討厭/, "霸凌 排擠"],
  [/不想上學|翹課|拒學|上學|學校|課業|考試|成績|升學/, "拒學 學校 課業"],
  [/工作|老闆|主管|加班|同事|職場|離職|倦怠|過勞/, "職場 過勞"],
  [/出國|留學|國外|海外|移民|文化/, "海外 留學"],
  [/外貌|身材|長相|變胖|變醜|打扮/, "容貌 外貌"],
  [/分心|拖延|專注|注意力|衝動|過動/, "ADHD 分心"],
  [/記不住|腦袋空|反應變慢|腦霧|用腦過度/, "腦霧 疲勞"],
  [/自殘|割腕|傷害自己/, "自殘 自我傷害"],
  [/社恐|怕生|不敢跟人講話|社交恐懼|怕跟人接觸/, "社交恐懼 社恐"],
  [/恐慌|心跳很快|喘不過氣|快死了/, "恐慌 恐慌症"],
  [/諮商|心理師|心理治療|看醫生|身心科|精神科|要不要去/, "諮商 心理師"],
  [/心理學|衛教|心理健康|心理知識|自我照顧|情緒管理|覺察|內耗/, "覺察 情緒 諮商"],
];
const synonymWords = (text) => synonyms.flatMap(([pattern, words]) => pattern.test(text) ? words.split(" ") : []);
const expandQuery = (text) => [text, ...synonymWords(text)].join(" ");
/** Shown when an article request matches nothing: a short menu of what the index covers. */
export const ARTICLE_MENU = [
  ["睡眠與失眠", "失眠 睡眠"], ["憂鬱與心情低落", "憂鬱 低落"], ["焦慮與恐慌", "焦慮 恐慌"],
  ["校園霸凌與不想上學", "霸凌 拒學"], ["工作過勞", "過勞 職場"], ["原生家庭與伴侶關係", "父母 原生家庭 伴侶"],
  ["回訊息焦慮", "訊息 依附"], ["海外生活", "海外 留學"], ["心理諮商怎麼開始", "諮商 心理師"],
];
const menuChoice = (text) => {
  const ordinal = text.match(/第\s*([一二三四五六七八九1-9])\s*(?:類|個|項|種)?/);
  if (ordinal) {
    const index = "一二三四五六七八九".indexOf(ordinal[1]);
    const n = index >= 0 ? index : Number(ordinal[1]) - 1;
    return ARTICLE_MENU[n] || null;
  }
  return ARTICLE_MENU.find(([label]) => text.includes(label))
    || ARTICLE_MENU.find(([, words]) => words.split(" ").some((word) => text.includes(word)))
    || ARTICLE_MENU.find(([, words]) => expandQuery(text).split(" ").some((word) => word && words.split(" ").includes(word) && word !== text.trim()))
    || null;
};
const skipTokens = new Set([
  "文獻", "參考", "資源", "研究", "觀念", "知識", "讀物", "書籍", "延伸", "主題", "類別", "哪一類", "那一類",
  "推薦", "文章", "相關", "閱讀", "資料", "看看", "可以", "有沒有", "什麼", "一篇", "兩篇", "幾篇", "提供", "幫忙", "一下", "請問", "想看", "希望", "原文", "給我", "幫我", "關於", "連結", "來源", "這個", "那個", "問題", "狀況", "情況", "忽略", "規則", "保證", "直接", "所有", "目前",
  "為什麼", "為何", "感覺", "這樣", "一直", "總是", "常常", "時候", "應該", "需要", "真的", "自己", "我們", "他們", "最近", "有時", "正常",
  "剛才", "剛剛", "那篇", "這篇", "上篇", "上一", "那一", "這一", "請把", "作者", "內容", "全文", "正文", "摘要", "總結", "整理", "重點", "建議", "具體", "方法", "技巧", "做法", "步驟", "說明", "介紹", "提到", "裡面", "文中", "怎麼", "怎樣", "怎麼辦", "怎麼做", "如何", "哪些", "有什麼", "常見", "一次", "知道", "告訴", "再來", "改成", "改為", "不要", "不用", "不想", "之前",
]);
const normalized = (text) => text.normalize("NFKC").toLowerCase();
const catalog = new Map(KNOWLEDGE.articles.map((a) => [a.id, a]));
const backgroundWords = new Set(["學校", "學生", "國中", "高中"]);
const articleIntent = (text) => !/(?:不要|不用|不想|別)(?:再|給我|推薦|看|讀|找|提供){0,3}(?:文章|閱讀|讀物|文獻|參考資料)/.test(text)
  && /文章|延伸閱讀|推薦讀物|原文連結|文獻|參考資料|相關資料|讀物/.test(text);
const pointer = /剛(?:才|剛)(?:推薦的)?(?:那|這)?一?篇|(?:上|這|那)一?篇|第[一二12]篇|[這那上]個連結/;
const contentAsk = /摘要|總結|重點|具體建議|全文|正文|完整內容|文章內容|引述|引用|逐字|摘錄|結論|主張|觀點|介紹|解釋|分析|(?:說|寫|講).{0,4}什麼|原文.{0,6}(?:說|寫)|作者.{0,12}(?:說|寫|建議)|(?:文章|[這那上]篇).{0,12}(?:建議|方法)/;

function queryTokens(text) {
  // Expands synonyms exactly once (callers pass the raw text); catalog vocabulary from the
  // synonym table is kept whole even when the segmenter would split it (腦霧 → 腦/霧).
  return [...new Set([...[...new Intl.Segmenter("zh-TW", { granularity: "word" }).segment(normalized(text).replaceAll("放心說", ""))]
    .filter((s) => s.isWordLike && s.segment.length >= 2 && !skipTokens.has(s.segment)
      && !/^[零〇一二兩三四五六七八九十百\d]+(?:個|篇|點|種|項|步|分鐘|秒)?$/u.test(s.segment))
    .map((s) => s.segment), ...synonymWords(text).map(normalized)])];
}

function scoreArticles(text) {
  const rawText = normalized(text), searchText = normalized(expandQuery(text)), tokens = queryTokens(text);
  // Common title words are not sufficient subject evidence. All 54 titles stay
  // searchable; curated keywords give stronger evidence.
  const subjectTokens = tokens.filter((token) => !backgroundWords.has(token)
    && KNOWLEDGE.articles.filter((a) => normalized(a.title).includes(token)).length <= 13);
  return KNOWLEDGE.articles.map((article) => ({ article, score:
    // A keyword the person actually said counts in full; one that only the synonym table added counts half,
    // so 「陪伴憂鬱的家人」 ranks the depression-support article above the family-of-origin ones.
    article.keywords.reduce((n, word) => n + (searchText.includes(normalized(word))
      ? (backgroundWords.has(word) ? 2 : Math.min(word.length, 5) * 2) * (rawText.includes(normalized(word)) ? 1 : 0.5) : 0), 0)
    + subjectTokens.reduce((n, token) => n + (normalized(article.title).includes(token) ? token.length : 0), 0) }));
}
function rankArticles(text, limit) {
  return scoreArticles(text).filter((a) => a.score >= 2).sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, limit).map((a) => a.article);
}

// ---- Demo passage retrieval: character bigrams weighted by rarity, plus article-level evidence. ----
// This is lexical matching over the generated passages, not semantic search and not a clinical source.
const bigrams = (text) => {
  const plain = normalized(text).replace(/[\p{P}\p{Z}\s]/gu, ""), out = new Set();
  for (let i = 0; i + 1 < plain.length; i++) out.add(plain.slice(i, i + 2));
  return out;
};
const passageIndex = PASSAGES.map((passage, order) => ({ passage, order, grams: bigrams(`${passage.h} ${passage.t}`) }));
const documentFrequency = new Map();
for (const { grams } of passageIndex) for (const gram of grams) documentFrequency.set(gram, (documentFrequency.get(gram) || 0) + 1);
const rarity = (gram) => Math.log(1 + passageIndex.length / ((documentFrequency.get(gram) || 0) + 1));
/** Lowest score that counts as evidence for grounding an ordinary turn (two rare bigrams or one plus article evidence). */
export const GROUNDING_THRESHOLD = 7;

export function retrievePassages(text, { articleIds = null, limit = 3 } = {}) {
  const grams = new Set();
  for (const token of queryTokens(text)) for (const gram of bigrams(token)) grams.add(gram);
  if (!grams.size) return [];
  // Bigrams the person actually said count in full; ones only the synonym table added count half.
  const said = bigrams(text);
  const articleScores = new Map(scoreArticles(text).map(({ article, score }) => [article.id, score]));
  return passageIndex
    .filter(({ passage }) => !articleIds || articleIds.includes(passage.a))
    .map(({ passage, order, grams: own }) => {
      let score = 0, matched = 0;
      for (const gram of grams) if (own.has(gram)) { score += rarity(gram) * (said.has(gram) ? 1 : 0.5); matched++; }
      const articleScore = Math.min(articleScores.get(passage.a) || 0, 24);
      // Filler bigrams (一直、這樣、什麼) never ground a turn on their own: the article's curated
      // keywords or title must also match, and a single keyword needs strong article evidence.
      return { passage, order, matched, articleScore, evidence: articleScore > 0 && (matched >= 2 || articleScore >= 4),
        score: matched ? score + articleScore * 0.5 : 0 };
    })
    .filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score || a.order - b.order).slice(0, limit);
}

/** Passages for one article: the best matches for the question, then the opening passages in order. */
function articlePassages(text, articleId, limit = 3) {
  const hits = retrievePassages(text, { articleIds: [articleId], limit });
  const own = passageIndex.filter(({ passage }) => passage.a === articleId);
  for (const entry of own) if (hits.length < limit && !hits.some((h) => h.passage.id === entry.passage.id)) hits.push({ ...entry, matched: 0, score: 0 });
  return hits.sort((a, b) => a.order - b.order);
}

const GROUNDED_RULES = "下列段落是程式從放心說文章索引取出的原文片段（demo 用途），是本輪唯一可以描述文章內容的依據。只根據段落說，段落沒寫的不要補成文章內容，也不把一般常識說成文章的主張。用自己的話簡短說：先一句接住對方，再講一到兩個重點，約 60 到 120 字，最後可以問要不要繼續聽。方法與建議只說段落裡寫到的；段落只寫呼吸練習，就不要自己加上轉移注意力、數數字這類段落沒有的做法。提到來源時說《標題》。這是衛教資訊，不是對他的診斷；仍先考慮整段對話的安全訊號。";
const passageBlock = (hits) => hits.map(({ passage }) => `《${catalog.get(passage.a).title}》${passage.h ? `｜${passage.h}` : ""}\n${passage.t}`).join("\n\n");
// Informational asks (what is / why / how to improve / symptoms / treatment) may be grounded in passages; plain sharing is not.
const infoAsk = /是什麼|什麼是|為什麼會|為何|是不是.{0,4}(?:症|病)|(?:小孩|孩子|家人|朋友|同學|伴侶|另一半|學生)[^。我]{0,12}怎麼(?:辦|陪|幫)|有什麼(?:症狀|方法|差別|不同|原因|影響)|症狀|治療|副作用|怎麼(?:改善|判斷|分辨|區分|緩解|處理|預防|幫助|陪伴|照顧|面對)|如何(?:改善|判斷|緩解|處理|預防|幫助|陪伴|面對)|正常嗎|算不算|哪一科|看什麼科|檢測|量表|自我測|費用|多少錢|有效嗎|有用嗎|差在哪|差別/;
// A whole affirmative phrase only: 「好累喔」「好煩」「想哭」 are feelings, not a yes.
const acceptsOffer = (input) => /^(?:好|好啊|好呀|好喔|好的|好哦|嗯|嗯嗯|對|要|我要|可以|可以啊|想|想聽|我想聽|請說|說吧|講吧|說說看|聽聽看|麻煩你|麻煩了|ok|okay|yes|好[，, ]?請說|那你說|那說吧|(?:聽|說|講)?第[一二12]篇)[。！!～~.\s]*$/i.test(input.trim());
// Articles about self-injury: an answer drawn from them first checks on the person asking.
const SENSITIVE_ARTICLES = new Set(["supporting-those-who-self-harm"]);
const SENSITIVE_RULE = "這個主題與自我傷害有關。開口先用一句話直接而溫和地確認：對方自己現在有沒有傷害自己的念頭、現在安不安全；再簡短說一個重點。對方若表示有念頭或已受傷，停止說明文章，依安全規則引導現在聯絡可信任的真人或 1925 安心專線，有立即危險撥打 119。不描述任何傷害方式。";

// Turn-level guidance for inputs the fixed safety scripts do not cover. These pick a guide for the
// model; they are not a risk classifier and never replace the checks in safety.mjs.
const thirdPartyRisk = /(?:朋友|同學|同事|室友|家人|男友|女友|男朋友|女朋友|老公|老婆|先生|太太|伴侶|孩子|小孩|兒子|女兒|哥哥|弟弟|姊姊|姐姐|妹妹|爸爸|媽媽|爸|媽|學生|他|她)[^。！？!?]{0,14}(?:想自殺|想死|想輕生|自殘|割腕|傷害自己|不想活)/;
const softSignal = /看不[到見](?:未來|希望|出路|明天)|沒有(?:未來|希望|出路)了?(?![的可])|(?:人生|活著|一切|什麼)都?(?:沒有?|毫無)(?:意義|意思)|撐不(?:下去|住)了|再見了|永別|最後一次(?:跟你|和你|找你)?(?:說|聊|講)|以後不會再(?:來|打擾|煩)/;
const outOfScope = /(?:幫我|替我|給我|請)[^。！？!?]{0,10}(?:寫|做|算|解|翻|查)[^。！？!?]{0,14}(?:程式|程式碼|python|javascript|java|sql|excel|code|演算法|作業|報告|論文|作文|履歷|數學|翻譯|食譜|股票)|^(?:請|可以|能不能|可不可以)?(?:寫|給我)[^。！？!?]{0,6}(?:程式|程式碼|python|javascript|sql|code)|翻譯成|翻成(?:英文|日文|中文)/i;

function previousState(value) {
  const state = typeof value === "string" ? { topic: value } : value || {};
  const ids = (values) => Array.isArray(values) ? [...new Set(values.filter((id) => catalog.has(id)))].slice(0, 2) : [];
  return { topic: Object.hasOwn(topicWords, state.topic) ? state.topic : null,
    articleIds: ids(state.articleIds), topicArticleIds: ids(state.topicArticleIds), awaitingMenuChoice: state.awaitingMenuChoice === true,
    offeredSummary: state.offeredSummary === true };
}

function referredArticles(input, state) {
  const named = KNOWLEDGE.articles.filter((a) => input.includes(a.title) || input.includes(a.url));
  if (named.length) return named.slice(0, 2);
  if (/第[一1]篇/.test(input)) return state.articleIds.slice(0, 1).map((id) => catalog.get(id));
  if (/第[二2]篇/.test(input)) return state.articleIds.slice(1, 2).map((id) => catalog.get(id));
  return state.articleIds.map((id) => catalog.get(id));
}

/** Local lexical selection, not a clinical classifier or permission to read
 * source content. State contains only a topic enum and allowlisted catalog IDs.
 * The controller commits selection state only after a completed, uncancelled reply.
 */
export function routeKnowledge(text, previous = null) {
  const input = typeof text === "string" ? text.slice(0, 8000) : "";
  const state = previousState(previous);
  const expandedInput = expandQuery(input);
  const explicitTopic = Object.keys(topicWords).find((key) => topicWords[key].some((word) => expandedInput.includes(word))) || null;
  const topic = explicitTopic || state.topic;
  const currentTopicArticles = rankArticles(input, 1);
  let topicArticleIds = currentTopicArticles.length ? currentTopicArticles.map((a) => a.id)
    : explicitTopic ? [] : [...state.topicArticleIds];
  let guideId = null;
  if (/診斷|確診|藥物劑量|吃多少藥|怎麼用藥|開藥|治療計畫/.test(input)) guideId = "medical_boundary";
  else if (thirdPartyRisk.test(input)) guideId = "third_party_risk";
  else if (softSignal.test(input)) guideId = "soft_check";
  else if (outOfScope.test(input)) guideId = "out_of_scope";
  else if (/只(?:要|想)?(?:聽|陪)|先聽我說|不用建議|不要(?:分析|建議)|只回/.test(input)) guideId = "listen";
  else if (/你(?:理解|聽|想)錯|不是這個意思|不要再猜|你[^。！？!?]{0,6}(?:講|說|回|答)[^。！？!?]{0,6}(?:沒用|沒有用|沒幫助|沒有幫助|廢話)|答非所問|你在敷衍/.test(input)) guideId = "repair";
  else if (/先這樣|不聊了|結束對話|先到這裡|晚安/.test(input)) guideId = "close";
  else if (/怎麼(?:開口|跟.{0,12}說|說比較好)|幫我.{0,12}(?:說|寫)|台詞|開場|話術/.test(input)) guideId = "wording";
  else if (/不知道怎麼說|講不清楚|說不清楚|沒聽清楚|沒有聽清楚/.test(input)) guideId = "clarify";
  else if (/怎麼辦|怎麼做|給我.{0,5}建議|我該.{0,4}做/.test(input)) guideId = "one_step";

  let route = guideId || "core_only", articles = [], script = null, passages = [];
  let nextIds = [...state.articleIds];
  const conversationalPriority = ["medical_boundary", "third_party_risk", "soft_check", "out_of_scope", "listen", "repair", "close"].includes(guideId);
  const sourceRequest = /esconv|empathetic\s*dialogues|未審核.{0,8}(?:案例|個案)|(?:案例|個案).{0,8}逐字稿/i.test(input)
    && /給我|提供|貼出|原始|案例|個案|審核|有沒有|是否|接入|用過|訓練|逐字稿/.test(input);
  const asksContent = contentAsk.test(input) && (/文章|作者|原文|正文/.test(input) || pointer.test(input)
    || (state.articleIds.length > 0 && /整理|總結|摘要|裡面|文中|它/.test(input)));

  if (guideId !== "medical_boundary" && sourceRequest) {
    route = "source_unavailable";
    script = "本專案尚未核准或接入 ESConv 與 EmpatheticDialogues 的原始對話案例，所以不能提供案例，也不能假裝已審核。";
  } else if (guideId !== "medical_boundary" && (asksContent || (state.offeredSummary && !guideId && acceptsOffer(input)))) {
    // Article content (demo scope): answer from this article's passages only.
    const refersToSelection = pointer.test(input) || (state.articleIds.length > 0 && (/它|文中|裡面/.test(input) || !asksContent));
    articles = refersToSelection || queryTokens(input).length === 0 ? referredArticles(input, state) : rankArticles(input, 1);
    nextIds = articles.map((a) => a.id);
    if (articles.length === 1) { route = "article_content"; passages = articlePassages(input, articles[0].id); }
    else {
      route = "article_selection_needed";
      script = articles.length ? "你指的是哪一篇文章？告訴我標題或主題，我再說那篇的內容。" : "你想了解哪一篇文章的內容？告訴我主題，我找找索引裡有沒有。";
    }
  } else if (!conversationalPriority && (articleIntent(input) || pointer.test(input)
      // A short category pick counts as an article request after the menu, or right after an
      // article reply (「焦慮那個」 = a different article); otherwise the model would have to guess a title.
      || ((state.awaitingMenuChoice || state.articleIds.length > 0) && !guideId && menuChoice(input) && input.length <= 16
        // A question (恐慌發作怎麼緩解？) is not a category pick even when it names a category word.
        && !infoAsk.test(input) && !/[？?嗎]|怎麼|如何|為什麼/.test(input)))) {
    const limit = /兩篇|2篇|兩個|2個/.test(input) ? 2 : 1;
    const chosen = (state.awaitingMenuChoice || state.articleIds.length > 0) && !pointer.test(input) && !articleIntent(input)
      ? menuChoice(input) : null;
    if (chosen && !pointer.test(input)) {
      // The user's own word wins (e.g. 霸凌 inside the 霸凌與拒學 category); the category words are the fallback.
      articles = rankArticles(input, limit);
      if (!articles.length) articles = rankArticles(chosen[1], limit);
      route = "article_index";
      topicArticleIds = articles.map((a) => a.id);
    } else if (pointer.test(input)) {
      articles = referredArticles(input, state);
      if (articles.length !== 1) {
        route = "article_selection_needed";
        script = "你指的是哪一篇文章？告訴我標題或主題，我再說那篇的內容。";
      } else route = "article_followup";
    } else {
      const tokens = queryTokens(input);
      const searchText = tokens.length === 0 ? (topicWords[topic]?.join(" ") || "") : input;
      articles = tokens.length === 0 && state.topicArticleIds.length
        ? state.topicArticleIds.slice(0, limit).map((id) => catalog.get(id)) : rankArticles(searchText, limit);
      route = articles.length ? "article_index" : "article_no_match";
      topicArticleIds = articles.map((a) => a.id);
    }
    nextIds = articles.map((a) => a.id);
    if (!script) script = articles.length
      ? `可以參考${articles.map((a) => `《${a.title}》`).join("、")}。${articles.length > 1 ? "想聽哪一篇的重點？" : "想聽我簡單說這篇在講什麼嗎？"}`
      : `目前本地索引沒有直接對應的文章。現有的主題是：${ARTICLE_MENU.map(([label]) => label).join("、")}。你想看哪一類？`;
  }
  if (!script && !passages.length && !conversationalPriority && guideId !== "wording" && guideId !== "clarify" && infoAsk.test(input)) {
    // An informational question grounds in the best passages when the lexical evidence is strong enough.
    const ranked = retrievePassages(input, { limit: 2 }).filter((hit) => hit.evidence && hit.score >= GROUNDING_THRESHOLD);
    // A distant second passage from another article is noise; keep it only when it is nearly as strong.
    const hits = ranked.filter((hit, i) => i === 0 || hit.passage.a === ranked[0].passage.a || hit.score >= ranked[0].score * 0.75);
    if (hits.length) {
      passages = hits; route = "kb_grounded";
      articles = [...new Set(hits.map((hit) => hit.passage.a))].map((id) => catalog.get(id));
      nextIds = articles.map((a) => a.id);
    }
  }
  const awaitingMenuChoice = route === "article_no_match";
  const offeredSummary = route === "article_index";

  const references = articles.map((a) => ({ id: a.id, title: a.title, url: a.url }));
  const addition = script
    ? `這輪是程式確認的資料能力邊界回覆，不是首次招呼。本輪沒有載入文章段落；不能把一般常識說成文章內容。先考慮整段對話的安全；仍有危險訊號就遵循核心安全原則，不查文章。沒有安全疑慮時只逐字說下列固定文字，不新增解釋、建議、引文或網址。之前的助理回覆也不是文章正文或經核實的依據。原文連結由程式附上。\n固定文字：${JSON.stringify(script)}`
    : passages.length
      ? `${guideId ? `${KNOWLEDGE.guides.find((g) => g.id === guideId).guidance}\n` : ""}# 本輪檢索到的文章段落\n${GROUNDED_RULES}${passages.some((hit) => SENSITIVE_ARTICLES.has(hit.passage.a)) ? `\n${SENSITIVE_RULE}` : ""}\n\n${passageBlock(passages)}`
      : guideId ? KNOWLEDGE.guides.find((g) => g.id === guideId).guidance : "這輪只使用常駐原則，不載入文章或案例。";
  return { topic, state: { topic, articleIds: nextIds, topicArticleIds, awaitingMenuChoice, offeredSummary }, route,
    guideId: script ? null : guideId, replyMode: script ? "bounded_script" : passages.length ? "grounded" : "conversation", scriptedText: script,
    sourceMode: passages.length ? "passages" : articles.length ? "metadata_only" : "none", references,
    // No 延伸閱讀 link footer in the transcript at all (demo decision); references stay in metadata and traces.
    citations: [],
    passageIds: passages.map((hit) => hit.passage.id),
    instructions: `${PSYCH_SUPPORT_INSTRUCTIONS}\n\n# 本輪載入的對話指引\n安全與核心規則始終優先。\n${addition}` };
}

/** Only punctuation/spacing and a short acknowledgment may differ. Do not attach
 * trusted source links to an unrelated, invented or safety-prioritized reply. */
export function matchesBoundedReply(actual, expected) {
  const normalize = (value) => value.normalize("NFKC").replace(/[\p{P}\p{Z}\s]/gu, "").replace(/^(?:好的|好|嗯)/u, "");
  return typeof actual === "string" && typeof expected === "string" && normalize(actual) === normalize(expected);
}

/** A paraphrased article reply still counts as presenting the article when it names every referenced title. */
export function namesReferences(actual, references) {
  const normalize = (value) => value.normalize("NFKC").replace(/[\p{P}\p{Z}\s]/gu, "");
  return typeof actual === "string" && Array.isArray(references) && references.length > 0
    && references.every((a) => normalize(actual).includes(normalize(a.title).slice(0, 8)));
}

/** Trusted catalog links for display; model-generated URLs are never a source. */
export function citationFooter(references) {
  return references.length ? "\n\n延伸閱讀（原文）：\n" + references.map((a) => `- [${a.title.replaceAll("[", "（").replaceAll("]", "）")}](${a.url})`).join("\n") : "";
}
