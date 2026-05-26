import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const DASHBOARD_PREFIX = "/dashboard";

export async function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith(DASHBOARD_PREFIX)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const jwtSecret = process.env.JWT_SECRET;

  if (token && jwtSecret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(jwtSecret));
      return NextResponse.next();
    } catch {
      // Cookie inválido/forjado: limpa sessão e força login.
    }
  }

  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
