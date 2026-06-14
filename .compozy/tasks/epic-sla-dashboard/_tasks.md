# Dashboard SLA — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | API métricas SLA agregadas | pending | medium | task_01 |
| 02 | Cards SLA na visão geral | pending | medium | task_02 |
| 03 | Testes de contagem SLA | pending | low | — |

## Executar

```bash
compozy tasks validate --name epic-sla-dashboard
./scripts/run-workflow epic-sla-dashboard --dry-run
./scripts/run-workflow epic-sla-dashboard --stream
```
