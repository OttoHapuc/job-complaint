const ACTION_DICTIONARY: Record<string, string> = {
  // Intake / AI review
  AI_INJECTION_GUARD_EXECUTED: "Validação anti-injeção executada pelo agente de IA.",
  AI_INJECTION_GUARD_FLAGGED: "Validação anti-injeção sinalizou risco para revisão.",
  AI_ATTACHMENT_ANALYSIS_COMPLETED: "Leitura técnica dos anexos concluída pela IA.",
  AI_TRIAGE_COMPLETED: "Triagem inicial da denúncia concluída pela IA.",
  AI_SCHEMA_VALIDATION_FALLBACK: "Resposta da IA inválida; fallback seguro aplicado.",
  AI_REVIEW_ITERATION_COMPLETED: "Iteração de revisão por IA concluída.",

  // Case lifecycle
  CASE_CRITICAL_INTAKE_ROUTED: "Caso marcado como crítico para tratamento prioritário.",
  CASE_WORKFLOW_UPDATED: "Fluxo do caso atualizado por membro do conselho.",
  CASE_PRE_CONCLUSION_PACKAGE_PUBLISHED:
    "Pacote formal de pre-conclusão foi gerado para deliberação.",
  CASE_PRE_CONCLUSION_PUBLISHED_TO_COMMITTEE:
    "Pre-conclusão publicada e enviada para votação do comitê.",
  CASE_COMMITTEE_VOTE_RECORDED: "Voto de comitê registrado.",
  CASE_RESOLVED_BY_COMMITTEE_CONSENSUS: "Caso encerrado por consenso do comitê.",
  CASE_RETURNED_TO_INVESTIGATION_BY_COMMITTEE_REJECTION:
    "Caso retornou para investigação após rejeição do comitê.",
  CASE_ACCESS_RESTRICTION_UPDATED:
    "Restrições de acesso do caso foram atualizadas por conflito identificado.",
  CASE_IMPLICATED_PERSON_ADDED:
    "Pessoa implicada foi registrada no caso para investigação.",
  CASE_IMPLICATED_PERSON_REINFORCED:
    "Pessoa implicada teve recorrência reforçada durante novas interações.",
  CASE_ABANDONMENT_THRESHOLD_REACHED:
    "Caso atingiu janela de abandono sem resposta e foi encaminhado para pre-conclusão.",
  CASE_ABANDONMENT_CONFIRMED_BY_COMMITTEE:
    "Conselho confirmou o encaminhamento por abandono e publicou para votação.",

  // Participants
  CASE_PARTICIPANT_INVITED: "Pessoa envolvida/corroboradora foi convidada.",
  CASE_PARTICIPANT_QUESTIONNAIRE_CREATED: "Questionário inicial do participante foi gerado.",
  CASE_PARTICIPANT_INVITE_ACCEPTED: "Participante externo aceitou o convite individual.",
  CASE_PARTICIPANT_RESPONSE_SUBMITTED: "Resposta de participante externo registrada no processo.",
  CASE_PARTICIPANT_FOLLOWUP_SENT: "Lembrete automático enviado a participante sem resposta.",
  CASE_PARTICIPANT_FOLLOWUP_EXHAUSTED:
    "Participante atingiu limite de lembretes automáticos sem responder.",
  CASE_SLA_ALERT_NOTIFIED: "Alerta de SLA enviado ao conselho por e-mail.",

  // Report/portal interaction
  REPORT_ATTACHMENTS_DECLARED: "Anexos declarados e registrados no processo.",
  REPORT_CONTACT_PROVIDED: "Denunciante forneceu contato para notificações.",
  REPORT_CONTACT_DECLINED: "Denunciante optou por não informar contato.",
  REPORT_SUBMITTED: "Denúncia registrada no sistema.",
  PIPELINE_STAGE_STORE_RAW_COMPLETED: "Esteira: armazenamento bruto concluído.",
  PIPELINE_STAGE_EVALUATION_COMPLETED: "Esteira: avaliação estruturada da denúncia concluída.",
  PIPELINE_STAGE_NOTIFICATIONS_COMPLETED: "Esteira: notificações concluídas.",
  PIPELINE_STAGE_COMMUNICATION_INITIALIZED:
    "Esteira: comunicação inicial com denunciante iniciada.",
  PIPELINE_STAGE_ENGAGEMENT_TICK_EXECUTED:
    "Esteira: atualização planejada de acompanhamento executada.",
  WHISTLEBLOWER_PORTAL_ACCESSED: "Portal do denunciante acessado com token válido.",
  WHISTLEBLOWER_MESSAGE_SENT: "Denunciante enviou nova mensagem no acompanhamento.",

  // Auth / ops / tenant admin
  AUTH_LOGIN: "Autenticação de usuário realizada.",
  AUTH_LOGOUT: "Sessão do usuário encerrada.",
  TENANT_ONBOARDED_SELF_SERVICE: "Tenant criado via onboarding self-service.",
  TENANT_PLAN_UPDATED: "Plano do tenant atualizado.",
  TENANT_MEMBER_CREATED: "Membro do tenant adicionado.",
  TENANT_MEMBER_UPDATED: "Membro do tenant atualizado.",
  TENANT_MEMBER_PASSWORD_RESET: "Senha do membro redefinida pela conta corporativa.",
  AUTH_PASSWORD_CHANGED: "Senha da conta alterada pelo usuário.",
  DASHBOARD_VIEWED: "Painel de casos consultado.",
  DATA_SUBJECT_REQUEST_OPENED: "Solicitação de direito LGPD aberta.",
  DATA_SUBJECT_REQUEST_STATUS_UPDATED: "Status de solicitação LGPD atualizado.",
  PRIVACY_RETENTION_APPLIED: "Rotina de retenção/anonimização aplicada.",
  AUDIT_CHAIN_REBASELINED: "Rebaseline forense da cadeia de auditoria aplicado.",
};

export function describeAuditAction(action: string) {
  return ACTION_DICTIONARY[action] ?? `Evento registrado: ${action}.`;
}

export function resolveAuditActorLabel(input: {
  actorUserName?: string | null;
  actorUserEmail?: string | null;
  action: string;
}) {
  if (input.actorUserName) return input.actorUserName;
  if (input.actorUserEmail) return input.actorUserEmail;
  if (input.action.startsWith("WHISTLEBLOWER_")) return "Denunciante";
  if (input.action.startsWith("CASE_PARTICIPANT_")) return "Participante externo";
  if (input.action.startsWith("PIPELINE_")) return "Esteira de Investigação";
  if (input.action.startsWith("AI_")) return "Agente de IA";
  return "Sistema";
}

