import { applyCors, requireMethod } from "./_lib/http.js";
import { hasValidSession } from "./_lib/session.js";
import { createSyncHandler } from "./_lib/sync-handler.js";

export default createSyncHandler({
  applyCors,
  requireMethod,
  hasValidSession,
});
