import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);
const app = await buildApp({ db, corsOrigins: config.corsOrigins, logger: true });
await app.listen({ port: config.port, host: '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => db.end()).then(() => process.exit(0));
  });
}
