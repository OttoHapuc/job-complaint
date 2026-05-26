import OpenAI from "openai";

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

export const openrouter = openRouterApiKey
  ? new OpenAI({
      apiKey: openRouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
    })
  : null;

export const openrouterModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
export const openrouterInvestigationModel =
  process.env.OPENROUTER_INVESTIGATION_MODEL || "openai/gpt-4o";
