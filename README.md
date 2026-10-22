# Shotcaller

A voice-commanded 4v4 arena game. You are the shotcaller: give orders by voice or text, and each hero is a Claude agent that turns your order into a behaviour for its autopilot. Simple orders ("Vex go mid", "everyone back") take an instant regex path that never calls the model.

The browser runs the game. A small Node server serves it, makes every Claude API call with a key it reads from the environment, and writes structured logs.

## Run it

You need Node 20 or newer.

```sh
cp .env.example .env        # then put your key in ANTHROPIC_API_KEY
npm install
npm run dev                 # pretty logs, restarts on server changes
```

Open http://127.0.0.1:8787. Chrome gives the best voice recognition; typed orders work everywhere.

`npm start` runs the same server with raw JSON logs on stdout. Without a key the game still runs, but only instant-path orders work and the Settings panel says so.

## Layout

```
server/
  index.js     starts the HTTP server
  app.js       routes: /api/health, /api/llm, /api/orders, /api/client-log, static files from web/
  llm.js       the Claude API call (official SDK), JSON parsing, error mapping
  logger.js    pino logger (stdout + logs/server.log) and logs/orders.jsonl
  config.js    reads .env / environment variables
web/
  index.html   page markup
  styles.css
  game.js      the game: simulation, rendering, voice, router and hero prompts
  client-log.js  forwards uncaught browser errors to the server log
test/          node:test suite (fake Claude API, no key or network needed)
```

The prompts are still built in `web/game.js`, next to the game state they describe. The browser posts each prompt to `/api/llm` with a tag (`router`, `agent` or `batch`, plus order number and heroes), and the server calls Claude and returns the parsed JSON. The browser never sees the API key.

## Configuration

All settings come from environment variables, usually via `.env` (gitignored; never commit it).

| Variable | Default | Meaning |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Required for the router and hero agents |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | Model for every call |
| `ANTHROPIC_EFFORT` | `low` | `low`, `medium` or `high`; low keeps orders fast |
| `LLM_MAX_TOKENS` | `2000` | Per-call output cap |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Where the server listens |
| `LOG_LEVEL` | `info` | `debug` also logs every prompt and reply |
| `LOG_PROMPTS` | `false` | `true` logs prompts and replies at info level |
| `LOG_DIR` | `logs` | Where log files go |

## Logs

Everything is JSON lines, so `jq` works on all of it.

- **`logs/server.log`** (also stdout): one line per API request, plus:
  - `event: "llm.call"`: kind, order number, session, heroes, model, latency (`ms`), `usage` (input, output and cache tokens), `stopReason`, `outcome` (`ok`, `rate_limited`, `auth_failed`, `invalid_json`, `cancelled`, ...). A reply with no JSON is logged with the prompt and reply text.
  - `event: "order"`: a summary of each order (text, path taken, heroes routed, success, total time).
  - `event: "client.error"`: uncaught errors from the browser.
- **`logs/orders.jsonl`**: the full record of every order: game state before, router output, each agent's directive, and a follow-up `after10s` record showing what the heroes were doing ten seconds later.

Every API response carries an `x-request-id` header that matches `req.id` in the log.

Some useful queries:

```sh
# every model call with latency and tokens
jq -c 'select(.event=="llm.call") | {kind, order, heroes, ms, usage, outcome}' logs/server.log

# failed model calls only
jq -c 'select(.event=="llm.call" and .outcome!="ok")' logs/server.log

# total tokens this log
jq -s '[.[] | select(.event=="llm.call") | .usage.input + .usage.output] | add' logs/server.log

# orders that failed
jq -c 'select(.ok==false and .after10s==null) | {id, text, path, result}' logs/orders.jsonl
```

## Tests

```sh
npm test
```

The tests run the real SDK against a fake Claude API on localhost, so they need no key and spend nothing.

## Debug hooks

`window.__shotcaller` in the browser console exposes the game state and functions (`S`, `step`, `fastParse`, `runCommand`, `applyDirective`, the prompt builders), which also makes headless Playwright testing easy.
