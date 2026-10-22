import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Writable } from 'node:stream';
import pino from 'pino';
import { WebSocket, WebSocketServer } from 'ws';

// A stand-in for OpenAI's realtime transcription socket: records what the proxy sends and
// answers each commit with a committed event, one delta and a completed transcript.
const seen = [];
let auth;
const fake = new WebSocketServer({ port: 0, host: '127.0.0.1' });
fake.on('connection', (ws, req) => {
  auth = req.headers.authorization;
  let n = 0;
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    seen.push(m);
    if (m.type === 'input_audio_buffer.commit') {
      const item = `item_${++n}`;
      ws.send(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: item }));
      ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: item, delta: 'Brakka ' }));
      ws.send(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: item, transcript: 'Brakka push mid' }));
    }
  });
});

const lines = [];
let server;
let url;
before(async () => {
  await new Promise((r) => fake.once('listening', r));
  process.env.OPENAI_API_KEY = 'sk-test';
  process.env.OPENAI_REALTIME_URL = `ws://127.0.0.1:${fake.address().port}`;
  process.env.LOG_DIR = 'logs/test';
  const { attachStt } = await import('../server/stt.js');
  const sink = new Writable({ write(chunk, _e, cb) { lines.push(JSON.parse(chunk)); cb(); } });
  server = http.createServer();
  attachStt(server, { log: pino({ level: 'debug' }, sink) });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `ws://127.0.0.1:${server.address().port}/api/stt`;
});
after(() => { server.close(); fake.close(); });

function open(headers) {
  const ws = new WebSocket(url, { headers });
  const msgs = [];
  const waiters = [];
  ws.on('message', (d) => { msgs.push(JSON.parse(d)); waiters.splice(0).forEach((w) => w()); });
  const next = async (type) => {
    for (;;) {
      const i = msgs.findIndex((m) => m.type === type);
      if (i >= 0) return msgs.splice(i, 1)[0];
      await new Promise((r) => waiters.push(r));
    }
  };
  return { ws, next, ready: new Promise((r, j) => { ws.once('open', r); ws.once('error', j); }) };
}

test('relays audio to OpenAI and returns the final transcript for each commit', async () => {
  const c = open();
  await c.ready;
  c.ws.send(JSON.stringify({ type: 'config', keywords: ['Brakka', 'Ly<ra>', 'Brakka', 'two\nlines'], prompt: 'Orders to heroes' }));
  await c.next('ready');
  const audio = Buffer.alloc(24000 * 2 * 0.5, 1); // half a second of PCM16
  c.ws.send(audio);
  c.ws.send(JSON.stringify({ type: 'commit', id: 't1' }));
  const delta = await c.next('delta');
  assert.equal(delta.text, 'Brakka ');
  const fin = await c.next('final');
  assert.equal(fin.id, 't1');
  assert.equal(fin.text, 'Brakka push mid');
  assert.equal(typeof fin.ms, 'number');

  assert.equal(auth, 'Bearer sk-test');
  const update = seen.filter((m) => m.type === 'session.update').at(-1);
  assert.equal(update.session.type, 'transcription');
  const input = update.session.audio.input;
  assert.deepEqual(input.format, { type: 'audio/pcm', rate: 24000 });
  assert.equal(input.turn_detection, null);
  assert.equal(input.transcription.model, 'gpt-live-transcribe');
  assert.deepEqual(input.transcription.keywords, ['Brakka', 'Ly ra', 'two lines']);
  assert.equal(input.transcription.prompt, 'Orders to heroes');
  const appended = seen.filter((m) => m.type === 'input_audio_buffer.append').map((m) => Buffer.from(m.audio, 'base64').length);
  assert.equal(appended.reduce((a, b) => a + b, 0), audio.length);
  assert.ok(lines.some((l) => l.event === 'stt' && l.outcome === 'ok' && l.text === 'Brakka push mid'));
  c.ws.close();
});

test('a commit with almost no audio answers empty without calling OpenAI', async () => {
  const c = open();
  await c.ready;
  await c.next('ready');
  const before = seen.filter((m) => m.type === 'input_audio_buffer.commit').length;
  c.ws.send(Buffer.alloc(200));
  c.ws.send(JSON.stringify({ type: 'commit', id: 't9' }));
  const fin = await c.next('final');
  assert.deepEqual([fin.id, fin.text], ['t9', '']);
  assert.equal(seen.filter((m) => m.type === 'input_audio_buffer.commit').length, before);
  c.ws.close();
});

test('refuses a socket opened from another site', async () => {
  const c = open({ origin: 'https://evil.example' });
  await assert.rejects(c.ready);
});
