import { FastifyPluginAsync } from 'fastify';
import { AppError, ErrorCode } from '@still-with-you/contracts';

/**
 * Event routes (STUBBED - TODO: Implement)
 * POST /v1/families/:fid/events
 * GET /v1/families/:fid/events
 * GET /v1/events/:id
 * PATCH /v1/events/:id
 * POST /v1/events/:id/archive
 * POST /v1/events/:id/unarchive
 * POST /v1/events/:id/delete
 */
const eventRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { fid: string } }>('/families/:fid/events', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement create event', 501);
  });

  fastify.get<{ Params: { fid: string } }>('/families/:fid/events', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement list events', 501);
  });

  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement get event', 501);
  });

  fastify.patch<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement update event', 501);
  });

  fastify.post<{ Params: { id: string } }>('/events/:id/archive', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement archive event', 501);
  });

  fastify.post<{ Params: { id: string } }>('/events/:id/unarchive', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement unarchive event', 501);
  });

  fastify.post<{ Params: { id: string } }>('/events/:id/delete', async (request, reply) => {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'TODO: Implement delete event', 501);
  });
};

export default eventRoutes;
