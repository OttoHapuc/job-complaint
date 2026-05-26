import { randomUUID } from "crypto";

type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  message: string;
  requestId?: string;
  scope?: string;
  data?: Record<string, unknown>;
  timestamp: string;
};

export function createRequestId() {
  return randomUUID();
}

export function log(level: LogLevel, message: string, options?: Omit<LogEntry, "level" | "message" | "timestamp">) {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...options,
  };
  const serialized = JSON.stringify(entry);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export function logInfo(message: string, options?: Omit<LogEntry, "level" | "message" | "timestamp">) {
  log("info", message, options);
}

export function logWarn(message: string, options?: Omit<LogEntry, "level" | "message" | "timestamp">) {
  log("warn", message, options);
}

export function logError(message: string, options?: Omit<LogEntry, "level" | "message" | "timestamp">) {
  log("error", message, options);
}
