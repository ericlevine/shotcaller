import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { config } from './config.js';

fs.mkdirSync(config.logDir, { recursive: true });

// JSON lines to stdout (pipe through pino-pretty in dev) and to logs/server.log.
export const logger = pino(
  {
    level: config.logLevel,
    base: { app: 'shotcaller' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: ['apiKey', '*.apiKey', 'req.headers["x-api-key"]', 'req.headers.authorization'], censor: '[redacted]' },
  },
  pino.multistream([
    { level: config.logLevel, stream: process.stdout },
    { level: config.logLevel, stream: pino.destination({ dest: path.join(config.logDir, 'server.log'), mkdir: true, sync: false }) },
  ]),
);

// One JSON record per game order, for play-testing analysis.
const ordersFile = path.join(config.logDir, 'orders.jsonl');
export function appendOrder(record) {
  return fs.promises.appendFile(ordersFile, JSON.stringify(record) + '\n');
}
