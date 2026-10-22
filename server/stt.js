import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { logger } from './logger.js';

// Speech-to-text proxy. The browser streams 24 kHz mono PCM16 to /api/stt and the server relays it to an
// OpenAI realtime transcription session, so the OpenAI key never reaches the page.
//
// Browser -> server:  binary frames of PCM16 audio
//                     {"type":"config","keywords":[...],"prompt":"..."}   once, before the first audio
//                     {"type":"commit","id":"t1"}                          end of an utterance
//                     {"type":"clear"}                                     drop uncommitted audio
// Server -> browser:  {"type":"ready"}
//                     {"type":"delta","item":"...","text":"..."}           partial text while speaking
//                     {"type":"final","id":"t1","text":"...","ms":123}     ms = commit to final transcript
//                     {"type":"error","code":"...","message":"..."}

export const SAMPLE_RATE = 24000;
const MIN_COMMIT_BYTES = SAMPLE_RATE * 2 * 0.1; // the API rejects commits under ~100 ms of audio
const MAX_KEYWORDS = 100;

export function cleanKeywords(list) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const k of list) {
    if (typeof k !== 'string') continue;
    // one line each, no angle brackets: the API rejects the whole session update otherwise
    const t = k.replace(/[<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (t) out.add(t);
    if (out.size >= MAX_KEYWORDS) break;
  }
  return [...out];
}

export function sessionUpdate({ keywords = [], prompt } = {}) {
  const transcription = { model: config.sttModel, languages: ['en'], delay: config.sttDelay };
  if (keywords.length) transcription.keywords = keywords;
  if (prompt) transcription.prompt = prompt;
  return {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: { input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, transcription, turn_detection: null } },
    },
  };
}

// WebSockets skip CORS, so without this any site open in the browser could spend the key.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // not a browser
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function attachStt(server, { log = logger } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://x').pathname !== '/api/stt') return socket.destroy();
    if (!sameOrigin(req)) {
      log.warn({ event: 'stt.rejected', origin: req.headers.origin }, 'speech socket from another origin refused');
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => handle(ws));
  });

  function handle(client) {
    const sid = crypto.randomUUID().slice(0, 8);
    const slog = log.child({ event: 'stt', stt: sid, model: config.sttModel });
    const send = (m) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(m)); };
    if (!config.openaiKey) {
      send({ type: 'error', code: 'no_api_key', message: 'OPENAI_API_KEY is not set on the server' });
      return client.close(1011, 'no key');
    }

    const upstream = new WebSocket(config.sttUrl, { headers: { Authorization: `Bearer ${config.openaiKey}` } });
    const queue = [];
    const up = (m) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(m)); else queue.push(m); };
    let configured = false;
    let pendingBytes = 0;
    let audioBytes = 0;
    const commits = [];        // client turns waiting for input_audio_buffer.committed
    const items = new Map();   // upstream item_id -> {id, t0, bytes}

    upstream.on('open', () => {
      slog.info('speech session open');
      // the browser normally configures first; if it didn't, start with defaults
      if (!configured) { configured = true; queue.unshift(sessionUpdate()); }
      for (const m of queue.splice(0)) upstream.send(JSON.stringify(m));
      send({ type: 'ready' });
    });
    upstream.on('unexpected-response', (_req, res) => {
      slog.warn({ outcome: `http_${res.statusCode}` }, `speech upstream refused: HTTP ${res.statusCode}`);
      send({ type: 'error', code: res.statusCode === 401 ? 'auth_failed' : `http_${res.statusCode}`, message: `OpenAI refused the connection (HTTP ${res.statusCode})` });
      client.close(1011, 'upstream refused');
      upstream.terminate();
    });
    upstream.on('error', (e) => {
      slog.warn({ outcome: 'upstream_error', detail: e.message }, 'speech upstream error');
      send({ type: 'error', code: 'upstream_unreachable', message: e.message });
      client.close(1011, 'upstream error');
    });
    upstream.on('close', (code) => {
      slog.info({ code, audioMs: Math.round((audioBytes / 2 / SAMPLE_RATE) * 1000) }, 'speech session closed');
      if (client.readyState === WebSocket.OPEN) client.close(1000, 'upstream closed');
    });

    upstream.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      switch (m.type) {
        case 'input_audio_buffer.committed': {
          const c = commits.shift();
          if (c) items.set(m.item_id, c);
          break;
        }
        case 'conversation.item.input_audio_transcription.delta':
          if (m.delta) send({ type: 'delta', item: m.item_id, text: m.delta });
          break;
        case 'conversation.item.input_audio_transcription.completed': {
          const c = items.get(m.item_id);
          items.delete(m.item_id);
          const ms = c ? Math.round(performance.now() - c.t0) : undefined;
          const text = m.transcript || '';
          slog.info({ outcome: 'ok', ms, audioMs: c && Math.round((c.bytes / 2 / SAMPLE_RATE) * 1000), text: text.slice(0, 300) }, `speech turn in ${ms}ms`);
          send({ type: 'final', id: c?.id, item: m.item_id, text, ms });
          break;
        }
        case 'conversation.item.input_audio_transcription.failed': {
          const c = items.get(m.item_id);
          items.delete(m.item_id);
          slog.warn({ outcome: 'failed', detail: m.error?.message }, 'speech turn failed');
          send({ type: 'final', id: c?.id, item: m.item_id, text: '', error: m.error?.message || 'transcription failed' });
          break;
        }
        case 'error':
          slog.warn({ outcome: 'api_error', code: m.error?.code, detail: m.error?.message }, `speech API error: ${m.error?.message}`);
          send({ type: 'error', code: m.error?.code || 'api_error', message: m.error?.message || 'Speech API error' });
          break;
      }
    });

    client.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!data.length) return;
        pendingBytes += data.length;
        audioBytes += data.length;
        up({ type: 'input_audio_buffer.append', audio: Buffer.from(data).toString('base64') });
        return;
      }
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (m.type === 'config') {
        // usually arrives before the upstream opens; if the defaults already went out, this replaces them
        configured = true;
        const prompt = typeof m.prompt === 'string' ? m.prompt.replace(/[\r\n]+/g, ' ').slice(0, 500) : undefined;
        up(sessionUpdate({ keywords: cleanKeywords(m.keywords), prompt }));
      } else if (m.type === 'commit') {
        const id = typeof m.id === 'string' ? m.id.slice(0, 32) : undefined;
        if (pendingBytes < MIN_COMMIT_BYTES) {
          // too short to transcribe: drop it and answer at once so the game isn't left waiting
          if (pendingBytes) up({ type: 'input_audio_buffer.clear' });
          pendingBytes = 0;
          send({ type: 'final', id, text: '', ms: 0 });
          return;
        }
        commits.push({ id, t0: performance.now(), bytes: pendingBytes });
        pendingBytes = 0;
        up({ type: 'input_audio_buffer.commit' });
      } else if (m.type === 'clear') {
        pendingBytes = 0;
        up({ type: 'input_audio_buffer.clear' });
      }
    });
    client.on('close', () => { if (upstream.readyState <= WebSocket.OPEN) upstream.close(); });
    client.on('error', () => upstream.terminate());
  }

  return wss;
}
