import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_ORIGINS = [
  "https://lordboby-crypto.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function allowedOrigins() {
  const configured = process.env.WAR_ROOM_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set(configured?.length ? configured : DEFAULT_ORIGINS);
}

export function applyCors(
  request: VercelRequest,
  response: VercelResponse,
): boolean {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  const origin = request.headers.origin;

  if (origin && allowedOrigins().has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Vary", "Origin");
  }

  if (request.method === "OPTIONS") {
    if (origin && !allowedOrigins().has(origin)) {
      response.status(403).end();
    } else {
      response.status(204).end();
    }
    return true;
  }

  if (origin && !allowedOrigins().has(origin)) {
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
