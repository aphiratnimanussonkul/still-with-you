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

    // Story check constraint (whitespace-only story that slipped past the client)
    if (error.code === '23514' && String(error.constraint_name || error.message || '').includes('story')) {
      return reply.status(400).send({
        error: {
          code: ErrorCode.STORY_REQUIRED,
          message: errorMessages[ErrorCode.STORY_REQUIRED],
          field: 'story',
        },
      });
    }

    if (error.code === '23505') {
      const constraint = String(error.constraint_name || error.constraint || error.message || '');
      if (constraint.includes('person_relationships') || constraint.includes('person_id_related_person_id')) {
        return reply.status(409).send({
          error: {
            code: ErrorCode.RELATIONSHIP_EXISTS,
            message: errorMessages[ErrorCode.RELATIONSHIP_EXISTS],
          },
        });
      }
      if (constraint.includes('people_family_account') || constraint.includes('invites_person_pending')) {
        return reply.status(409).send({
          error: {
            code: ErrorCode.PERSON_ALREADY_LINKED,
            message: errorMessages[ErrorCode.PERSON_ALREADY_LINKED],
          },
        });
      }
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
      const field = firstError.path.join('.');
      if (field === 'story') {
        return reply.status(400).send({
          error: {
            code: ErrorCode.STORY_REQUIRED,
            message: errorMessages[ErrorCode.STORY_REQUIRED],
            field: 'story',
          },
        });
      }
      if (field === 'answer_text') {
        return reply.status(400).send({
          error: {
            code: ErrorCode.ANSWER_REQUIRED,
            message: errorMessages[ErrorCode.ANSWER_REQUIRED],
            field: 'answer_text',
          },
        });
      }
      if (field === 'display_name' || field === 'name') {
        return reply.status(400).send({
          error: {
            code: ErrorCode.NAME_REQUIRED,
            message: errorMessages[ErrorCode.NAME_REQUIRED],
            field,
          },
        });
      }
      if (field === 'version') {
        return reply.status(400).send({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: errorMessages[ErrorCode.VALIDATION_ERROR],
            field: 'version',
          },
        });
      }
      return reply.status(400).send({
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: firstError.message,
          field,
        },
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: errorMessages[ErrorCode.RATE_LIMITED],
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

  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      error: {
        code: ErrorCode.NOT_FOUND,
        message: 'Route not found',
      },
    });
  });
};

export default fp(errorHandlerPlugin, {
  name: 'error-handler',
});
