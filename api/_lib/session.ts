import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { VercelRequest } from "@vercel/node";

const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

type LoginAttempts = {
  count: number;
  resetAt: number;
};

type SessionPayload = {
  exp: number;
  sub: "kingboby";
};

const loginAttempts = new Map<string, LoginAttempts>();

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function credentialsConfigured() {
  return Boolean(
    process.env.WAR_ROOM_PASSWORD &&
      process.env.WAR_ROOM_SESSION_SECRET &&
      process.env.FANTASYPROS_API_KEY,
  );
}

export function passwordMatches(password: string) {
  const expected = process.env.WAR_ROOM_PASSWORD;
  return expected ? safeEqual(password, expected) : false;
}

function requestAddress(request: VercelRequest) {
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return value?.split(",")[0]?.trim() || "unknown";
}

export function loginAllowed(request: VercelRequest) {
  const address = requestAddress(request);
  const attempts = loginAttempts.get(address);

  if (!attempts || attempts.resetAt <= Date.now()) {
    loginAttempts.delete(address);
    return { allowed: true, retryAfter: 0 };
  }

  return {
    allowed: attempts.count < MAX_LOGIN_ATTEMPTS,
    retryAfter: Math.max(1, Math.ceil((attempts.resetAt - Date.now()) / 1000)),
  };
}

export function recordLoginFailure(request: VercelRequest) {
  const address = requestAddress(request);
  const current = loginAttempts.get(address);

  if (!current || current.resetAt <= Date.now()) {
    loginAttempts.set(address, {
      count: 1,
      resetAt: Date.now() + LOGIN_WINDOW_MS,
    });
    return;
  }

  current.count += 1;
}

export function clearLoginFailures(request: VercelRequest) {
  loginAttempts.delete(requestAddress(request));
}

export function createSessionToken() {
  const secret = process.env.WAR_ROOM_SESSION_SECRET;
  if (!secret) throw new Error("Session secret is not configured.");

  const payload: SessionPayload = {
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    sub: "kingboby",
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function hasValidSession(request: VercelRequest) {
  const secret = process.env.WAR_ROOM_SESSION_SECRET;
  const authorization = request.headers.authorization;
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const [encodedPayload, signature] = authorization.slice(7).split(".");
  if (!encodedPayload || !signature) return false;

  const expected = sign(encodedPayload, secret);
  if (!safeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionPayload;
    return payload.sub === "kingboby" && payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
