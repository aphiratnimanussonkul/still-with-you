import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { AppError, ErrorCode, errorMessages } from '@still-with-you/contracts';
import { env } from './lib/env.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import routes from './routes/index.js';

/**
 * Create and configure Fastify server
 */
async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register CORS (no credentials - using Bearer tokens only)
  await fastify.register(cors, {
    origin: [...env.WEB_ORIGIN],
    credentials: false,
  });

  // Register rate limiting
  await fastify.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    errorResponseBuilder: () =>
      new AppError(ErrorCode.RATE_LIMITED, errorMessages[ErrorCode.RATE_LIMITED], 429),
  });

  // Register error handler
  await fastify.register(errorHandlerPlugin);

  // Register auth plugin
  await fastify.register(authPlugin);

  // Register routes
  await fastify.register(routes);

  return fastify;
}

/**
 * Start server
 */
async function start() {
  try {
    const fastify = await buildServer();

    await fastify.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`🚀 API server listening on http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if not imported
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}

export { buildServer };
