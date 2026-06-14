import { PipelineAction, type CaseStatus, type PipelineStage } from "@prisma/client";

/** Terminal states — no further autonomous progression expected. */
export const TERMINAL_CASE_STATUSES: CaseStatus[] = ["RESOLVED"];

/** Outcomes of a complaint lifecycle (business semantics). */
export type ComplaintOutcome =
  | "IN_PROGRESS"
  | "RESOLVED_BY_COMMITTEE"
  | "RETURNED_TO_INVESTIGATION"
  | "ABANDONED_BY_SILENCE"
  | "ABANDONED_CONFIRMED_AWAITING_VOTE"
  | "STALLED";

export type StagnationSignal =
  | "OUTBOX_PENDING_AGED"
  | "OUTBOX_FAILED"
  | "OUTBOX_DEAD"
  | "WHISTLEBLOWER_SILENT"
  | "PARTICIPANT_UNRESPONSIVE"
  | "ENGAGEMENT_STEP_OVERDUE"
  | "COMMITTEE_VOTE_PENDING"
  | "PRE_CONCLUSION_READY_UNPUBLISHED";

export type StagnationAssessment = {
  signal: StagnationSignal;
  severity: "info" | "warning" | "critical";
  description: string;
  suggestedAction: PipelineAction | "MANUAL_REVIEW" | "NONE";
};

export type PipelineSnapshot = {
  caseId: string;
  status: CaseStatus;
  currentStage: PipelineStage | null;
  pendingQuestion: boolean;
  lastOutboundAt: Date | null;
  nextContactAt: Date | null;
  reviewConcludedAt: Date | null;
  readyForCommitteeAt: Date | null;
  abandonedBySilence: boolean;
  abandonmentConfirmed: boolean;
  outboxPending: number;
  outboxFailed: number;
  outboxDead: number;
  pendingParticipants: number;
  overdueEngagementSteps: number;
  committeeVotesMissing: number;
};

const OUTBOX_STALE_MS = 30 * 60 * 1000;

export function classifyComplaintOutcome(snapshot: PipelineSnapshot): ComplaintOutcome {
  if (snapshot.status === "RESOLVED") return "RESOLVED_BY_COMMITTEE";
  if (snapshot.status === "IN_REVIEW" && snapshot.abandonedBySilence && !snapshot.abandonmentConfirmed) {
    return "ABANDONED_BY_SILENCE";
  }
  if (snapshot.status === "AWAITING_COMMITTEE_APPROVAL" && snapshot.abandonedBySilence) {
    return snapshot.abandonmentConfirmed
      ? "ABANDONED_CONFIRMED_AWAITING_VOTE"
      : "ABANDONED_BY_SILENCE";
  }
  if (TERMINAL_CASE_STATUSES.includes(snapshot.status)) {
    return "RESOLVED_BY_COMMITTEE";
  }
  return "IN_PROGRESS";
}

/** Detect stagnation and suggest autonomous or manual next moves. */
export function assessStagnation(snapshot: PipelineSnapshot, now = new Date()): StagnationAssessment[] {
  const findings: StagnationAssessment[] = [];

  if (snapshot.outboxDead > 0) {
    findings.push({
      signal: "OUTBOX_DEAD",
      severity: "critical",
      description: "Mensagens outbox em estado DEAD exigem intervenção operacional.",
      suggestedAction: "MANUAL_REVIEW",
    });
  }

  if (snapshot.outboxFailed > 0) {
    findings.push({
      signal: "OUTBOX_FAILED",
      severity: "warning",
      description: "Falhas na fila outbox; o cron deve reprocessar ou escalar tentativas.",
      suggestedAction: PipelineAction.ENGAGEMENT_TICK,
    });
  }

  if (snapshot.outboxPending > 0 && snapshot.lastOutboundAt) {
    const age = now.getTime() - snapshot.lastOutboundAt.getTime();
    if (age > OUTBOX_STALE_MS) {
      findings.push({
        signal: "OUTBOX_PENDING_AGED",
        severity: "warning",
        description: "Há ações outbox pendentes sem processamento recente.",
        suggestedAction: PipelineAction.ENGAGEMENT_TICK,
      });
    }
  }

  if (snapshot.pendingQuestion && snapshot.nextContactAt && snapshot.nextContactAt <= now) {
    findings.push({
      signal: "WHISTLEBLOWER_SILENT",
      severity: "info",
      description: "Pergunta pendente e janela de contato vencida; tick de engajamento deve avançar.",
      suggestedAction: PipelineAction.ENGAGEMENT_TICK,
    });
  }

  if (snapshot.pendingParticipants > 0) {
    findings.push({
      signal: "PARTICIPANT_UNRESPONSIVE",
      severity: "info",
      description: "Participantes convidados sem resposta; follow-up automático deve atuar.",
      suggestedAction: PipelineAction.PARTICIPANT_FOLLOWUP,
    });
  }

  if (snapshot.overdueEngagementSteps > 0) {
    findings.push({
      signal: "ENGAGEMENT_STEP_OVERDUE",
      severity: "warning",
      description: "Etapas do plano adaptativo passaram do horário agendado.",
      suggestedAction: PipelineAction.ENGAGEMENT_TICK,
    });
  }

  if (snapshot.readyForCommitteeAt && snapshot.status !== "AWAITING_COMMITTEE_APPROVAL" && snapshot.status !== "RESOLVED") {
    findings.push({
      signal: "PRE_CONCLUSION_READY_UNPUBLISHED",
      severity: "info",
      description: "Pre-conclusão pronta mas ainda não publicada ao comitê.",
      suggestedAction: "MANUAL_REVIEW",
    });
  }

  if (snapshot.status === "AWAITING_COMMITTEE_APPROVAL" && snapshot.committeeVotesMissing > 0) {
    findings.push({
      signal: "COMMITTEE_VOTE_PENDING",
      severity: "info",
      description: "Aguardando votos do comitê para encerrar ou devolver investigação.",
      suggestedAction: "MANUAL_REVIEW",
    });
  }

  if (findings.length === 0 && snapshot.status !== "RESOLVED") {
    return findings;
  }

  return findings;
}

export function isAutonomousAction(action: PipelineAction | "MANUAL_REVIEW" | "NONE") {
  return action !== "MANUAL_REVIEW" && action !== "NONE";
}
