import { RiskLevel } from "@prisma/client";
import { openrouter, openrouterModel } from "@/lib/openrouter";
import { mapCategoryFromNarrative } from "@/lib/security";

export type AttachmentIntelSummary = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  summary: string;
  riskHints: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

export type TriageResult = {
  schemaVersion: "1.0.0";
  sanitizedNarrative: string;
  narrativeForCouncil: string;
  sanitizationMode: "STRICT" | "BALANCED" | "MINIMAL";
  sanitizationReason: string;
  aiCategory: string;
  risk: RiskLevel;
  conflictSignals: string[];
  autoBlockedUserNames: string[];
  recommendedCouncilBrief: string;
  attachmentSummary: AttachmentIntelSummary[];
  provider: "openrouter" | "fallback";
  model: string;
  fallbackUsed: boolean;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
};

export type TriagePayload = {
  narrative: string;
  conversationCount: number;
  attachments: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    textPreview?: string;
  }>;
};

function sanitizeWithRegex(
  text: string,
  mode: "STRICT" | "BALANCED" | "MINIMAL",
) {
  const piiSafe = text
    .replace(/\b(?:matr[ií]cula|registro)\s*[:#-]?\s*[A-Za-z0-9.-]{3,30}\b/gi, "[ID_INTERNO]")
    .replace(/\b[\w.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})-?\d{4}\b/g, "[PHONE]");

  if (mode === "MINIMAL") {
    return piiSafe;
  }

  const withNameRedaction = piiSafe
    .replace(
      /\b(?:nome|gestor|líder|lider|colaborador|funcionário|funcionario)\s*[:\-]\s*[^\n,.;]{2,80}/gi,
      "[CAMPO_IDENTIFICADO]",
    )
    .replace(
      /\b([A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][a-záâãàéêíóôõúç]{2,}\s+[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][a-záâãàéêíóôõúç]{2,})\b/g,
      "[NOME_PESSOA]",
    );

  if (mode === "BALANCED") {
    return withNameRedaction;
  }

  return withNameRedaction.replace(/\b\d{4,10}\b/g, "[ID]");
}

function classifyRiskFallback(text: string): RiskLevel {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("assédio sexual") ||
    normalized.includes("assedio sexual") ||
    normalized.includes("fraude") ||
    normalized.includes("corrup")
  ) {
    return RiskLevel.CRITICAL;
  }
  if (
    normalized.includes("assédio") ||
    normalized.includes("assedio") ||
    normalized.includes("discrimina")
  ) {
    return RiskLevel.MEDIUM;
  }
  return RiskLevel.LOW;
}

function estimateTokenUsage(text: string) {
  return Math.max(32, Math.ceil(text.length / 4));
}

function estimateCostUsd(totalTokens: number) {
  // Conservative rough estimate for small models.
  return Number((totalTokens * 0.0000015).toFixed(6));
}

function normalizeAttachmentSummary(
  attachments: TriagePayload["attachments"],
): AttachmentIntelSummary[] {
  return attachments.map((attachment) => ({
    fileName: attachment.fileName,
    mimeType: attachment.mimeType || "application/octet-stream",
    sizeBytes: attachment.sizeBytes,
    summary: attachment.textPreview
      ? `Arquivo com conteúdo textual fornecido para análise (${attachment.textPreview.slice(0, 200)}).`
      : "Arquivo sem prévia textual disponível; classificado apenas por metadados.",
    riskHints: [],
    confidence: attachment.textPreview ? "MEDIUM" : "LOW",
  }));
}

function normalizeRisk(value: unknown, fallback: RiskLevel): RiskLevel {
  const riskRaw = String(value || fallback).toUpperCase();
  if (riskRaw === RiskLevel.CRITICAL || riskRaw === RiskLevel.MEDIUM || riskRaw === RiskLevel.LOW) {
    return riskRaw as RiskLevel;
  }
  return fallback;
}

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

function normalizeSanitizationMode(
  value: unknown,
): "STRICT" | "BALANCED" | "MINIMAL" {
  const raw = String(value || "BALANCED").toUpperCase();
  if (raw === "STRICT" || raw === "BALANCED" || raw === "MINIMAL") return raw;
  return "BALANCED";
}

