#!/usr/bin/env node
/**
 * Preenche .env apenas onde está vazio ou com placeholder conhecido.
 * Não sobrescreve segredos já configurados (AWS, OpenRouter, R2, etc.).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const PLACEHOLDER_VALUES = new Set([
  "",
  "replace-with-a-strong-secret",
  "dev-outbox-secret",
  "dev-sensitive-token-hash",
  "dev-case-debug-key",
]);

function hex(n = 32) {
  return randomBytes(n).toString("hex");
}

function b64(n = 32) {
  return randomBytes(n).toString("base64");
}

function shouldFill(value) {
  const v = (value ?? "").trim();
  return PLACEHOLDER_VALUES.has(v);
}

function upsert(lines, key, value) {
  const pattern = new RegExp(`^${key}=`);
  const entry = `${key}="${value}"`;
  const idx = lines.findIndex((line) => pattern.test(line.trim()));
  if (idx >= 0) {
    const current = lines[idx];
    const eq = current.indexOf("=");
    let existing = current.slice(eq + 1).trim();
    if (
      (existing.startsWith('"') && existing.endsWith('"')) ||
      (existing.startsWith("'") && existing.endsWith("'"))
    ) {
      existing = existing.slice(1, -1);
    }
    if (!shouldFill(existing)) return false;
    lines[idx] = entry;
    return true;
  }
  lines.push(entry);
  return true;
}

if (!existsSync(envPath)) {
  console.error(".env não encontrado.");
  process.exit(1);
}

const content = readFileSync(envPath, "utf8");
const lines = content.split("\n");

const jobSecret = hex(32);
const sharedJobSecret = hex(32);
const changes = [];

if (upsert(lines, "JWT_SECRET", jobSecret)) changes.push("JWT_SECRET");

const outboxFilled = upsert(lines, "OUTBOX_PROCESSOR_SECRET", sharedJobSecret);
if (outboxFilled) changes.push("OUTBOX_PROCESSOR_SECRET");

const cronPattern = /^CRON_SECRET=/;
const cronLine = lines.find((line) => cronPattern.test(line.trim()));
let cronExisting = "";
if (cronLine) {
  const eq = cronLine.indexOf("=");
  cronExisting = cronLine.slice(eq + 1).trim().replace(/^"|"$/g, "");
}
if (shouldFill(cronExisting)) {
  if (upsert(lines, "CRON_SECRET", sharedJobSecret)) changes.push("CRON_SECRET");
} else if (!lines.some((line) => cronPattern.test(line.trim()))) {
  lines.push(`CRON_SECRET="${sharedJobSecret}"`);
  changes.push("CRON_SECRET");
}
if (upsert(lines, "INVITE_EMAIL_ENCRYPTION_KEY", b64(32))) changes.push("INVITE_EMAIL_ENCRYPTION_KEY");
if (upsert(lines, "SENSITIVE_DATA_TOKEN_HASH", hex(32))) changes.push("SENSITIVE_DATA_TOKEN_HASH");
if (upsert(lines, "CASE_FORENSIC_DEBUG_KEY", hex(24))) changes.push("CASE_FORENSIC_DEBUG_KEY");
if (upsert(lines, "SES_EVENTS_SECRET", hex(24))) changes.push("SES_EVENTS_SECRET");

const defaults = [
  ["PARTICIPANT_FOLLOWUP_DAYS", "5"],
  ["PARTICIPANT_FOLLOWUP_MAX_ATTEMPTS", "3"],
  ["ALLOW_DEV_ROUTES", "true"],
  ["OUTBOX_CRON_INTERVAL_SECONDS", "300"],
];

for (const [key, value] of defaults) {
  const pattern = new RegExp(`^${key}=`);
  if (!lines.some((line) => pattern.test(line.trim()))) {
    lines.push(`${key}="${value}"`);
    changes.push(key);
  }
}

if (changes.length === 0) {
  console.log("Nenhuma variável precisou ser preenchida.");
  process.exit(0);
}

writeFileSync(envPath, `${lines.filter((l, i, arr) => !(i === arr.length - 1 && l === "")).join("\n")}\n`);
console.log("Variáveis atualizadas:", changes.join(", "));
console.log("Rode npm run env:audit para validar.");
