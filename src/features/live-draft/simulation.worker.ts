import {
  runDraftSimulations,
  type DraftSimulationInput,
} from "./strategy";

interface SimulationWorkerScope {
  onmessage: ((event: MessageEvent<DraftSimulationInput>) => void) | null;
  postMessage: (result: ReturnType<typeof runDraftSimulations>) => void;
}

const workerScope = self as unknown as SimulationWorkerScope;

workerScope.onmessage = (event) => {
  workerScope.postMessage(runDraftSimulations(event.data));
};
