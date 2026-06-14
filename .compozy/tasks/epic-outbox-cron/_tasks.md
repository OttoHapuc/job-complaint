# Cron contínuo da outbox — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Script cron com secret | pending | medium | task_01 |
| 02 | Métricas outbox em ops/status | pending | medium | task_02 |
| 03 | Documentar operação do cron | pending | low | — |

## Executar

```bash
compozy tasks validate --name epic-outbox-cron
./scripts/run-workflow epic-outbox-cron --dry-run
./scripts/run-workflow epic-outbox-cron --stream
```