export async function runAiTriage(payload: TriagePayload): Promise<TriageResult> {
  const lower = payload.narrative.toLowerCase();
  const fallbackMode: "STRICT" | "BALANCED" | "MINIMAL" =
    lower.includes("assédio") ||
    lower.includes("assedio") ||
    lower.includes("violência") ||
    lower.includes("violencia")
      ? "MINIMAL"
      : "BALANCED";
  const fallbackSanitized = sanitizeWithRegex(payload.narrative, fallbackMode);
  const fallbackCategory = mapCategoryFromNarrative(fallbackSanitized);
  const fallbackRisk = classifyRiskFallback(fallbackSanitized);
  const fallbackAttachmentSummary = normalizeAttachmentSummary(payload.attachments);
  const fallbackPromptTokens = estimateTokenUsage(payload.narrative);
  const fallbackCompletionTokens = 60;
  const fallbackTotal = fallbackPromptTokens + fallbackCompletionTokens;
  const fallbackBrief = `Denúncia classificada automaticamente como ${fallbackCategory} com risco ${fallbackRisk}. Revisão inicial recomendada para validação de contexto e evidências.`;
  const fallbackSanitizationReason =
    fallbackMode === "MINIMAL"
      ? "Contexto sugere necessidade de manter identidade funcional para utilidade investigativa."
      : "Aplicada anonimização equilibrada para preservar utilidade e reduzir exposição de dados.";
  const fallbackConflictSignals = toStringArray(
    payload.narrative.match(/\b(gestor|diretor|lider|líder|rh|compliance|financeiro)\b/gi) ?? [],
  );

  if (!openrouter) {
    return {
      schemaVersion: "1.0.0",
      sanitizedNarrative: fallbackSanitized,
      narrativeForCouncil: fallbackSanitized,
      sanitizationMode: fallbackMode,
      sanitizationReason: fallbackSanitizationReason,
      aiCategory: fallbackCategory,
      risk: fallbackRisk,
      conflictSignals: fallbackConflictSignals,
      autoBlockedUserNames: [],
      recommendedCouncilBrief: fallbackBrief,
      attachmentSummary: fallbackAttachmentSummary,
      provider: "fallback",
      model: "regex-fallback",
      fallbackUsed: true,
      usage: {
        promptTokens: fallbackPromptTokens,
        completionTokens: fallbackCompletionTokens,
        totalTokens: fallbackTotal,
        estimatedCostUsd: estimateCostUsd(fallbackTotal),
      },
    };
  }

  try {
    const completion = await openrouter.chat.completions.create({
      model: openrouterModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você é um motor de triagem de denúncias corporativas. Responda SOMENTE em JSON com campos: schemaVersion, sanitizedNarrative, narrativeForCouncil, sanitizationMode (STRICT|BALANCED|MINIMAL), sanitizationReason, aiCategory, risk, conflictSignals, autoBlockedUserNames, recommendedCouncilBrief, attachmentSummary. Em MINIMAL preserve nomes quando forem necessários para investigação (ex.: assédio), mas sempre remova CPF, telefone e e-mail.",
        },
        {
          role: "user",
          content: JSON.stringify({
            narrative: payload.narrative,
            conversationCount: payload.conversationCount,
            attachments: payload.attachments,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const aiMode = normalizeSanitizationMode(parsed.sanitizationMode);
    const sanitizedNarrative = sanitizeWithRegex(
      String(parsed.sanitizedNarrative ?? fallbackSanitized).trim() || fallbackSanitized,
      "STRICT",
    );
    const narrativeForCouncil = sanitizeWithRegex(
      String(parsed.narrativeForCouncil ?? payload.narrative).trim() || payload.narrative,
      aiMode,
    );
    const aiCategory = String(parsed.aiCategory ?? fallbackCategory).trim().slice(0, 80) || fallbackCategory;
    const risk = normalizeRisk(parsed.risk, fallbackRisk);
    const conflictSignals = toStringArray(parsed.conflictSignals);
    const autoBlockedUserNames = toStringArray(parsed.autoBlockedUserNames);
    const recommendedCouncilBrief =
      String(parsed.recommendedCouncilBrief ?? "").trim().slice(0, 700) || fallbackBrief;
    const sanitizationReason =
      String(parsed.sanitizationReason ?? "").trim().slice(0, 500) ||
      fallbackSanitizationReason;
    const attachmentSummary = Array.isArray(parsed.attachmentSummary)
      ? (parsed.attachmentSummary as unknown[])
          .map((item, index) => {
            const current = item as Record<string, unknown>;
            return {
              fileName: String(current.fileName ?? payload.attachments[index]?.fileName ?? `attachment-${index + 1}`),
              mimeType: String(current.mimeType ?? payload.attachments[index]?.mimeType ?? "application/octet-stream"),
              sizeBytes: Number(current.sizeBytes ?? payload.attachments[index]?.sizeBytes ?? 0),
              summary: String(current.summary ?? "").trim() || "Sem resumo de conteúdo disponível.",
              riskHints: toStringArray(current.riskHints),
              confidence: ["HIGH", "MEDIUM", "LOW"].includes(String(current.confidence).toUpperCase())
                ? (String(current.confidence).toUpperCase() as "LOW" | "MEDIUM" | "HIGH")
                : "LOW",
            } satisfies AttachmentIntelSummary;
          })
          .slice(0, payload.attachments.length || 50)
      : fallbackAttachmentSummary;

    const promptTokens = completion.usage?.prompt_tokens ?? fallbackPromptTokens;
    const completionTokens = completion.usage?.completion_tokens ?? fallbackCompletionTokens;
    const totalTokens = completion.usage?.total_tokens ?? promptTokens + completionTokens;

    return {
      schemaVersion: "1.0.0",
      sanitizedNarrative,
      narrativeForCouncil,
      sanitizationMode: aiMode,
      sanitizationReason,
      aiCategory,
      risk,
      conflictSignals,
      autoBlockedUserNames,
      recommendedCouncilBrief,
      attachmentSummary,
      provider: "openrouter",
      model: openrouterModel,
      fallbackUsed: false,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: estimateCostUsd(totalTokens),
      },
    };
  } catch {
    return {
      schemaVersion: "1.0.0",
      sanitizedNarrative: fallbackSanitized,
      narrativeForCouncil: fallbackSanitized,
      sanitizationMode: fallbackMode,
      sanitizationReason: fallbackSanitizationReason,
      aiCategory: fallbackCategory,
      risk: fallbackRisk,
      conflictSignals: fallbackConflictSignals,
      autoBlockedUserNames: [],
      recommendedCouncilBrief: fallbackBrief,
      attachmentSummary: fallbackAttachmentSummary,
      provider: "fallback",
      model: "regex-fallback",
      fallbackUsed: true,
      usage: {
        promptTokens: fallbackPromptTokens,
        completionTokens: fallbackCompletionTokens,
        totalTokens: fallbackTotal,
        estimatedCostUsd: estimateCostUsd(fallbackTotal),
      },
    };
  }
}
