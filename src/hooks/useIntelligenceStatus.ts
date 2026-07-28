import { useEffect, useState } from "react";
import {
  getIntelligenceStatus,
  isIntelligenceBackendLinked,
  type IntelligenceStatus,
} from "../services/intelligence";

export function useIntelligenceStatus() {
  const [data, setData] = useState<IntelligenceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linked = isIntelligenceBackendLinked();

  useEffect(() => {
    if (!linked) return;
    const controller = new AbortController();

    getIntelligenceStatus(controller.signal)
      .then(setData)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The intelligence backend could not be reached.",
        );
      });

    return () => controller.abort();
  }, [linked]);

  return { data, error, linked };
}
