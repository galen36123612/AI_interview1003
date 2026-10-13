/*import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2025-06-03",
          // model: "gpt-4o-mini-realtime-preview-2024-12-17",
        }),
      }
    );
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}*/

// 0811 log Testing

/*import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function GET() {
  try {
    // 建立/讀取匿名 userId（cookie）
    const jar = await cookies(); // ✅ Next 15 要 await
    let userId = jar.get("anonId")?.value;
    if (!userId) {
      userId = randomUUID();
      jar.set({
        name: "anonId",
        value: userId,
        httpOnly: false, // 若不需前端讀取可改 true
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    // 本次交談 sessionId（暫不落庫）
    const sessionId = randomUUID();

    // 向 OpenAI 取 Realtime ephemeral key（沿用你的邏輯）
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2025-06-03",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI session error:", errText);
      return NextResponse.json({ error: "Failed to create realtime session" }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json({ ...data, userId, sessionId });
  } catch (error) {
    console.error("Error in /session:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}*/

// 0811 V1

/*import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export const runtime = "nodejs"; // 用 Node.js runtime

export async function GET() {
  try {
    // 1) 讀/建匿名 userId
    const cookieStore = await cookies(); // ← 這裡用 await，避免型別是 Promise
    let userId = cookieStore.get("anonId")?.value;
    const needSetCookie = !userId;
    if (!userId) userId = randomUUID();

    // 2) 產生這次連線的 sessionId
    const sessionId = randomUUID();

    // 3) 向 OpenAI 建立 Realtime ephemeral session
    const resp = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        // 或換你之前那個 2025-06-03 預覽型號都行
      }),
    });

    const data = await resp.json();

    // 4) 回傳 ephemeral key + 我們自己的 userId / sessionId
    const res = NextResponse.json({
      ...data,
      userId,
      sessionId,
    });

    // 5) 只有在沒有 anonId 時才設 cookie（用 NextResponse 設）
    if (needSetCookie) {
      res.cookies.set({
        name: "anonId",
        value: userId,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 年
      });
    }

    return res;
  } catch (error: any) {
    console.error("Error in /api/session:", error);
    return NextResponse.json(
      { error: "Internal Server Error", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}*/

//0513

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export const runtime = "nodejs";


export async function GET() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "Missing OPENAI_API_KEY",
          detail: "Server environment variable OPENAI_API_KEY is not set.",
        },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    let userId = cookieStore.get("anonId")?.value;
    const needSetCookie = !userId;

    if (!userId) userId = randomUUID();

    const sessionId = randomUUID();

    const resp = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: {
          type: "realtime",
          model: "gpt-realtime",

          // instruction 交給 app.tsx / agentConfig 的 session.update 管理
          audio: {
            output: {
              voice: "shimmer",
            },
            input: {
              noise_reduction: {
                type: "near_field",
              },
              transcription: {
                model: "gpt-4o-mini-transcribe",
                language: "zh",
              },
              turn_detection: {
                type: "server_vad",
                threshold: 0.65,
                prefix_padding_ms: 500,
                silence_duration_ms: 1000,
                create_response: true,

                // 這個一定要保留，才允許使用者語音插話時中斷模型回應
                interrupt_response: true,
              },
            },
          },
        },
      }),
      cache: "no-store",
    });

    const rawText = await resp.text();

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = {
        error: "openai_non_json_response",
        raw: rawText.slice(0, 1000),
      };
    }

    if (!resp.ok) {
      console.error("OpenAI Realtime client secret failed:", {
        status: resp.status,
        statusText: resp.statusText,
        data,
      });

      return NextResponse.json(
        {
          error: "openai_realtime_client_secret_failed",
          status: resp.status,
          statusText: resp.statusText,
          detail: data,
        },
        { status: resp.status }
      );
    }

    if (!data?.value) {
      console.error("OpenAI response missing value:", data);

      return NextResponse.json(
        {
          error: "missing_realtime_client_secret_value",
          detail: data,
        },
        { status: 502 }
      );
    }

    const res = NextResponse.json(
      {
        ...data,
        client_secret: {
          value: data.value,
          expires_at: data.expires_at,
        },
        model: data.session?.model || "gpt-realtime",
        userId,
        sessionId,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
      }
    );

    if (needSetCookie) {
      res.cookies.set({
        name: "anonId",
        value: userId,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === "production",
      });
    }

    return res;
  } catch (error: any) {
    console.error("Error in /api/session:", error);

    return NextResponse.json(
      {
        error: "Internal Server Error",
        detail: String(error?.message || error),
      },
      { status: 500 }
    );
  }
}






