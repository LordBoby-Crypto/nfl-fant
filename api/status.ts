import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors, requireMethod } from "./_lib/http.js";
import { credentialsConfigured } from "./_lib/session.js";

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (applyCors(request, response)) return;
  if (requireMethod(request, response, ["GET"])) return;

  response.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
  response.status(200).json({
    backend: "ready",
    configured: credentialsConfigured(),
    provider: {
      name: "FantasyPros",
      season: 2026,
      scoring: "PPR",
      datasets: ["rankings", "adp", "projections", "injuries", "news"],
    },
    security: {
      apiKeyExposed: false,
      authentication: "password-session",
    },
  });
}
