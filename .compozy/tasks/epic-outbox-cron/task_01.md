---
status: completed
title: Script cron com secret
type: infra
complexity: medium
dependencies: []
---

# Task 01: Script cron com secret

## Overview
Criar mecanismo reproduzível (script + documentação) que invoca `POST /api/internal/outbox/process` com autenticação via `OUTBOX_PROCESSOR_SECRET`.

<requirements>
- MUST existir `scripts/outbox-cron.sh` executável.
- MUST enviar header `x-outbox-secret` a partir de variável de ambiente.
- MUST aceitar `APP_BASE_URL` configurável (default `http://localhost:3000`).
- SHOULD suportar intervalo via loop ou instrução para cron do SO.
</requirements>

## Subtasks
- [x] 1.1 Implementar script shell com curl e tratamento de erro HTTP
- [x] 1.2 Adicionar variáveis em `.env.example`
- [x] 1.3 Testar localmente contra `npm run dev`

### Relevant Files
- `scripts/outbox-cron.sh` (novo)
- `src/app/api/internal/outbox/process/route.ts`
- `.env.example`

## Success Criteria
- Script retorna exit 0 quando outbox processa com sucesso
