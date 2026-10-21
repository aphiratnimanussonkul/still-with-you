import { FastifyPluginAsync } from 'fastify';
import healthRoutes from './health.js';
import accountRoutes from './account.js';
import familyRoutes from './family.js';
import eventRoutes from './events.js';
import contributionRoutes from './contributions.js';

/**
 * Register all API routes
 */
const routes: FastifyPluginAsync = async (fastify) => {
  // Health check (no /v1 prefix, no auth required)
  await fastify.register(healthRoutes);

  // API v1 routes (authenticated)
  await fastify.register(
    async (fastify) => {
      await fastify.register(accountRoutes);
      await fastify.register(familyRoutes);
      await fastify.register(eventRoutes);
      await fastify.register(contributionRoutes);

      // TODO: Add routes for:
      // - /uploads
      // - /me/trash
      // - /me/notifications
      // - /notifications/:id/read
    },
    { prefix: '/v1' }
  );
};

export default routes;
