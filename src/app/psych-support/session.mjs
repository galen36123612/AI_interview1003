import { PSYCH_SUPPORT_INSTRUCTIONS } from "./instructions.mjs";

export const PREVIEW_MODEL = "gpt-realtime";
export const MAX_SESSION_MS = 10 * 60 * 1000;

export function sessionConfiguration() {
  return {
    type: "realtime",
    model: PREVIEW_MODEL,
    instructions: PSYCH_SUPPORT_INSTRUCTIONS,
    output_modalities: ["audio"],
    max_output_tokens: 768,
    tools: [],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: { model: "gpt-4o-mini-transcribe", language: "zh" },
        turn_detection: {
          type: "semantic_vad", eagerness: "low",
          create_response: true, interrupt_response: true,
        },
      },
      output: { voice: "cedar" },
    },
  };
}

function errorResponse(status, error) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/** SDP only. Audio and user text travel directly from browser to OpenAI. */
export async function createPsychSession(request, apiKey, fetchImpl = fetch) {
  // Next.js can use an internal hostname for request.url. The browser's Host
  // header identifies the public site (including its preview alias). Never use
  // arbitrary forwarded-host headers as the allowed origin.
  const requestUrl = new URL(request.url);
  const publicOrigin = `${requestUrl.protocol}//${request.headers.get("host") || requestUrl.host}`;
  if (request.headers.get("origin") !== publicOrigin) {
    return errorResponse(403, "不允許從其他網站建立測試連線。");
  }
  if (request.headers.get("x-psych-preview-connect") !== "1") {
    return errorResponse(400, "請從頁面操作開始連線。");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/sdp") {
    return errorResponse(415, "需要 WebRTC SDP 連線資料。");
  }
  if (!apiKey) return errorResponse(503, "Vercel Preview 尚未設定 OPENAI_API_KEY。");
  const sdp = await request.text();
  if (sdp.length > 100_000 || !/^v=0\r?\n/.test(sdp) || !sdp.includes("m=audio")) {
    return errorResponse(400, "WebRTC 連線資料格式不正確。");
  }
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(sessionConfiguration()));
  try {
    const response = await fetchImpl("https://api.openai.com/v1/realtime/calls", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` },
      body: form, signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      return errorResponse(response.status === 429 ? 429 : 502,
        response.status === 429 ? "OpenAI 使用量或速率限制，請稍後重試。" : "OpenAI Realtime 暫時無法連線，請確認 Preview API key 與模型權限。");
    }
    const answer = await response.text();
    if (!/^v=0\r?\n/.test(answer)) return errorResponse(502, "Realtime 未回傳有效的連線資訊。");
    return new Response(answer, { headers: { "Content-Type": "application/sdp", "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(502, "Realtime 連線逾時或中斷，請重試。");
  }
}
