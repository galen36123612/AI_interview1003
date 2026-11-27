import { S2T_PAIRS } from "./s2t.generated.mjs";

/** Speech recognition and some input methods return Simplified characters for Taiwanese users.
 * Character table first; it only holds forms Traditional text does not use, so Traditional input
 * passes through unchanged. The phrase rules below touch characters both scripts share (后, 里, 么)
 * and therefore run only when the table already found Simplified text. Not a full converter. */
const TABLE = new Map();
for (let i = 0; i < S2T_PAIRS.length; i += 2) TABLE.set(S2T_PAIRS[i], S2T_PAIRS[i + 1]);

const PHRASES = [
  [/(什|怎|這|那|多|甚|要)么/g, "$1麼"], [/着/g, "著"],
  [/(然|以|之|最|今|往|背|事|隨|稍|過|落|日|先)后/g, "$1後"], [/后(來|面|悔|果|天|續|退|者)/g, "後$1"],
  [/几(個|天|次|年|月|點|分|件|位|種|乎|句|歲|張|遍|回|下|十|百|千)/g, "幾$1"],
  [/干(嘛|什|麼|活|部)/g, "幹$1"], [/(對|關|由|終|至|屬|等|在|位|處|過|基|出|善|敢|急)于/g, "$1於"], [/于是/g, "於是"],
  [/(這|那|哪|家|心|夜|手|嘴|屋|城|公司|醫院|房間|學校)里/g, "$1裡"], [/里(面|頭|邊)/g, "裡$1"],
  [/關系/g, "關係"], [/聯系/g, "聯繫"], [/頭發/g, "頭髮"], [/復雜/g, "複雜"], [/重復/g, "重複"],
  [/准(備|確|時|則)/g, "準$1"], [/標准/g, "標準"], [/(放|輕)松/g, "$1鬆"],
];

export function toTraditional(text) {
  if (typeof text !== "string" || !text) return text;
  let changed = false;
  const mapped = text.replace(/[一-鿿]/g, (ch) => { const t = TABLE.get(ch); if (t) changed = true; return t || ch; });
  return changed ? PHRASES.reduce((value, [pattern, to]) => value.replace(pattern, to), mapped) : mapped;
}
