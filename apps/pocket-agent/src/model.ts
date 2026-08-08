/**
 * On-device model lifecycle for Pocket Agent.
 *
 * Loads Gemma 4 E2B (~2.6 GB, downloaded once on first run) via
 * react-native-litert-lm, configured with the single paid_fetch tool. The
 * model runs entirely on the phone — no inference leaves the device, which is
 * the point: an edge agent that pays.
 */
import { createLLM, GEMMA_4_E2B_IT, type LiteRTLMInstance } from 'react-native-litert-lm';
import { PAID_FETCH_TOOL } from './agent';

export interface ModelHandle {
  llm: LiteRTLMInstance;
}

export type LoadProgress =
  | { phase: 'downloading'; progress: number }
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

/**
 * Create and load the model. Reports download progress (0..1) then load.
 * The model is configured with the paid_fetch tool at load time (tools are a
 * load-time setting in litert-lm).
 */
export async function loadAgentModel(
  onProgress: (p: LoadProgress) => void
): Promise<ModelHandle> {
  const llm = createLLM();
  try {
    await llm.loadModel(
      GEMMA_4_E2B_IT,
      {
        // CPU backend is the safe default across devices; GPU (Metal) can be
        // selected where supported. Tools are declared here, not per-call.
        tools: [PAID_FETCH_TOOL],
        maxTokens: 1024,
      },
      (progress: number) => onProgress({ phase: 'downloading', progress })
    );
    onProgress({ phase: 'ready' });
    return { llm };
  } catch (e) {
    onProgress({ phase: 'error', message: (e as Error).message });
    throw e;
  }
}
