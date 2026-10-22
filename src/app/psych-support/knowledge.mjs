import { KNOWLEDGE } from "./knowledge.generated.mjs";
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
const skipTokens = new Set([
  "推薦", "文章", "相關", "閱讀", "資料", "看看", "可以", "有沒有", "什麼", "一篇", "兩篇", "幾篇", "提供", "幫忙", "一下", "請問", "想看", "希望", "原文", "給我", "幫我", "關於", "連結", "來源", "這個", "那個", "問題", "狀況", "情況", "忽略", "規則", "保證", "直接", "所有", "目前",
  "剛才", "剛剛", "那篇", "這篇", "上篇", "上一", "那一", "這一", "請把", "作者", "內容", "全文", "正文", "摘要", "總結", "整理", "重點", "建議", "具體", "方法", "技巧", "做法", "步驟", "說明", "介紹", "提到", "裡面", "文中", "怎麼", "怎樣", "怎麼辦", "怎麼做", "如何", "哪些", "有什麼", "常見", "一次", "知道", "告訴", "再來", "改成", "改為", "不要", "不用", "不想", "之前",
]);
const normalized = (text) => text.normalize("NFKC").toLowerCase();
const catalog = new Map(KNOWLEDGE.articles.map((a) => [a.id, a]));
const backgroundWords = new Set(["學校", "學生", "國中", "高中"]);
const articleIntent = (text) => !/(?:不要|不用|不想|別)(?:再|給我|推薦|看|讀|找|提供){0,3}(?:文章|閱讀|讀物)/.test(text)
  && /文章|延伸閱讀|推薦讀物|原文連結/.test(text);
const pointer = /剛(?:才|剛)(?:推薦的)?(?:那|這)?一?篇|(?:上|這|那)一?篇|第[一二12]篇|[這那上]個連結/;
const contentAsk = /摘要|總結|重點|具體建議|全文|正文|完整內容|文章內容|引述|引用|逐字|摘錄|結論|主張|觀點|介紹|解釋|分析|(?:說|寫|講).{0,4}什麼|原文.{0,6}(?:說|寫)|作者.{0,12}(?:說|寫|建議)|(?:文章|[這那上]篇).{0,12}(?:建議|方法)/;

function queryTokens(text) {
  return [...new Set([...new Intl.Segmenter("zh-TW", { granularity: "word" }).segment(normalized(text).replaceAll("放心說", ""))]
    .filter((s) => s.isWordLike && s.segment.length >= 2 && !skipTokens.has(s.segment)
      && !/^[零〇一二兩三四五六七八九十百\d]+(?:個|篇|點|種|項|步|分鐘|秒)?$/u.test(s.segment))
    .map((s) => s.segment))];
}

function rankArticles(text, limit) {
  const searchText = normalized(text), tokens = queryTokens(text);
  // Common title words are not sufficient subject evidence. All 54 titles stay
  // searchable; curated keywords give stronger evidence but no content access.
  const subjectTokens = tokens.filter((token) => !backgroundWords.has(token)
    && KNOWLEDGE.articles.filter((a) => normalized(a.title).includes(token)).length <= 13);
  return KNOWLEDGE.articles.map((article) => ({ article, score:
    article.keywords.reduce((n, word) => n + (searchText.includes(word) ? backgroundWords.has(word) ? 2 : Math.min(word.length, 5) * 2 : 0), 0)
    + subjectTokens.reduce((n, token) => n + (normalized(article.title).includes(token) ? token.length : 0), 0) }))
    .filter((a) => a.score >= 2).sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, limit).map((a) => a.article);
}

