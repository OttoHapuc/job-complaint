import { openrouter, openrouterInvestigationModel } from "@/lib/openrouter";

type ConversationEntry = {
  authorType: "WHISTLEBLOWER" | "SYSTEM" | "COUNCIL";
  content: string;
  createdAt: string;
};

export type ReviewIterationResult = {
  consistencyScore: number;
  isConclusive: boolean;
  recommendedAction: "ASK_FOLLOWUP" | "CONCLUDE_REVIEW" | "ESCALATE";
  summary: string;
  nextQuestions: string[];
  inferredPeople: string[];
  potentialBlockedMentions: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  model: string;
  provider: "openrouter" | "fallback";
};

type Input = {
  latestNarrative: string;
  guardIsMalicious: boolean;
  conversation: ConversationEntry[];
  category: string;
  risk: "LOW" | "MEDIUM" | "CRITICAL";
  iterationNumber: number;
};

function estimateTokenUsage(text: string) {
  return Math.max(32, Math.ceil(text.length / 4));
}

function estimateCostUsd(totalTokens: number) {
  return Number((totalTokens * 0.0000065).toFixed(6));
}

function fallbackResult(input: Input): ReviewIterationResult {
  const whistleblowerTurns = input.conversation.filter(
    (item) => item.authorType === "WHISTLEBLOWER",
  ).length;
  const consistencyScore = Math.min(0.95, Math.max(0.2, input.latestNarrative.length / 800));
  const isConclusive =
    !input.guardIsMalicious &&
    whistleblowerTurns >= 4 &&
    consistencyScore >= 0.8 &&
    input.iterationNumber >= 2;

  const nextQuestions = isConclusive
    ? []
    : [
        "Para avançarmos com segurança, você pode detalhar o último episódio com local aproximado e quem estava presente?",
        "Há evidências adicionais (mensagens, documentos ou prints) que queira anexar para reforçar a análise?",
      ];
  const textForUsage = `${input.latestNarrative}\n${nextQuestions.join("\n")}`;
  const promptTokens = estimateTokenUsage(textForUsage);
  const completionTokens = 180;
  const totalTokens = promptTokens + completionTokens;

  return {
    consistencyScore,
    isConclusive,
    recommendedAction: isConclusive ? "CONCLUDE_REVIEW" : "ASK_FOLLOWUP",
    summary: isConclusive
      ? "Conjunto de informações consistente para encaminhar pre-conclusão."
      : "Ainda há lacunas relevantes; necessário aprofundar questionário.",
    nextQuestions,
    inferredPeople: [],
    potentialBlockedMentions: [],
    confidence: isConclusive ? "MEDIUM" : "LOW",
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCostUsd(totalTokens),
    },
    model: "heuristic-fallback",
    provider: "fallback",
  };
}

function clampScore(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function toStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function runInvestigationReviewIteration(input: Input): Promise<ReviewIterationResult> {
  const fallback = fallbackResult(input);
  if (!openrouter) return fallback;

  try {
    const completion = await openrouter.chat.completions.create({
      model: openrouterInvestigationModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é um Agente de Investigação corporativa. Avalie consistência do relato, proponha perguntas objetivas e decida se a revisão pode ser concluída. Responda somente JSON com: consistencyScore (0..1), isConclusive (bool), recommendedAction (ASK_FOLLOWUP|CONCLUDE_REVIEW|ESCALATE), summary, nextQuestions (string[]), inferredPeople (string[]), potentialBlockedMentions (string[]), confidence (LOW|MEDIUM|HIGH).",
        },
        {
          role: "user",
          content: JSON.stringify({
            category: input.category,
            risk: input.risk,
            guardIsMalicious: input.guardIsMalicious,
            latestNarrative: input.latestNarrative,
            iterationNumber: input.iterationNumber,
            conversation: input.conversation,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const isConclusive = Boolean(parsed.isConclusive);
    const consistencyScore = clampScore(parsed.consistencyScore, fallback.consistencyScore);
    const recommendedAction = ["ASK_FOLLOWUP", "CONCLUDE_REVIEW", "ESCALATE"].includes(
      String(parsed.recommendedAction),
    )
      ? (String(parsed.recommendedAction) as ReviewIterationResult["recommendedAction"])
      : isConclusive
        ? "CONCLUDE_REVIEW"
        : "ASK_FOLLOWUP";
    const nextQuestions = toStringList(parsed.nextQuestions);
    const promptTokens = completion.usage?.prompt_tokens ?? fallback.usage.promptTokens;
    const completionTokens = completion.usage?.completion_tokens ?? fallback.usage.completionTokens;
    const totalTokens = completion.usage?.total_tokens ?? promptTokens + completionTokens;
    const confidenceRaw = String(parsed.confidence || "MEDIUM").toUpperCase();

    return {
      consistencyScore,
      isConclusive,
      recommendedAction,
      summary: String(parsed.summary || fallback.summary).slice(0, 600),
      nextQuestions:
        nextQuestions.length > 0 ? nextQuestions : fallback.nextQuestions,
      inferredPeople: toStringList(parsed.inferredPeople),
      potentialBlockedMentions: toStringList(parsed.potentialBlockedMentions),
      confidence: ["LOW", "MEDIUM", "HIGH"].includes(confidenceRaw)
        ? (confidenceRaw as "LOW" | "MEDIUM" | "HIGH")
        : "MEDIUM",
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: estimateCostUsd(totalTokens),
      },
      model: openrouterInvestigationModel,
      provider: "openrouter",
    };
  } catch {
    return fallback;
  }
}

export async function runPreConclusionSynthesis(input: {
  category: string;
  risk: "LOW" | "MEDIUM" | "CRITICAL";
  reviewSummaries: string[];
  inferredPeople: string[];
}) {
  const fallbackRecommendation =
    "Caso apto para deliberação do conselho com foco em mitigação de risco e plano de ação preventivo.";
  if (!openrouter) return fallbackRecommendation;

  try {
    const completion = await openrouter.chat.completions.create({
      model: openrouterInvestigationModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você sintetiza pre-conclusão para conselho. Responda somente JSON com campo recommendation (string curta e acionável).",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return String(parsed.recommendation || fallbackRecommendation).slice(0, 700);
  } catch {
    return fallbackRecommendation;
  }
}

