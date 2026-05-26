import type { RiskLevel } from "@prisma/client";

type MemberLite = {
  id: string;
  name: string;
  companyRole: string;
};

type BuildContextInput = {
  narrative: string;
  category: string;
  risk: RiskLevel;
  blockedUserIds: string[];
  members: MemberLite[];
  witnessEmails: string[];
};

type QuestionPlan = {
  target: "WHISTLEBLOWER" | "WITNESS";
  question: string;
  reason: string;
};

export type InvestigationOrchestrationOutput = {
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  summary: {
    confidence: "LOW" | "MEDIUM" | "HIGH";
    inferredEntities: string[];
    recommendedNextStep: string;
  };
  questionPlan: QuestionPlan[];
};

function inferEntities(narrative: string) {
  const entities = new Set<string>();
  const lower = narrative.toLowerCase();
  if (lower.includes("gestor") || lower.includes("líder") || lower.includes("lider")) {
    entities.add("manager");
  }
  if (lower.includes("rh") || lower.includes("recursos humanos")) {
    entities.add("hr");
  }
  if (lower.includes("diretor") || lower.includes("diretoria")) {
    entities.add("board");
  }
  if (lower.includes("ameaça") || lower.includes("coação")) {
    entities.add("coercion");
  }
  if (lower.includes("fraude") || lower.includes("desvio")) {
    entities.add("fraud");
  }
  return Array.from(entities);
}

function buildQuestionPlan(input: BuildContextInput): QuestionPlan[] {
  const base: QuestionPlan[] = [
    {
      target: "WHISTLEBLOWER",
      question: "Qual foi a data aproximada do fato mais recente e quem estava presente?",
      reason: "Consolidar linha temporal mínima da investigação.",
    },
    {
      target: "WHISTLEBLOWER",
      question: "Existem evidências adicionais (documentos, prints, mensagens) que possam ser enviadas?",
      reason: "Aumentar confiabilidade probatória.",
    },
  ];
  if (input.witnessEmails.length > 0) {
    base.push({
      target: "WITNESS",
      question: "Você confirma o contexto informado e pode descrever fatos observados diretamente?",
      reason: "Coletar corroboracao independente.",
    });
  }
  if (input.risk === "CRITICAL") {
    base.push({
      target: "WHISTLEBLOWER",
      question: "Há risco imediato para integridade física, financeira ou jurídica que exija medida emergencial?",
      reason: "Avaliar ação de contenção imediata.",
    });
  }
  return base;
}

function selectAssignee(members: MemberLite[], blockedUserIds: string[]) {
  const ordered = [...members].sort((a, b) => a.name.localeCompare(b.name));
  return ordered.find((member) => !blockedUserIds.includes(member.id)) ?? null;
}

export function runInvestigationOrchestrator(
  input: BuildContextInput,
): InvestigationOrchestrationOutput {
  const inferredEntities = inferEntities(input.narrative);
  const assignee = selectAssignee(input.members, input.blockedUserIds);
  const questionPlan = buildQuestionPlan(input);
  const confidence =
    input.risk === "CRITICAL" || inferredEntities.length >= 3
      ? "HIGH"
      : inferredEntities.length >= 1
        ? "MEDIUM"
        : "LOW";

  return {
    suggestedAssigneeId: assignee?.id ?? null,
    suggestedAssigneeName: assignee?.name ?? null,
    summary: {
      confidence,
      inferredEntities,
      recommendedNextStep:
        questionPlan.length > 0
          ? "Disparar perguntas estruturadas e consolidar evidências antes da deliberação do comitê."
          : "Sem perguntas pendentes. Encaminhar para revisão do comitê.",
    },
    questionPlan,
  };
}
