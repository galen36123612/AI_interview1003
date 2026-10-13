import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "missing_openai_api_key",
        detail: "Server environment variable OPENAI_API_KEY is not set.",
      },
      { status: 500 }
    );
  }

  try {
    const cookieStore = await cookies();
    const existingUserId = cookieStore.get("anonId")?.value;
    const userId = existingUserId || randomUUID();

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expires_after: { anchor: "created_at", seconds: 600 },
          session: {
            type: "realtime",
            model: "gpt-realtime",
            audio: {
              output: { voice: "cedar" },
              input: {
                noise_reduction: { type: "near_field" },
                transcription: {
                  model: "gpt-4o-mini-transcribe",
                  language: "zh",
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.62,
                  prefix_padding_ms: 450,
                  silence_duration_ms: 900,
                  create_response: true,
                  interrupt_response: true,
                },
              },
            },
          },
        }),
        cache: "no-store",
      }
    );

    const payload = await openAIResponse.json().catch(() => null);
    if (!openAIResponse.ok || !payload?.value) {
      console.error("OpenAI Realtime client secret failed", {
        status: openAIResponse.status,
        payload,
      });
      return NextResponse.json(
        {
          error: "realtime_session_failed",
          detail: "OpenAI Realtime session could not be created.",
        },
        { status: openAIResponse.status || 502 }
      );
    }

    const response = NextResponse.json(
      {
        client_secret: {
          value: payload.value,
          expires_at: payload.expires_at,
        },
        model: payload.session?.model || "gpt-realtime",
        userId,
        sessionId: randomUUID(),
      },
      { headers: { "cache-control": "no-store" } }
    );

    if (!existingUserId) {
      response.cookies.set({
        name: "anonId",
        value: userId,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    console.error("Error creating realtime session", error);
    return NextResponse.json(
      {
        error: "internal_server_error",
        detail: "Unable to create a realtime session.",
      },
      { status: 500 }
    );
  }
}
