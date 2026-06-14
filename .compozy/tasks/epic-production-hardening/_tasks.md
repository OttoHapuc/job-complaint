# Hardening de produção — Task List

## Tasks

| # | Title | Status | Complexity | Dependencies |
|---|-------|--------|------------|--------------|
| 01 | Guard rotas dev | pending | medium | task_01 |
| 02 | Smoke E2E expandido | pending | high | task_02 |
| 03 | Checklist go-live | pending | low | — |

## Executar

```bash
compozy tasks validate --name epic-production-hardening
./scripts/run-workflow epic-production-hardening --dry-run
./scripts/run-workflow epic-production-hardening --stream
```