function previousState(value) {
  const state = typeof value === "string" ? { topic: value } : value || {};
  const ids = (values) => Array.isArray(values) ? [...new Set(values.filter((id) => catalog.has(id)))].slice(0, 2) : [];
  return { topic: Object.hasOwn(topicWords, state.topic) ? state.topic : null,
    articleIds: ids(state.articleIds), topicArticleIds: ids(state.topicArticleIds) };
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
  const explicitTopic = Object.keys(topicWords).find((key) => topicWords[key].some((word) => input.includes(word))) || null;
  const topic = explicitTopic || state.topic;
  const currentTopicArticles = rankArticles(input, 1);
  let topicArticleIds = currentTopicArticles.length ? currentTopicArticles.map((a) => a.id)
    : explicitTopic ? [] : [...state.topicArticleIds];
  let guideId = null;
  if (/診斷|確診|藥物劑量|吃多少藥|怎麼用藥|開藥|治療計畫/.test(input)) guideId = "medical_boundary";
  else if (/只(?:要|想)?(?:聽|陪)|先聽我說|不用建議|不要(?:分析|建議)|只回/.test(input)) guideId = "listen";
  else if (/你(?:理解|聽|想)錯|不是這個意思|不要再猜/.test(input)) guideId = "repair";
  else if (/先這樣|不聊了|結束對話|先到這裡|晚安/.test(input)) guideId = "close";
  else if (/怎麼(?:開口|跟.{0,12}說|說比較好)|幫我.{0,12}(?:說|寫)|台詞|開場|話術/.test(input)) guideId = "wording";
  else if (/不知道怎麼說|講不清楚|說不清楚|沒聽清楚|沒有聽清楚/.test(input)) guideId = "clarify";
  else if (/怎麼辦|怎麼做|給我.{0,5}建議|我該.{0,4}做/.test(input)) guideId = "one_step";

  let route = guideId || "core_only", articles = [], script = null;
  let nextIds = [...state.articleIds];
  const conversationalPriority = ["medical_boundary", "listen", "repair", "close"].includes(guideId);
  const sourceRequest = /esconv|empathetic\s*dialogues|未審核.{0,8}(?:案例|個案)|(?:案例|個案).{0,8}逐字稿/i.test(input)
    && /給我|提供|貼出|原始|案例|個案|審核|有沒有|是否|接入|用過|訓練|逐字稿/.test(input);
  const asksContent = contentAsk.test(input) && (/文章|作者|原文|正文/.test(input) || pointer.test(input)
    || (state.articleIds.length > 0 && /整理|總結|摘要|裡面|文中|它/.test(input)));

  if (guideId !== "medical_boundary" && sourceRequest) {
    route = "source_unavailable";
    script = "本專案尚未核准或接入 ESConv 與 EmpatheticDialogues 的原始對話案例，所以不能提供案例，也不能假裝已審核。";
  } else if (guideId !== "medical_boundary" && asksContent) {
    // Capabilities precede retrieval. No matching score can enable article bodies.
    route = "article_content_unavailable";
    const refersToSelection = pointer.test(input) || (state.articleIds.length > 0 && /它|文中|裡面/.test(input));
    articles = refersToSelection || queryTokens(input).length === 0 ? referredArticles(input, state) : rankArticles(input, 1);
    nextIds = articles.map((a) => a.id);
    script = "我目前只有文章的標題與原文連結，沒有讀取正文，不能替作者整理具體建議或引用原文。你可以開啟原文閱讀。";
  } else if (!conversationalPriority && (articleIntent(input) || pointer.test(input))) {
    const limit = /兩篇|2篇|兩個|2個/.test(input) ? 2 : 1;
    if (pointer.test(input)) {
      articles = referredArticles(input, state);
      if (articles.length !== 1) {
        route = "article_selection_needed";
        script = "你指的是哪一篇文章？請告訴我標題，我目前只能提供索引中的標題與原文連結。";
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
      ? `可以參考${articles.map((a) => `《${a.title}》`).join("、")}。我目前只有標題與原文連結，沒有讀取文章正文。`
      : "目前本地索引沒有找到合適的文章。你可以再提供一個想了解的主題。";
  }

  const references = articles.map((a) => ({ id: a.id, title: a.title, url: a.url }));
  const addition = script
    ? `這輪是程式確認的資料能力邊界回覆，不是首次招呼。沒有文章摘要或正文可用；不能把一般常識說成文章內容。先考慮整段對話的安全；仍有危險訊號就遵循核心安全原則，不查文章。沒有安全疑慮時只逐字說下列固定文字，不新增解釋、建議、引文或網址。之前的助理回覆也不是文章正文或經核實的依據。原文連結由程式附上。\n固定文字：${JSON.stringify(script)}`
    : guideId ? KNOWLEDGE.guides.find((g) => g.id === guideId).guidance : "這輪只使用常駐原則，不載入文章或案例。";
  return { topic, state: { topic, articleIds: nextIds, topicArticleIds }, route,
    guideId: script ? null : guideId, replyMode: script ? "bounded_script" : "conversation",
    sourceMode: articles.length ? "metadata_only" : "none", references,
    instructions: `${PSYCH_SUPPORT_INSTRUCTIONS}\n\n# 本輪載入的對話指引\n安全與核心規則始終優先。\n${addition}` };
}

/** Trusted catalog links for display; model-generated URLs are never a source. */
export function citationFooter(references) {
  return references.length ? "\n\n延伸閱讀（原文）：\n" + references.map((a) => `- [${a.title.replaceAll("[", "（").replaceAll("]", "）")}](${a.url})`).join("\n") : "";
}
