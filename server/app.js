import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { appendOrder, logger } from './logger.js';
import { completeJSON, LLMError } from './llm.js';

const KINDS = new Set(['router', 'agent', 'batch']);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : undefined);

function usageOf(message) {
  const u = message?.usage;
  if (!u) return undefined;
  return {
    input: u.input_tokens,
    output: u.output_tokens,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

export function createApp({ llm = completeJSON, log = logger } = {}) {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger: log,
      genReqId: (req, res) => {
        const id = str(req.headers['x-request-id'], 64) || crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Static files are noise; log only the API.
      autoLogging: { ignore: (req) => !req.url.startsWith('/api/') },
      customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ status: res.statusCode }),
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, llm: Boolean(config.apiKey), model: config.model, stt: config.openaiKey ? config.sttModel : null });
  });

  app.post('/api/llm', async (req, res) => {
    const b = req.body || {};
    const prompt = str(b.prompt, 100_000);
    if (!prompt) return res.status(400).json({ error: { code: 'bad_request', message: 'prompt is required' } });
    const ctx = {
      kind: KINDS.has(b.kind) ? b.kind : 'unknown',
      session: str(b.session, 64),
      order: Number.isInteger(b.order) ? b.order : undefined,
      heroes: Array.isArray(b.heroes) ? b.heroes.slice(0, 8).map((h) => String(h).slice(0, 16)) : undefined,
    };
    const llmLog = req.log.child({ event: 'llm.call', ...ctx, model: config.model });

    // Stop paying for a call the game has already abandoned.
    const ctl = new AbortController();
    res.on('close', () => { if (!res.writableFinished) ctl.abort(); });

    const t0 = performance.now();
    try {
      const { result, text, message } = await llm(prompt, { signal: ctl.signal });
      const ms = Math.round(performance.now() - t0);
      llmLog.info(
        {
          outcome: 'ok', ms, stopReason: message?.stop_reason, usage: usageOf(message), messageId: message?.id,
          ...(config.logPrompts ? { prompt, reply: text } : {}),
        },
        `${ctx.kind} call ok in ${ms}ms`,
      );
      if (!config.logPrompts) llmLog.debug({ prompt, reply: text }, 'llm prompt and reply');
      res.json({ result, ms, usage: usageOf(message) });
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      const known = e instanceof LLMError;
      const code = known ? e.code : 'internal';
      const level = code === 'cancelled' ? 'info' : known ? 'warn' : 'error';
      llmLog[level](
        {
          outcome: code, ms, stopReason: e.apiMessage?.stop_reason, usage: usageOf(e.apiMessage),
          ...(known ? { detail: e.message } : { err: e }),
          ...(config.logPrompts || code === 'invalid_json' ? { prompt, reply: e.text } : {}),
        },
        `${ctx.kind} call failed: ${code}`,
      );
      if (res.writableEnded || req.socket.destroyed) return;
      res.status(known ? e.status : 500).json({ error: { code, message: known ? e.message : 'Internal server error' } });
    }
  });

  // Order records from the game: the full record goes to logs/orders.jsonl, a summary to the server log.
  app.post('/api/orders', async (req, res) => {
    const rec = req.body;
    if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string') {
      return res.status(400).json({ error: { code: 'bad_request', message: 'id is required' } });
    }
    const entry = { receivedAt: new Date().toISOString(), ...rec };
    await appendOrder(entry);
    if (rec.after10s) {
      req.log.debug({ event: 'order.after10s', orderId: rec.id }, 'order follow-up');
    } else {
      req.log.info(
        {
          event: 'order', orderId: rec.id, session: rec.session, n: rec.n, text: str(rec.text, 300), source: rec.source,
          path: rec.path, routedTo: rec.routedTo, ok: rec.ok, totalMs: rec.totalMs, gameTime: rec.gameTime,
        },
        `order ${rec.n}: ${rec.path} ${rec.ok ? 'ok' : 'failed'}`,
      );
    }
    res.status(204).end();
  });

  // Browser-side errors, so a broken frontend shows up in the same log.
  app.post('/api/client-log', (req, res) => {
    const b = req.body || {};
    req.log.warn(
      { event: 'client.error', kind: str(b.kind, 32), message: str(b.message, 2000), stack: str(b.stack, 4000), where: str(b.where, 300) },
      `browser ${str(b.kind, 32) || 'error'}: ${str(b.message, 200)}`,
    );
    res.status(204).end();
  });

  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'No such endpoint' } }));
  app.use(express.static(path.join(config.root, 'web')));

  return app;
}
