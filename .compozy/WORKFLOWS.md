# Mapa de Workflows — JobComplaint

Cada pasta em `.compozy/tasks/<slug>/` é um **épico** (módulo) com PRD próprio e histórias atomizadas (`task_01.md`, …).

## Legenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Entregue (`status: completed`) — documentação retroativa |
| 🔲 | Pendente — executar via Compozy |

## Épicos entregues (referência)

| Slug | Módulo | Tasks |
|------|--------|-------|
| ✅ `epic-tenant-auth` | Multi-tenant, auth, permissões, onboarding | 2 |
| ✅ `epic-audit-forensics` | Trilha imutável + verificação forense | 2 |
| ✅ `epic-lgpd-legal` | Telas legais + direitos do titular | 2 |
| ✅ `epic-intake-outbox` | Intake assíncrono + transactional outbox | 2 |
| ✅ `epic-ai-pipeline` | Guard, triagem, sanitização contextual | 2 |
| ✅ `epic-whistleblower-portal` | Portal `/acompanhar` + revisão iterativa | 2 |
| ✅ `epic-participant-invites` | Convites externos + criptografia | 2 |
| ✅ `epic-committee-preconclusion` | Pre-conclusão + voto do comitê | 2 |
| ✅ `epic-implicated-persons` | Pessoas implicadas + recorrência | 2 |
| ✅ `epic-abandonment-auto` | Abandono automático + UI filtros | 2 |

## Épicos pendentes (executar nesta ordem)

| Ordem | Slug | Módulo | Depende de |
|-------|------|--------|------------|
| ✅ | `epic-outbox-cron` | Cron contínuo + métricas de fila | — |
| ✅ | `epic-sla-dashboard` | Cards SLA no dashboard | `epic-outbox-cron` |
| ✅ | `epic-abandonment-committee` | Confirmação de abandono pelo conselho | — |
| ✅ | `epic-participant-followup` | Follow-up de participantes sem resposta | `epic-outbox-cron` |
| ✅ | `epic-implicated-registry` | Página `/dashboard/implicados` | — |
| ✅ | `epic-production-hardening` | Go-live: dev routes + smoke E2E | todos acima |

## Épicos de arquitetura (entregues)

| Slug | Módulo | Depende de |
|------|--------|------------|
| ✅ `epic-mail-providers` | E-mail abstrato: **Amazon SES** e **Cloudflare Email** (`MAIL_PROVIDER`) | — |
| ✅ `epic-field-crypto` | Criptografia unificada (`DB_FIELD_ENCRYPTION` / `NODE_ENV`) | — |
| ✅ `epic-complaint-lifecycle` | Mapa ponta a ponta (`docs/COMPLAINT-LIFECYCLE.md`) | — |
| ✅ `epic-pipeline-autonomy` | Estagnação + `GET /api/ops/pipeline/stagnation` | `epic-complaint-lifecycle` |

## Comandos para você interagir

Sempre a partir de `job-complaint/`:

```bash
# 1) Validar um épico antes de executar
compozy tasks validate --name epic-outbox-cron

# 2) Ver runtime resolvido (sem executar — não chama compozy)
./scripts/run-workflow epic-outbox-cron --dry-run

# 3) Executar um épico — cursor-agent via ACP pode travar em --stream;
#    prefira TUI ou execução no chat (/cy-execute-task)
./scripts/run-workflow epic-outbox-cron --stream
# alternativa TUI:
compozy tasks run epic-outbox-cron --ide cursor-agent

# 4) Sincronizar catálogo no daemon
compozy sync --name epic-outbox-cron

# 5) Arquivar épico concluído
compozy archive --name epic-outbox-cron
```

### Troubleshooting: `Authentication required` (Codex)

Se `./scripts/run-workflow` falhar com `ACP error -32000: Authentication required`, o runtime estava em `codex` sem login. Este workspace usa **`cursor-agent`** (sessão ACP do Cursor aberto). Rode do terminal integrado do Cursor com a janela do projeto aberta.

Para forçar outro runtime:

```bash
./scripts/run-workflow epic-outbox-cron --ide cursor-agent --stream
# ou, se tiver Codex autenticado:
./scripts/run-workflow epic-outbox-cron --ide codex --stream
```

Alternativa sem `compozy tasks run`: abra `task_01.md` no chat e use `/cy-execute-task`.

### Execução via chat (recomendado quando ACP trava)

Os 6 épicos pendentes foram implementados diretamente no código. Para novos épicos, use `/cy-execute-task` no chat em vez de `compozy tasks run` se o `cursor-agent` não responder.

Para arquivar épicos concluídos:

```bash
for epic in epic-outbox-cron epic-sla-dashboard epic-abandonment-committee \
  epic-participant-followup epic-implicated-registry epic-production-hardening \
  epic-mail-providers epic-field-crypto epic-complaint-lifecycle epic-pipeline-autonomy; do
  compozy archive --name "$epic"
done
```

### No Cursor (interação com dúvidas por épico)

1. Abra `.compozy/tasks/<slug>/_prd.md` e leia o escopo.
2. Use `/cy-create-techspec` se quiser refinar antes de executar.
3. Execute uma história: `./scripts/run-workflow <slug> --stream` (ou task isolada via prompt com `task_01.md`).
4. Use `/cy-review-round` após o épico.
5. `compozy archive --name <slug>` quando aprovado.

## Perguntas abertas por épico (sanar antes/durante execução)

| Épico | Pergunta |
|-------|----------|
| `epic-outbox-cron` | Intervalo do cron: 1 min ou 5 min em produção? |
| `epic-sla-dashboard` | SLA exibido: first response, resolução ou ambos? |
| `epic-abandonment-committee` | Confirmação exige comentário obrigatório? |
| `epic-participant-followup` | Reenviar mesmo token ou gerar novo convite? |
| `epic-implicated-registry` | Corporate account pode ver implicados? |
| `epic-production-hardening` | Manter rota dev com `ALLOW_DEV_ROUTES` em staging? |
| `epic-mail-providers` | Produção: `ses` ou `cloudflare`? Domínio verificado em ambos? |
| `epic-field-crypto` | Ativar `DB_FIELD_ENCRYPTION=true` só em produção? |
| `epic-pipeline-autonomy` | Cron dedicado para re-enfileirar ações de estagnação? |
