import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Writable } from 'node:stream';
import pino from 'pino';

// A stand-in for the Anthropic API so the real SDK path runs without a key or network.
let upstreamReply = () => ({ status: 200, body: okMessage('{"heroes":["vex"]}') });
function okMessage(text, stop_reason = 'end_turn') {
  return { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason,
    content: [{ type: 'text', text }], usage: { input_tokens: 12, output_tokens: 5 } };
}
const upstream = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { status, body: out } = upstreamReply(JSON.parse(body));
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});

const lines = [];
let base;
let server;
before(async () => {
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.LOG_DIR = 'logs/test';
  const { createApp } = await import('../server/app.js');
  const sink = new Writable({ write(chunk, _e, cb) { lines.push(JSON.parse(chunk)); cb(); } });
  server = createApp({ log: pino({ level: 'debug' }, sink) }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); upstream.close(); });

const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('health reports the model and that a key is configured', async () => {
  const j = await (await fetch(base + '/api/health')).json();
  assert.equal(j.ok, true);
  assert.equal(j.llm, true);
  assert.equal(j.model, 'claude-haiku-5-5');
});

test('llm call returns parsed JSON and logs usage with order context', async () => {
  upstreamReply = (req) => {
    assert.equal(req.model, 'claude-haiku-5-5');
    assert.deepEqual(req.output_config, { effort: 'low' });
    return { status: 200, body: okMessage('Sure:\n```json\n{"mode":"push","lane":"mid"}\n```') };
  };
  const r = await post('/api/llm', { prompt: 'hi', kind: 'agent', order: 3, session: 's1', heroes: ['vex'] });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).result, { mode: 'push', lane: 'mid' });
  const log = lines.find((l) => l.event === 'llm.call' && l.outcome === 'ok');
  assert.equal(log.kind, 'agent');
  assert.equal(log.order, 3);
  assert.deepEqual(log.heroes, ['vex']);
  assert.equal(log.usage.input, 12);
  assert.ok(!JSON.stringify(lines).includes('sk-ant-test'), 'API key must never be logged');
});

test('upstream 401 maps to auth_failed', async () => {
  upstreamReply = () => ({ status: 401, body: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } });
  const r = await post('/api/llm', { prompt: 'hi', kind: 'router' });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error.code, 'auth_failed');
});

test('a reply with no JSON maps to invalid_json and logs the reply', async () => {
  upstreamReply = () => ({ status: 200, body: okMessage('I cannot do that') });
  const r = await post('/api/llm', { prompt: 'hi', kind: 'router' });
  assert.equal((await r.json()).error.code, 'invalid_json');
  assert.equal(lines.findLast((l) => l.outcome === 'invalid_json').reply, 'I cannot do that');
});

test('missing prompt is a 400', async () => {
  assert.equal((await post('/api/llm', { kind: 'router' })).status, 400);
});

test('order records are accepted and summarised in the log', async () => {
  const r = await post('/api/orders', { id: 's1-0001', session: 's1', n: 1, text: 'vex go mid', path: 'instant', ok: true, routedTo: ['vex'] });
  assert.equal(r.status, 204);
  assert.ok(lines.some((l) => l.event === 'order' && l.orderId === 's1-0001' && l.path === 'instant'));
});

test('the game page is served', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<script src="game.js">/);
});
