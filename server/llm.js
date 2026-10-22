import Anthropic, {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { config } from './config.js';

export class LLMError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let client = null;
export function getClient() {
  if (!config.apiKey) return null;
  client ??= new Anthropic({ apiKey: config.apiKey, maxRetries: 1, timeout: 30_000 });
  return client;
}

// The prompts ask for a bare JSON object, but tolerate code fences or stray prose.
export function parseLooseJSON(t) {
  try { return JSON.parse(t); } catch {}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (f) { try { return JSON.parse(f[1]); } catch {} }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new LLMError('invalid_json', 502, 'No JSON in the model reply');
}

/** One Messages API call that must return a JSON object. Returns {result, text, message}. */
export async function completeJSON(prompt, { signal } = {}) {
  const c = getClient();
  if (!c) throw new LLMError('no_api_key', 503, 'ANTHROPIC_API_KEY is not set on the server');
  let message;
  try {
    message = await c.messages.create(
      {
        model: config.model,
        max_tokens: config.maxTokens,
        output_config: { effort: config.effort },
        messages: [{ role: 'user', content: prompt }],
      },
      { signal },
    );
  } catch (e) {
    if (e instanceof APIUserAbortError) throw new LLMError('cancelled', 499, 'Request cancelled by the client');
    if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) throw new LLMError('auth_failed', 502, e.message);
    if (e instanceof RateLimitError) throw new LLMError('rate_limited', 429, e.message);
    if (e instanceof APIConnectionError) throw new LLMError('upstream_unreachable', 502, e.message);
    if (e instanceof APIError) throw new LLMError(`http_${e.status}`, 502, e.message);
    throw e;
  }
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (message.stop_reason === 'refusal') throw Object.assign(new LLMError('refusal', 502, 'The model declined this request'), { apiMessage: message });
  if (message.stop_reason === 'max_tokens' && !text.includes('}')) {
    throw Object.assign(new LLMError('truncated', 502, `Reply hit max_tokens (${config.maxTokens})`), { apiMessage: message });
  }
  try {
    return { result: parseLooseJSON(text), text, message };
  } catch (e) {
    e.apiMessage = message;
    e.text = text;
    throw e;
  }
}
