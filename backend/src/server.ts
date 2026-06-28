import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDb } from './db/index.js';
import { runner } from './runner/manager.js';
import { stopSampler } from './resources/sampler.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    try {
      stopSampler();
      runner.shutdown();
      await app.close();
      closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});
