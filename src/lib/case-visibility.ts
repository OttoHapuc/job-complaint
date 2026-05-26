const INITIAL_ANALYSIS_DAYS = 7;

export function isCaseInInitialAnalysisWindow(params: {
  createdAt: Date;
  reviewConcludedAt: Date | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const lockEndsAt = new Date(
    params.createdAt.getTime() + INITIAL_ANALYSIS_DAYS * 24 * 60 * 60 * 1000,
  );

  // Mantem sigilo enquanto não existir marco de conclusão da revisão iterativa.
  if (!params.reviewConcludedAt) return true;
  return now.getTime() < lockEndsAt.getTime();
}

export function initialAnalysisStatusLabel() {
  return "Processo iniciado, em prazo para análise";
}

