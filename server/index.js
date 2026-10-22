import { config } from './config.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { attachStt } from './stt.js';

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  logger.info(
    { event: 'server.start', url: `http://${config.host}:${config.port}`, model: config.model, stt: config.openaiKey ? config.sttModel : false, effort: config.effort, llm: Boolean(config.apiKey), logDir: config.logDir },
    `Shotcaller running at http://${config.host}:${config.port}`,
  );
  if (!config.openaiKey) logger.info({ event: 'server.no_stt_key' }, 'OPENAI_API_KEY is not set: voice falls back to the browser\'s speech recognition.');
  if (!config.apiKey) logger.warn({ event: 'server.no_api_key' }, 'ANTHROPIC_API_KEY is not set: only instant-path orders will work. Copy .env.example to .env and add your key.');
});
attachStt(server);

const stop = (signal) => {
  logger.info({ event: 'server.stop', signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
