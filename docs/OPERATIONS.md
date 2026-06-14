# JobComplaint - Runbook Operacional

## 1) Checklist de go-live

- [ ] Variáveis críticas configuradas (`DATABASE_URL`, `JWT_SECRET`, chaves de provedores externos)
- [ ] Validação local: `npm run env:audit` (dev) / `npm run env:audit:prod` (antes do deploy)
- [ ] `OUTBOX_PROCESSOR_SECRET` definido em produção
- [ ] `CRON_SECRET` definido na Vercel (cron jobs da esteira)
- [ ] `ALLOW_DEV_ROUTES=false` em produção (ou `true` apenas em staging controlado)
- [ ] Banco sincronizado (`npx prisma db push`)
- [ ] Build validado (`npm run build`)
- [ ] Healthcheck respondendo `200` em `/api/ops/health`
- [ ] Readiness respondendo `200` em `/api/ops/readiness`
- [ ] Status operacional com fila outbox saudável (`outbox.failed=0`, `outbox.dead=0`)
- [ ] Cron da outbox ativo (sidecar ou cron do SO)
- [ ] Verificação forense com `strict=true` sem inconsistências
- [ ] Retenção testada em modo `dryRun` antes de ativar rotina automática
- [ ] Smoke E2E (`npm run ops:smoke` e `npm run sla:check`) passando no ambiente alvo

## 2) Sinais de operação saudável

- `GET /api/ops/health` retorna `status: healthy`
- `GET /api/ops/readiness` retorna `status: ready`
- `GET /api/ops/status` retorna `status: operational` e `outbox.pending` estável
- `GET /api/compliance/ai/metrics` com uso de fallback controlado
- `GET /api/audit/verify?strict=true` com `integrityValid: true`

## 3) Processamento contínuo da outbox

A fila outbox só avança quando `POST /api/internal/outbox/process` é invocado.

### 3.1 Script local / sidecar

```bash
chmod +x scripts/outbox-cron.sh

# uma execução
OUTBOX_PROCESSOR_SECRET="seu-secret" APP_BASE_URL="http://localhost:3000" \
  ./scripts/outbox-cron.sh --once

# loop contínuo (default 5 min)
OUTBOX_CRON_INTERVAL_SECONDS=300 \
OUTBOX_PROCESSOR_SECRET="seu-secret" \
APP_BASE_URL="https://app.exemplo.com" \
  ./scripts/outbox-cron.sh
```

### 3.2 Cron do sistema operacional

```cron
*/5 * * * * cd /opt/job-complaint && OUTBOX_PROCESSOR_SECRET=*** APP_BASE_URL=https://app.exemplo.com ./scripts/outbox-cron.sh --once
```

### 3.3 Sidecar docker-compose (opcional)

```yaml
services:
  outbox-worker:
    image: curlimages/curl:8.11.1
    restart: unless-stopped
    environment:
      APP_BASE_URL: http://app:3000
      OUTBOX_PROCESSOR_SECRET: ${OUTBOX_PROCESSOR_SECRET}
      OUTBOX_CRON_INTERVAL_SECONDS: 300
    entrypoint: ["/bin/sh", "-c"]
    command:
      - |
        while true; do
          curl -sS -X POST -H "x-outbox-secret: $$OUTBOX_PROCESSOR_SECRET" "$$APP_BASE_URL/api/internal/outbox/process" || true
          sleep $$OUTBOX_CRON_INTERVAL_SECONDS
        done
```

### 3.4 Troubleshooting outbox

| Sintoma | Ação |
|---------|------|
| `outbox.pending` crescendo | Verificar cron ativo, logs do worker, conectividade com app |
| `401` no processamento | Conferir `OUTBOX_PROCESSOR_SECRET` no worker e na app |
| `outbox.failed > 0` | Inspecionar `lastError` na tabela `OutboxMessage`, corrigir causa e reprocessar |
| `outbox.dead > 0` | Revisar mensagens mortas manualmente; pode exigir intervenção de dados |

## 4) Runbook de incidentes

### 4.1 Readiness em `503`

1. Verificar banco (`DATABASE_URL`, rede, credenciais, disponibilidade)
2. Verificar variáveis obrigatórias no ambiente
3. Reexecutar `GET /api/ops/readiness`

### 4.2 Status operacional degradado

1. Consultar `GET /api/ops/status`
2. Verificar `outbox.failed`, `outbox.dead` e mensagem de erro
3. Confirmar conectividade com banco e disponibilidade dos endpoints críticos

### 4.3 Aumento súbito de fallback em IA

1. Consultar `/api/compliance/ai/metrics?days=1`
2. Confirmar disponibilidade e chave de `OPENROUTER_API_KEY`
3. Revisar latência/erros do provedor e orçamento de chamadas

### 4.4 Falha de integridade forense

