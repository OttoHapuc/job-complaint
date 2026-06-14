# Catálogo de E-mails — JobComplaint

Todos os envios passam por `sendMail()` → validação (`verify.ts`) → provedor (`ses` ou `cloudflare`).

**Desenvolvimento:** com `NODE_ENV !== production`, `sendMail()` não chama o provedor — apenas registra `mail.send.simulated` no log e retorna `delivered: true` com `provider: dev-simulated`.

Templates visuais: `src/lib/mail/templates.ts`  
Funções de negócio: `src/lib/notifications.ts`

## Resumo

| # | Template | Função | Acionado em | Destinatário | Tag SES |
|---|----------|--------|-------------|--------------|---------|
| 1 | Convite de participante | `sendInviteNotification` | Esteira `NOTIFY_CONTACTS` | Testemunha/corroborador | `invite` |
| 2 | Lembrete de convite | `sendParticipantFollowupReminderNotification` | Esteira `PARTICIPANT_FOLLOWUP` | Participante sem resposta | `participant-followup` |
| 3 | Caso crítico | `sendCriticalCaseNotification` | Esteira `NOTIFY_CONTACTS` (CRITICAL) | Conselho | `critical-case` |
| 4 | Boas-vindas membro | `sendMemberWelcomeNotification` | `POST /api/settings/members` | Membro profissional | `member-welcome` |
| 5 | Redefinição de senha | `sendMemberPasswordResetNotification` | reset-password API | Membro | `member-password-reset` |
| 6 | Onboarding | `sendOnboardingWelcomeNotification` | `POST /api/saas/onboarding` | Admin onboarding | `onboarding-welcome` |
| 7 | Confirmação denúncia | `sendWhistleblowerReportConfirmationNotification` | `POST /api/reports` | Denunciante (e-mail) | `whistleblower-confirmation` |
| 8 | Nova pergunta | `sendWhistleblowerNewQuestionNotification` | Comunicação / revisão IA | Denunciante | `whistleblower-question` |
| 9 | Lembrete denunciante | `sendWhistleblowerEngagementReminderNotification` | `ENGAGEMENT_TICK` | Denunciante | `whistleblower-reminder` |
| 10 | Abandono denunciante | `sendWhistleblowerAbandonmentNotification` | `ENGAGEMENT_TICK` (limiar) | Denunciante | `whistleblower-abandonment` |
| 11 | Convite aceito | `sendParticipantInviteAcceptedNotification` | `POST /api/invites/[token]` | Participante | `participant-accepted` |
| 12 | Resposta registrada | `sendParticipantResponseReceivedNotification` | `POST /api/invites/.../response` | Participante | `participant-response` |
| 13 | Pre-conclusão pronta | `sendCommitteePreConclusionReadyNotification` | `PREPARE_PRE_CONCLUSION` | Conselho | `committee-pre-conclusion-ready` |
| 14 | Votação aberta | `sendCommitteeVoteRequiredNotification` | Publicar pre-conclusão / confirmar abandono | Conselho | `committee-vote-required` |
| 15 | Abandono pendente | `sendCommitteeAbandonmentPendingNotification` | `ENGAGEMENT_TICK` (limiar) | Conselho | `committee-abandonment-pending` |
| 16 | Follow-up esgotado | `sendCommitteeParticipantFollowupExhaustedNotification` | `PARTICIPANT_FOLLOWUP` | Conselho | `committee-participant-exhausted` |
| 17 | SLA vence hoje | `sendCommitteeSlaAlertNotification` | `POST /api/internal/ops/sla-notify` | Conselho | `committee-sla-due-today` |
| 18 | SLA estourado | `sendCommitteeSlaAlertNotification` | `POST /api/internal/ops/sla-notify` | Conselho | `committee-sla-overdue` |
| 19 | Caso devolvido | `sendCommitteeCaseReturnedNotification` | Voto REJECT do comitê | Conselho | `committee-case-returned` |
| 20 | Pre-conclusão (denunciante) | `sendWhistleblowerPreConclusionNotification` | `PREPARE_PRE_CONCLUSION` | Denunciante | `whistleblower-pre-conclusion` |
| 21 | Caso encerrado | `sendWhistleblowerCaseResolvedNotification` | Consenso do comitê | Denunciante | `whistleblower-resolved` |

## Operação SLA

- Endpoint interno: `POST /api/internal/ops/sla-notify` (mesmo secret da outbox)
- Chamado automaticamente por `scripts/outbox-cron.sh` após processar a fila
- Deduplicação: no máximo 1 alerta por tipo (`overdue` / `due_today`) por caso por dia (`CASE_SLA_ALERT_NOTIFIED`)

## Canais não implementados

- WhatsApp / SMS para denunciante ou participante com contato telefônico

## Design

- Cabeçalho escuro JobComplaint + selo LGPD
- Eyebrow monoespaçado em caixa alta
- Tabela de metadados e caixas de aviso
- CTA escuro e rodapé de auditoria
