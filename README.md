# JobComplaint

Plataforma SaaS B2B de denúncias corporativas com trilha de auditoria imutável, compliance e suporte a operação multi-tenant.

## Requisitos

- Node.js 20+
- PostgreSQL 16+
- npm 10+

## Setup local

1) Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

2) (Opcional) Suba Postgres local via compose:

```bash
docker compose -f docker-compose.postgres.yml up -d
```

3) Sincronize schema:

```bash
npx prisma generate
npx prisma db push
```

4) Rode o app:

```bash
npm run dev
```

## Scripts úteis

- `npm run dev` - desenvolvimento
- `npm run lint` - lint
- `npm run build` - build de produção
- `npm run ops:smoke` - smoke de endpoints de operação

## Endpoints de operação

- `GET /api/ops/health` - healthcheck básico da aplicação
- `GET /api/ops/readiness` - readiness (DB + variáveis obrigatórias)
- `GET /api/ops/status` - status operacional consolidado (volumetria e sinais de operação)

## Observabilidade e compliance

- Verificação forense de cadeia:
  - `GET /api/audit/verify`
  - `GET /api/audit/verify?strict=true`
- Rebaseline assistido:
  - `POST /api/audit/rebaseline`
- Retenção de dados:
  - `POST /api/privacy/retention/run`
- Direitos do titular (LGPD):
  - `POST /api/privacy/data-subject-requests`
  - `GET /api/privacy/data-subject-requests` (admin/investigator)
  - `PATCH /api/privacy/data-subject-requests/:id` (admin/investigator)
  - `GET /api/privacy/data-subject-requests/overview` (dashboard/SLA)

## Operação e go-live

Veja `docs/OPERATIONS.md` para checklist operacional, runbook de incidentes e fluxo de validação pré-go-live.

## CI e release gates

O workflow em `.github/workflows/ci.yml` valida:

1. `npm ci`
2. `prisma generate` + `prisma db push`
3. `npm run lint`
4. `npm run build`
5. `npm run ops:smoke` (health/readiness/status)
