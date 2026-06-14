#!/usr/bin/env bash
set -euo pipefail

APP_BASE_URL="${APP_BASE_URL:-http://localhost:3000}"
OUTBOX_PROCESSOR_SECRET="${OUTBOX_PROCESSOR_SECRET:-}"
INTERVAL_SECONDS="${OUTBOX_CRON_INTERVAL_SECONDS:-300}"
RUN_ONCE="${OUTBOX_CRON_RUN_ONCE:-false}"

process_outbox() {
  local url="${APP_BASE_URL%/}/api/internal/outbox/process"
  local args=(
    -sS
    -X POST
    -H "Content-Type: application/json"
    --fail-with-body
    -w "\nHTTP %{http_code}\n"
  )

  if [[ -n "$OUTBOX_PROCESSOR_SECRET" ]]; then
    args+=(-H "x-outbox-secret: ${OUTBOX_PROCESSOR_SECRET}")
  fi

  curl "${args[@]}" "$url"
}

notify_sla() {
  local url="${APP_BASE_URL%/}/api/internal/ops/sla-notify"
  local args=(
    -sS
    -X POST
    -H "Content-Type: application/json"
    --fail-with-body
    -w "\nHTTP %{http_code}\n"
  )

  if [[ -n "$OUTBOX_PROCESSOR_SECRET" ]]; then
    args+=(-H "x-outbox-secret: ${OUTBOX_PROCESSOR_SECRET}")
  fi

  curl "${args[@]}" "$url" || echo "SLA notify falhou (best-effort)" >&2
}

if [[ "${1:-}" == "--once" ]]; then
  process_outbox
  notify_sla
  exit 0
fi

if [[ "$RUN_ONCE" == "true" ]]; then
  process_outbox
  notify_sla
  exit 0
fi

echo "Outbox cron iniciado (intervalo=${INTERVAL_SECONDS}s, base=${APP_BASE_URL})"
while true; do
  if ! process_outbox; then
    echo "Falha ao processar outbox; nova tentativa em ${INTERVAL_SECONDS}s" >&2
  fi
  notify_sla
  sleep "$INTERVAL_SECONDS"
done
