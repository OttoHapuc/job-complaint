export const WHISTLEBLOWER_LABELS = {
  investigationAgent: {
    name: "Agente de Investigação",
    chatTitle: "Chat Anônimo com o Agente de Investigação",
    anonymityNotice:
      "Suas respostas são anônimas. O Agente de Investigação não tem acesso à sua identidade.",
    pendingQuestionPrefix: "Pergunta pendente",
    replyPlaceholder: "Responda ao Agente de Investigação anonimamente...",
    waitingPlaceholder:
      "Aguardando nova pergunta do Agente de Investigação...",
  },
  timeline: {
    reportSubmitted: {
      title: "Realização da denúncia",
      description: "Sua denúncia foi entregue e registrada no sistema.",
    },
    review: {
      title: "Etapa de revisão",
      description:
        "O Agente de Investigação está revisando consistência do relato e organizando evidências.",
    },
    investigation: {
      title: "Etapa de investigação",
      description:
        "O Agente de Investigação está coletando respostas de pessoas vinculadas e aprofundando a análise.",
    },
    preConclusion: {
      title: "Pre-conclusões",
      description:
        "O Agente de Investigação está consolidando análises para apoiar deliberação do conselho.",
    },
    conclusion: {
      title: "Conclusões",
      description:
        "Resumo final disponível para sua confirmação quando o caso for concluído.",
    },
  },
} as const;

export function whistleblowerMessageAuthorLabel(input: {
  authorType: "WHISTLEBLOWER" | "SYSTEM" | "COUNCIL";
}) {
  if (input.authorType === "WHISTLEBLOWER") return "Você (Anônimo)";
  if (input.authorType === "SYSTEM") return WHISTLEBLOWER_LABELS.investigationAgent.name;
  return "Conselho";
}

