# Follow-up de participantes — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Config e query de pendentes | pending | medium | task_01 |
| 02 | Estágio outbox de follow-up | pending | high | — |

## Executar

```bash
compozy tasks validate --name epic-participant-followup
./scripts/run-workflow epic-participant-followup --dry-run
./scripts/run-workflow epic-participant-followup --stream
```
