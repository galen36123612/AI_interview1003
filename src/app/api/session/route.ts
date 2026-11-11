import { createPsychSession, PREVIEW_MODEL } from "@/app/psych-support/session.mjs";
import { KNOWLEDGE } from "@/app/psych-support/knowledge.generated.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    model: PREVIEW_MODEL,
    configured: Boolean(process.env.OPENAI_API_KEY),
    persona: "psychologicalSupport",
    variant: "C_core_file_routing",
    explicitSignalGuardEnabled: true,
    routerEnabled: true,
    routerKind: "local_lexical_guidance_and_article_index",
    offlineResearchRouterEnabled: false,
    knowledgeVersion: KNOWLEDGE.version,
    articleIndexCount: KNOWLEDGE.articles.length,
    approvedCaseCount: KNOWLEDGE.cases.length,
    articleContentEnabled: false,
    ragEnabled: false,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  return createPsychSession(request, process.env.OPENAI_API_KEY);
}
