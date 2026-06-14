---
status: completed
title: Métricas outbox em ops/status
type: backend
complexity: medium
dependencies:
  - task_01
---

# Task 02: Métricas outbox em ops/status

## Overview
Expor saúde da fila outbox em `GET /api/ops/status` para operação e alertas manuais.

<requirements>
- MUST retornar `outbox.pending`, `outbox.failed`, `outbox.dead` como números.
- MUST marcar status `degraded` quando `failed > 0` ou `dead > 0`.
- MUST manter compatibilidade com campos existentes de status.
</requirements>

## Subtasks
- [x] 2.1 Consultar contagens via Prisma em `ops/status`
- [x] 2.2 Atualizar `scripts/ops-smoke.mjs` para assert dos campos
- [x] 2.3 Validar com `npm run ops:smoke`

### Relevant Files
- `src/app/api/ops/status/route.ts`
- `scripts/ops-smoke.mjs`

## Success Criteria
- Smoke passa com novos campos outbox presentes
