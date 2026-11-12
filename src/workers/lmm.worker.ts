/**
 * Runs the LMM Monte Carlo in a background thread so the page stays responsive.
 * The page posts { setup, opts }; the worker replies with the LmmResult.
 */
import { simulateLmm, type LmmSetup } from '../models/lmm';

type Request = { setup: LmmSetup; opts: Parameters<typeof simulateLmm>[1] };

self.onmessage = (e: MessageEvent<Request>) => {
  const started = performance.now();
  const result = simulateLmm(e.data.setup, e.data.opts);
  self.postMessage({ result, ms: performance.now() - started });
};
