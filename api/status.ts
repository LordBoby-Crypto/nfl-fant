import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  applyCors,
  requireMethod,
  STATUS_CACHE_CONTROL,
} from "./_lib/http.js";
import { credentialsConfigured } from "./_lib/session.js";

export default function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  if (applyCors(request, response)) return;
  if (requireMethod(request, response, ["GET"])) return;

  response.setHeader("Cache-Control", STATUS_CACHE_CONTROL);
  response.status(200).json({
    backend: "ready",
    configured: credentialsConfigured(),
    provider: {
      name: "FantasyPros",
      season: 2026,
      scoring: "Statistical components; Sleeper league rules applied in the War Room",
      datasets: ["rankings", "adp", "projections", "injuries", "news"],
    },
    security: {
      apiKeyExposed: false,
      authentication: "password-session",
    },
    features: {
      secureSync: true,
    },
  });
}
