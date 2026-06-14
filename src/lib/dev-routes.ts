import { NextResponse } from "next/server";

export function isDevRoutesEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_DEV_ROUTES?.trim().toLowerCase() === "true";
}

export function ensureDevRouteAccess() {
  if (isDevRoutesEnabled()) return null;
  return NextResponse.json({ error: "Rota não encontrada." }, { status: 404 });
}
