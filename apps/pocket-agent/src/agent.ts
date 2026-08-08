/**
 * The agent loop: an ON-DEVICE language model that decides to pay.
 *
 * This closes the whole thesis. The model runs locally (react-native-litert-lm,
 * Gemma 4 E2B). It is given exactly one tool — `paid_fetch` — backed by
 * `fetchWithPayment`, so every call it makes flows through the PolicyGuard and
 * native-custody signing. The model can spend money it is allowed to spend,
 * and it CANNOT spend money it is not: the policy sits outside the model, so
 * even a prompt-injected or misbehaving model is bounded by caps, budgets, and
 * (over threshold) the human's Face ID.
 *
 *   user question
 *      → model (on-device) decides to call paid_fetch(url)
 *      → fetchWithPayment → PolicyGuard → native signature → settle
 *      → tool result fed back to the model
 *      → model answers using the paid data
 */
import type { LiteRTLMInstance, ToolDefinition, StreamEvent } from 'react-native-litert-lm';

/** The single tool the model is given. Its execution is the payment stack. */
export const PAID_FETCH_TOOL: ToolDefinition = {
  name: 'paid_fetch',
  description:
    'Fetch data from a paid API endpoint. Payment is handled automatically ' +
    'within the user-approved spending policy. Use this when you need live or ' +
    'premium data to answer the question. Returns the JSON the endpoint serves.',
  parametersJson: JSON.stringify({
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL of the paid endpoint to fetch.',
      },
    },
    required: ['url'],
  }),
};

const SYSTEM_PROMPT =
  'You are a helpful assistant running entirely on the user\'s phone. ' +
  'When answering needs live or paid data, call the paid_fetch tool with the ' +
  'endpoint URL. Payments are governed by a spending policy you do not control ' +
  'and cannot override — small amounts settle automatically, larger ones ask ' +
  'the user for Face ID. After a tool returns, use its data to answer plainly. ' +
  'Never invent data you did not fetch.';

export type AgentEvent =
  | { kind: 'thinking'; text: string }
  | { kind: 'answer'; text: string }
  | { kind: 'tool-call'; url: string }
  | { kind: 'tool-result'; ok: boolean; summary: string }
  | { kind: 'done' };

export interface PaidFetch {
  (url: string): Promise<Response>;
}

/** Extract the first {url} from accumulated <tool_call> content. */
function parseToolCall(raw: string): { name: string; url: string } | null {
  // The model emits JSON inside the tool_call channel. Be liberal: find the
  // first balanced {...} and parse it.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1));
    const args = obj.arguments ?? obj.parameters ?? obj;
    const url = obj.url ?? args?.url;
    const name = obj.name ?? 'paid_fetch';
    if (typeof url === 'string') return { name, url };
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Run one agent turn. Streams AgentEvents to `onEvent`. `paidFetch` is the
 * allowkit `fetchWithPayment` — the tool's execution IS the payment stack.
 */
// NOTE: the model must be loaded with `tools: [PAID_FETCH_TOOL]` in its
// LLMConfig (tools are a load-time setting in litert-lm, not per-call).
export async function runAgent(
  llm: LiteRTLMInstance,
  question: string,
  paidFetch: PaidFetch,
  onEvent: (e: AgentEvent) => void,
  opts?: { allowedHosts?: string[]; maxToolCalls?: number }
): Promise<void> {
  const maxToolCalls = opts?.maxToolCalls ?? 2;
  const prompt = `${SYSTEM_PROMPT}\n\nUser: ${question}\nAssistant:`;

  let toolCalls = 0;
  let transcript = prompt;

  for (let turn = 0; turn <= maxToolCalls; turn++) {
    let toolBuf = '';
    let answerBuf = '';

    await llm.executeWithEvents(
      [{ type: 'text', text: transcript }],
      (ev: StreamEvent) => {
        if (ev.type === 'toolCall') {
          toolBuf += ev.text;
        } else if (ev.type === 'thinking') {
          if (ev.text) onEvent({ kind: 'thinking', text: ev.text });
        } else {
          if (ev.text) {
            answerBuf += ev.text;
            onEvent({ kind: 'answer', text: ev.text });
          }
        }
      }
    );
    void answerBuf;

    const call = toolBuf ? parseToolCall(toolBuf) : null;
    if (!call || toolCalls >= maxToolCalls) {
      onEvent({ kind: 'done' });
      return;
    }

    // Optional host allowlist — a belt to the policy's braces.
    if (opts?.allowedHosts && !opts.allowedHosts.some((h) => call.url.includes(h))) {
      onEvent({ kind: 'tool-result', ok: false, summary: `blocked host: ${call.url}` });
      transcript += `\n<tool_result>Error: host not allowed.</tool_result>\nAssistant:`;
      continue;
    }

    toolCalls++;
    onEvent({ kind: 'tool-call', url: call.url });

    let toolResult: string;
    try {
      const res = await paidFetch(call.url);
      if (res.ok) {
        const body = await res.text();
        toolResult = body.slice(0, 2000);
        onEvent({ kind: 'tool-result', ok: true, summary: toolResult.slice(0, 120) });
      } else {
        toolResult = `Error: HTTP ${res.status} (payment refused or endpoint error).`;
        onEvent({ kind: 'tool-result', ok: false, summary: toolResult });
      }
    } catch (e) {
      toolResult = `Error: ${(e as Error).message}`;
      onEvent({ kind: 'tool-result', ok: false, summary: toolResult });
    }

    // Feed the tool result back and let the model continue.
    transcript += `\n<tool_result>${toolResult}</tool_result>\nAssistant:`;
  }

  onEvent({ kind: 'done' });
}
