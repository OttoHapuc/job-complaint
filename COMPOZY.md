# Compozy — job-complaint

Abra **esta pasta** (`job-complaint/`) no Cursor.

## Modelo: 1 épico = 1 módulo = 1 workflow

Cada pasta em `.compozy/tasks/epic-<modulo>/` contém:

- `_prd.md` — escopo do módulo (perguntas sanadas aqui)
- `_techspec.md` — desenho técnico (épicos pendentes)
- `task_01.md` … — histórias atomizadas

**Índice completo:** [`.compozy/WORKFLOWS.md`](.compozy/WORKFLOWS.md)

## Épicos pendentes (ordem sugerida)

1. `epic-outbox-cron`
2. `epic-sla-dashboard`
3. `epic-abandonment-committee`
4. `epic-participant-followup`
5. `epic-implicated-registry`
6. `epic-production-hardening`

## Comandos (você executa)

```bash
cd /home/otto/Documentos/APUS/job-complaint

# Validar épico
compozy tasks validate --name epic-outbox-cron

# Ver runtime (dry-run)
./scripts/run-workflow epic-outbox-cron --dry-run

# Executar épico
./scripts/run-workflow epic-outbox-cron --stream

# Sincronizar daemon
compozy sync --name epic-outbox-cron

# Arquivar quando concluído
compozy archive --name epic-outbox-cron
```

## Interação no Cursor (com dúvidas)

1. Leia `.compozy/tasks/<slug>/_prd.md`
2. Sanitize dúvidas da tabela em `WORKFLOWS.md`
3. Opcional: `/cy-create-techspec` para refinar
4. Execute: `./scripts/run-workflow <slug> --stream`
5. Revise: `/cy-review-round`
6. Arquivar: `compozy archive --name <slug>`

## Setup hub (uma vez)

```bash
cd /home/otto/Documentos/APUS && compozy setup --yes
compozy workspaces register /home/otto/Documentos/APUS/job-complaint --name job-complaint
```

## Runtime

- `.compozy/runtime-by-complexity.toml` — usado por `scripts/run-workflow` (padrão: **cursor-agent**)
- `auto_commit = false` em `config.toml`

### Erro `Authentication required`

O runtime antigo usava `codex`, que exige login ACP separado. O workspace foi ajustado para `cursor-agent`. Execute do **terminal integrado do Cursor** com o projeto aberto. Se preferir Codex: instale/autentique o CLI e use `./scripts/run-workflow <slug> --ide codex --stream`.
