#!/usr/bin/env node
/**
 * Audita .env vs requisitos do JobComplaint.
 * Não imprime valores de segredos — só status ok/missing/weak/optional.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const PLACEHOLDER_PATTERNS = [
  /^replace-with/i,
  /^your[-_]/i,
  /^changeme/i,
  /^dev-outbox-secret$/i,
  /^dev-sensitive-token-hash$/i,
  /^dev-case-debug-key$/i,
];

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return map;
}

function status(key, env, { required = true, weakIf = [], devOkIf = [] } = {}) {
  const value = env.get(key)?.trim() ?? "";
  if (!value) {
    return required ? "missing" : "optional";
  }
  if (devOkIf.some((re) => re.test(value))) return "dev";
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(value))) return "weak";
  if (weakIf.some((re) => re.test(value))) return "weak";
  return "ok";
}

const productionMode = process.env.ENV_AUDIT_TARGET === "production";

if (!existsSync(envPath)) {
  console.error("Arquivo .env não encontrado. Copie .env.example primeiro.");
  process.exit(1);
}

const env = parseEnv(readFileSync(envPath, "utf8"));

const groups = [
  {
    title: "Core (obrigatório)",
    items: [
      {
        key: "DATABASE_URL",
        weakIf: productionMode ? [/localhost|127\.0\.0\.1/] : [],
        devOkIf: productionMode ? [] : [/localhost|127\.0\.0\.1/],
      },
      { key: "JWT_SECRET", weakIf: [/replace-with/i, /^.{0,31}$/] },
      {
        key: "APP_BASE_URL",
        weakIf: productionMode ? [/^http:\/\//i, /localhost/i] : [],
        devOkIf: productionMode ? [] : [/^http:\/\/localhost/i],
      },
    ],
  },
  {
    title: "Jobs / Vercel",
    items: [
      { key: "OUTBOX_PROCESSOR_SECRET", weakIf: [/^dev-outbox-secret$/i, /^.{0,15}$/] },
      { key: "CRON_SECRET", weakIf: [/^.{0,15}$/] },
      { key: "ALLOW_DEV_ROUTES", required: false },
    ],
  },
  {
    title: "Criptografia",
    items: [
      { key: "INVITE_EMAIL_ENCRYPTION_KEY", weakIf: [/^.{0,15}$/] },
      { key: "SENSITIVE_DATA_TOKEN_HASH", weakIf: [/^dev-sensitive/i, /^.{0,15}$/] },
      { key: "CASE_FORENSIC_DEBUG_KEY", required: false, weakIf: [/^dev-case-debug/i] },
      { key: "DB_FIELD_ENCRYPTION", required: false },
    ],
  },
  {
    title: "E-mail (SES)",
    items: [
      { key: "MAIL_PROVIDER" },
      { key: "AWS_SES_REGION" },
      { key: "AWS_SES_FROM_EMAIL" },
      { key: "AWS_ACCESS_KEY_ID" },
      { key: "AWS_SECRET_ACCESS_KEY" },
      { key: "SES_EVENTS_SECRET", required: false },
      { key: "SES_SNS_TOPIC_ARN", required: false },
    ],
  },
  {
    title: "IA",
    items: [{ key: "OPENROUTER_API_KEY" }, { key: "OPENROUTER_MODEL", required: false }],
  },
  {
    title: "Anexos (R2)",
    items: [
      { key: "R2_ACCOUNT_ID" },
      { key: "R2_ACCESS_KEY_ID" },
      { key: "R2_SECRET_ACCESS_KEY" },
      { key: "R2_BUCKET" },
      { key: "R2_ENDPOINT", required: false },
    ],
  },
  {
    title: "Esteira / SLA",
    items: [
      { key: "PARTICIPANT_FOLLOWUP_DAYS", required: false },
      { key: "PARTICIPANT_FOLLOWUP_MAX_ATTEMPTS", required: false },
      { key: "ABANDONMENT_WINDOW_DAYS", required: false },
    ],
  },
];

let hasBlocking = false;
let hasWeak = false;

for (const group of groups) {
  console.log(`\n${group.title}`);
  for (const item of group.items) {
    const st = status(item.key, env, item);
    const icon =
      st === "ok" || st === "dev"
        ? "✓"
        : st === "optional"
          ? "○"
          : st === "weak"
            ? "!"
            : "✗";
    const label = st === "dev" ? "ok (dev)" : st;
    console.log(`  ${icon} ${item.key}: ${label}`);
    if (st === "missing" && item.required !== false) hasBlocking = true;
    if (st === "weak") hasWeak = true;
  }
}

const isLocalDb = /localhost|127\.0\.0\.1/.test(env.get("DATABASE_URL") ?? "");
const isProdUrl = (env.get("APP_BASE_URL") ?? "").startsWith("https://");

console.log("\nContexto");
console.log(`  DATABASE_URL local: ${isLocalDb ? "sim (dev)" : "não (remoto/prod)"}`);
console.log(`  APP_BASE_URL HTTPS: ${isProdUrl ? "sim" : "não (ajustar na Vercel)"}`);

console.log("\nResumo");
if (hasBlocking) {
  console.log("  ✗ Variáveis obrigatórias faltando — corrija antes do deploy.");
  process.exit(1);
}
if (hasWeak) {
  console.log("  ! Segredos fracos ou placeholder — rode: npm run env:bootstrap");
  process.exit(2);
}
console.log("  ✓ .env adequado para desenvolvimento local.");
process.exit(0);
