import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode } from '@still-with-you/contracts';

/**
 * Contribution routes (STUBBED - TODO: Implement)
 * POST /v1/events/:id/contributions
 * PATCH /v1/contributions/:id
 * POST /v1/contributions/:id/trash
 * POST /v1/contributions/:id/restore
 * DELETE /v1/contributions/:id
 */
const contributionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { id: string } }>('/events/:id/contributions', async (_request, _reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement create contribution', 501);
  });

  fastify.patch<{ Params: { id: string } }>('/contributions/:id', async (_request, _reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement update contribution', 501);
  });

  fastify.post<{ Params: { id: string } }>('/contributions/:id/trash', async (_request, _reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement trash contribution', 501);
  });

  fastify.post<{ Params: { id: string } }>('/contributions/:id/restore', async (_request, _reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement restore contribution', 501);
  });

  fastify.delete<{ Params: { id: string } }>('/contributions/:id', async (_request, _reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement purge contribution', 501);
  });
};

export default contributionRoutes;
