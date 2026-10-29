import { AgentConfig } from "@/app/types";
import { PSYCH_SUPPORT_INSTRUCTIONS } from "@/app/psych-support/instructions.mjs";

const psychologicalSupport: AgentConfig = {
  name: "psychologicalSupport",
  publicDescription: "繁體中文心理支持 AI：先承接情緒，再協助整理、反思與形成可行下一步。",
  instructions: PSYCH_SUPPORT_INSTRUCTIONS,
  tools: [],
};

const psychologicalSupportAgents = [psychologicalSupport];
export default psychologicalSupportAgents;