1. Rodar `GET /api/audit/verify?strict=true`
2. Revisar `issues` retornados por chain/evento
3. Executar `POST /api/audit/rebaseline` em `dryRun`
4. Aplicar rebaseline (`apply=true`) somente com aprovação formal

## 5) Rotinas periódicas

- Diariamente:
  - Health/readiness/status (incluindo outbox)
  - Métricas de IA por tenant
- Semanalmente:
  - Verificação forense com `strict=true`
  - Revisão de regras de escalonamento e SLAs
- Mensalmente:
  - Revisão de limites por plano (assentos e IA)
  - Teste de retenção em `dryRun` e execução controlada

## 6) Comandos rápidos

```bash
# setup local
npx prisma generate
npx prisma db push
npm run dev

# validação
npm run lint
npm run build
npm run ops:smoke
npm run sla:check
```

## 7) Referências de arquitetura

- Trilha completa da denúncia: `docs/COMPLAINT-LIFECYCLE.md`
- Criptografia de campos: `src/lib/field-crypto.ts` (`DB_FIELD_ENCRYPTION`, `NODE_ENV`)
- E-mail: `src/lib/mail/` (`MAIL_PROVIDER=ses|cloudflare`)
- Catálogo de templates: `docs/EMAIL-CATALOG.md`
- Estagnação / autonomia: `src/lib/pipeline/lifecycle.ts`
- Endpoint de casos parados: `GET /api/ops/pipeline/stagnation`

### E-mail (apenas SES e Cloudflare)

| `MAIL_PROVIDER` | Variáveis obrigatórias |
|-----------------|------------------------|
| `ses` | `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`, credenciais AWS |
| `cloudflare` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_API_TOKEN`, `CLOUDFLARE_EMAIL_FROM` |

Em `NODE_ENV !== production`, `sendMail()` simula o envio (log `mail.send.simulated`, sem chamar SES/Cloudflare). Em produção, use `MAIL_PROVIDER` (`ses` ou `cloudflare`) e as variáveis correspondentes.

### Verificação antes do envio

`sendMail()` valida destinatários em `src/lib/mail/verify.ts`:

| Camada | Variável | Comportamento |
|--------|----------|---------------|
| Formato + domínios descartáveis | — | Sempre ativo |
| Lista local de supressão | tabela `EmailSuppression` | Bounce/complaint/validação |
| DNS MX | `MAIL_VERIFY_MX` | Default `true` em produção |
| Suppression list SES | `MAIL_VERIFY_SES_SUPPRESSION` | Default `true` com `MAIL_PROVIDER=ses` |

Webhook SNS: `POST /api/internal/ses/events` (configure `SES_SNS_TOPIC_ARN` e subscription no SES).

## 8) Release gates (CI)

Pipeline em `.github/workflows/ci.yml` bloqueia merge quando falhar:

- lint
- build
- smoke operacional (`/api/ops/health`, `/api/ops/readiness`, `/api/ops/status`, `/api/ops/pipeline/stagnation` + métricas outbox)

## 9) Deploy na Vercel

### 9.1 Pré-requisitos

- PostgreSQL acessível pela Vercel (Neon, Supabase, Vercel Postgres, etc.) com URL **pooled**
- `npx prisma db push` executado no banco de produção antes do primeiro deploy
- Plano com **Cron Jobs** habilitado (Pro) para a esteira outbox

### 9.2 Configuração do projeto

O repositório inclui `vercel.json` com:

- `buildCommand`: `npm run vercel-build` (`prisma generate` + `next build`)
- Cron `*/5 * * * *` → `GET /api/cron/outbox`
- Cron `0 8 * * *` → `GET /api/cron/sla-notify`

Variáveis críticas na Vercel:

| Variável | Uso |
|----------|-----|
| `DATABASE_URL` | Postgres pooled |
| `JWT_SECRET` | Sessão |
| `CRON_SECRET` | Bearer enviado automaticamente pelos crons da Vercel |
| `OUTBOX_PROCESSOR_SECRET` | Scripts locais / sidecar (`x-outbox-secret`) |
| `APP_BASE_URL` | URL pública do app |
| `ALLOW_DEV_ROUTES` | `false` em produção |

Recomenda-se definir `CRON_SECRET` e `OUTBOX_PROCESSOR_SECRET` com o **mesmo valor** forte, ou manter ambos e usar qualquer um na autenticação interna.

### 9.3 Autenticação de jobs

Rotas `/api/cron/*` e `/api/internal/*` aceitam:

- `Authorization: Bearer <CRON_SECRET>` (Vercel Cron)
- `x-outbox-secret: <OUTBOX_PROCESSOR_SECRET>` (script `outbox-cron.sh`)
- `?secret=` (fallback manual)

### 9.4 Pós-deploy

1. `GET /api/ops/readiness` → `200`
2. Aguardar 5 min e conferir `GET /api/ops/status` (`outbox.pending` estável)
3. `SMOKE_BASE_URL=https://seu-dominio npm run ops:smoke`
