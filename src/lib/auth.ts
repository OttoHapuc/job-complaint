import argon2 from "argon2";
import jwt, { type SignOptions } from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET;
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN || "1d") as SignOptions["expiresIn"];

export type JwtPayload = {
  sub: string;
  tenantId: string;
  email: string;
};

export async function hashPassword(password: string) {
  return argon2.hash(password);
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export function signAccessToken(payload: JwtPayload) {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
}

export function verifyAccessToken(token: string) {
  if (!jwtSecret) {
    throw new Error("JWT_SECRET is not configured.");
  }
  return jwt.verify(token, jwtSecret) as JwtPayload;
}
