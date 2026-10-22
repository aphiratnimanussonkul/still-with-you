import { FastifyPluginAsync } from 'fastify';
import healthRoutes from './health.js';
import accountRoutes from './account.js';
import accountDeletionRoutes from './account-deletion.js';
import familyRoutes from './family.js';
import eventRoutes from './events.js';
import contributionRoutes from './contributions.js';
import mediaRoutes from './media.js';
import focusRoutes from './focus.js';
import factsRoutes from './facts.js';
import peopleRoutes from './people.js';

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
      await fastify.register(accountDeletionRoutes);
      await fastify.register(familyRoutes);
      await fastify.register(eventRoutes);
      await fastify.register(contributionRoutes);
      await fastify.register(mediaRoutes);
      await fastify.register(focusRoutes);
      await fastify.register(factsRoutes);
      await fastify.register(peopleRoutes);

      // TODO: Add routes for:
      // - /me/trash
      // - /me/notifications
      // - /notifications/:id/read
    },
    { prefix: '/v1' }
  );
};

export default routes;
