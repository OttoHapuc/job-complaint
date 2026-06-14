# TechSpec — Hardening de produção

## Escopo técnico
Implementar apenas o módulo `epic-production-hardening` conforme histórias deste diretório.

## Dependências
- epic-outbox-cron
- epic-sla-dashboard
- epic-abandonment-committee
- epic-participant-followup
- epic-implicated-registry

## Arquivos prováveis
- Consultar cada `task_*.md` → seção Implementation Details durante execução.
- Seguir convenções existentes em `src/` e `docs/OPERATIONS.md`.

## Testes
- Unit/integration conforme cada task.
- `npm run build` e `npm run ops:smoke` ao final do épico.

## Perguntas abertas
Ver `.compozy/WORKFLOWS.md` → tabela do épico `epic-production-hardening`.
