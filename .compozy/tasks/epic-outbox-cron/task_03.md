---
status: completed
title: Documentar operação do cron
type: docs
complexity: low
dependencies:
  - task_02
---

# Task 03: Documentar operação do cron

## Overview
Documentar no runbook como operar o cron da outbox em dev e produção.

<requirements>
- MUST atualizar `docs/OPERATIONS.md` com seção dedicada à outbox.
- MUST documentar troubleshooting (fila crescendo, secret inválido).
- SHOULD incluir exemplo docker-compose sidecar opcional.
</requirements>

## Subtasks
- [x] 3.1 Seção "Processamento contínuo da outbox" em OPERATIONS.md
- [x] 3.2 Referência cruzada em `COMPOZY.md` / `WORKFLOWS.md`

### Relevant Files
- `docs/OPERATIONS.md`

## Success Criteria
- Operador consegue configurar cron só lendo o runbook
