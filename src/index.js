import { app } from './app.js';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';

/**
 * Bootstraps the backend service:
 * 1. Checks and verifies that database migrations are up to date.
 * 2. Starts the HTTP listener on the configured port.
 */
async function bootstrap() {
  try {
    console.log('[Bootstrap] Initializing Invertio backend...');
    await runMigrations();

    app.listen(config.API_PORT, () => {
      console.log(`[Server] Invertio Backend API is listening on ${config.API_BASE_URL}`);
      console.log(`[Server] Swagger Documentation available at ${config.API_BASE_URL}/api/docs`);
    });
  } catch (err) {
    console.error('[Bootstrap] Fatal startup error:', err);
    process.exit(1);
  }
}

bootstrap();
