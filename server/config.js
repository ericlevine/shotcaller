import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));
const bool = (v) => /^(1|true|yes)$/i.test(v || '');

export const config = {
  root,
  host: env.HOST || '127.0.0.1',
  port: int(env.PORT, 8787),
  apiKey: env.ANTHROPIC_API_KEY || '',
  model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  effort: env.ANTHROPIC_EFFORT || 'low',
  maxTokens: int(env.LLM_MAX_TOKENS, 2000),
  logLevel: env.LOG_LEVEL || 'info',
  logDir: path.resolve(root, env.LOG_DIR || 'logs'),
  logPrompts: bool(env.LOG_PROMPTS),
  openaiKey: env.OPENAI_API_KEY || '',
  sttModel: env.OPENAI_STT_MODEL || 'gpt-live-transcribe',
  sttDelay: env.OPENAI_STT_DELAY || 'low',
  sttUrl: env.OPENAI_REALTIME_URL || 'wss://api.openai.com/v1/realtime?intent=transcription',
};
