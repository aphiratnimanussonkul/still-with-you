import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError, ErrorCode, errorMessages } from '@still-with-you/contracts';
import { ZodError } from 'zod';

/**
 * Error handler plugin
 * Formats errors according to the API contract
 */
const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: any, request, reply) => {
    // Handle AppError (our custom errors)
    if (error instanceof AppError) {
      return reply.status(error.statusCode || 500).send(error.toJSON());
    }

    // Handle database custom error codes
    if (error.code === 'P0L01') {
      // Last admin constraint violation
      return reply.status(409).send({
        error: {
          code: ErrorCode.LAST_ADMIN,
          message: errorMessages[ErrorCode.LAST_ADMIN],
        },
      });
    }

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const firstError = error.errors[0];
      return reply.status(400).send({
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: firstError.message,
          field: firstError.path.join('.'),
        },
      });
    }

    // Handle Fastify validation errors
    if (error.validation) {
      const firstError = error.validation[0];
      return reply.status(400).send({
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: firstError.message || 'Validation failed',
          field: firstError.instancePath?.slice(1) || firstError.params?.missingProperty,
        },
      });
    }

    // Log unexpected errors
    fastify.log.error({ error, request: { url: request.url, method: request.method } }, 'Unhandled error');

    // Return generic error
    return reply.status(500).send({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: process.env.NODE_ENV === 'development' ? error.message : errorMessages[ErrorCode.INTERNAL_ERROR],
      },
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
