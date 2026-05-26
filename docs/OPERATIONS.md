# JobComplaint - Runbook Operacional

## 1) Checklist de go-live

- [ ] Variáveis críticas configuradas (`DATABASE_URL`, `JWT_SECRET`, chaves de provedores externos)
- [ ] Banco sincronizado (`npx prisma db push`)
- [ ] Build validado (`npm run build`)
- [ ] Healthcheck respondendo `200` em `/api/ops/health`
- [ ] Readiness respondendo `200` em `/api/ops/readiness`
- [ ] Verificação forense com `strict=true` sem inconsistências
- [ ] Retenção testada em modo `dryRun` antes de ativar rotina automática

## 2) Sinais de operação saudável

- `GET /api/ops/health` retorna `status: healthy`
- `GET /api/ops/readiness` retorna `status: ready`
- `GET /api/ops/status` retorna `status: operational`
- `GET /api/compliance/ai/metrics` com uso de fallback controlado
- `GET /api/audit/verify?strict=true` com `integrityValid: true`

## 3) Runbook de incidentes

### 3.1 Readiness em `503`

1. Verificar banco (`DATABASE_URL`, rede, credenciais, disponibilidade)
2. Verificar variáveis obrigatórias no ambiente
3. Reexecutar `GET /api/ops/readiness`

### 3.1.1 Status operacional degradado

1. Consultar `GET /api/ops/status`
2. Verificar mensagem de erro retornada e logs estruturados por `requestId`
3. Confirmar conectividade com banco e disponibilidade dos endpoints críticos

### 3.2 Aumento súbito de fallback em IA

1. Consultar `/api/compliance/ai/metrics?days=1`
2. Confirmar disponibilidade e chave de `OPENROUTER_API_KEY`
3. Revisar latência/erros do provedor e orçamento de chamadas

### 3.3 Falha de integridade forense

1. Rodar `GET /api/audit/verify?strict=true`
2. Revisar `issues` retornados por chain/evento
3. Executar `POST /api/audit/rebaseline` em `dryRun`
4. Aplicar rebaseline (`apply=true`) somente com aprovação formal

## 4) Rotinas periódicas

- Diariamente:
  - Health/readiness
  - Métricas de IA por tenant
- Semanalmente:
  - Verificação forense com `strict=true`
  - Revisão de regras de escalonamento e SLAs
- Mensalmente:
  - Revisão de limites por plano (assentos e IA)
  - Teste de retenção em `dryRun` e execução controlada

## 5) Comandos rápidos

```bash
# setup local
npx prisma generate
npx prisma db push
npm run dev

# validação
npm run lint
npm run build
npm run ops:smoke
```

## 6) Release gates (CI)

Pipeline em `.github/workflows/ci.yml` bloqueia merge quando falhar:

- lint
- build
- smoke operacional (`/api/ops/health`, `/api/ops/readiness`, `/api/ops/status`)
