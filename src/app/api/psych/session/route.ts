import { createPsychSession, PREVIEW_MODEL } from "@/app/psych-support/session.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    model: PREVIEW_MODEL,
    configured: Boolean(process.env.OPENAI_API_KEY),
    variant: "A_prompt_only",
    routerEnabled: false,
    ragEnabled: false,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  return createPsychSession(request, process.env.OPENAI_API_KEY);
}
