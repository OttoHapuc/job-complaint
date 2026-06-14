# PRD — Intake assíncrono com outbox

## Status
✅ Entregue (documentação retroativa)

## Problema
Intake síncrono lento e frágil; efeitos colaterais misturados na API.

## Funcionalidades entregues
- RawReport criptografado
- OutboxMessage
- Estágios de pipeline

## Evidência no código
- `src/lib/intake/*`
- `src/app/api/reports/route.ts`

## Métricas de sucesso (baseline)
- Build e lint passando
- Fluxo manual validado em dev
