import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, requireMethod } from "./_lib/http.js";
import {
  clearLoginFailures,
  createSessionToken,
  credentialsConfigured,
  loginAllowed,
  passwordMatches,
  recordLoginFailure,
} from "./_lib/session.js";

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (applyCors(request, response)) return;
  if (requireMethod(request, response, ["POST"])) return;

  response.setHeader("Cache-Control", "no-store");

  if (!credentialsConfigured()) {
    response.status(503).json({ error: "Player intelligence is not configured yet." });
    return;
  }

  const login = loginAllowed(request);
  if (!login.allowed) {
    response.setHeader("Retry-After", String(login.retryAfter));
    response.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }

  const password =
    typeof request.body?.password === "string" ? request.body.password : "";

  if (!passwordMatches(password)) {
    recordLoginFailure(request);
    response.status(401).json({ error: "Incorrect War Room password." });
    return;
  }

  clearLoginFailures(request);
  response.status(200).json({
    token: createSessionToken(),
    expiresIn: 12 * 60 * 60,
  });
}
