import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_ORIGINS = [
  "https://lordboby-crypto.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const VERCEL_PRODUCTION_ORIGIN = "https://nfl-fant-api.vercel.app";
const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/nfl-fant-[a-z0-9-]+-logansai\.vercel\.app$/;

export const STATUS_CACHE_CONTROL = "private, no-store";

function allowedOrigins() {
  const configured = process.env.WAR_ROOM_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configured?.length ? configured : DEFAULT_ORIGINS);
}

function isAllowedOrigin(origin: string | undefined) {
  return Boolean(
    origin &&
      (origin === VERCEL_PRODUCTION_ORIGIN ||
        allowedOrigins().has(origin) ||
        VERCEL_PREVIEW_ORIGIN.test(origin)),
  );
}

export function applyCors(
  request: VercelRequest,
  response: VercelResponse,
): boolean {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Vary", "Origin");
  const origin = request.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }

  if (request.method === "OPTIONS") {
    if (origin && !isAllowedOrigin(origin)) {
      response.status(403).end();
    } else {
      response.status(204).end();
    }
    return true;
  }

  if (origin && !isAllowedOrigin(origin)) {
    response.status(403).json({ error: "Origin is not allowed." });
    return true;
  }

  return false;
}

export function requireMethod(
  request: VercelRequest,
  response: VercelResponse,
  methods: string[],
): boolean {
  if (!request.method || !methods.includes(request.method)) {
    response.setHeader("Allow", methods.join(", "));
    response.status(405).json({ error: "Method not allowed." });
    return true;
  }
  return false;
}
