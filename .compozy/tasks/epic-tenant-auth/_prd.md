# PRD — Multi-tenant, autenticação e permissões

## Status
✅ Entregue (documentação retroativa)

## Problema
Base SaaS com isolamento por tenant e segregação corporate vs conselho.

## Funcionalidades entregues
- Onboarding self-service
- JWT + middleware
- Permissões por isCorporateAccount

## Evidência no código
- `src/lib/permissions.ts`
- `src/app/api/auth/*`
- `src/app/api/saas/*`

## Métricas de sucesso (baseline)
- Build e lint passando
- Fluxo manual validado em dev
