import { FastifyPluginAsync } from 'fastify';
import {
  AppError,
  ErrorCode,
  MEDIA_UPLOAD_TTL_SECONDS,
  createMediaUploadSchema,
} from '@still-with-you/contracts';
import { eq } from 'drizzle-orm';
import { db, media } from '../lib/db/index.js';
import { getActiveMember } from '../lib/authz.js';
import { env } from '../lib/env.js';
import { detectImageType, isAllowedMediaType } from '../lib/media/magic.js';
import { enqueueMediaProcess } from '../lib/media/jobs.js';
import { getMediaStorage } from '../lib/media/storage.js';
import crypto from 'crypto';

const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Params: { fid: string } }>('/families/:fid/media/uploads', async (request, reply) => {
    const { fid } = request.params;
    await getActiveMember(fid, request.user!.id);

    const body = createMediaUploadSchema.parse(request.body);
    if (!isAllowedMediaType(body.content_type)) {
      throw new AppError(ErrorCode.UNSUPPORTED_TYPE, 'This file type is not supported', 415, 'content_type');
    }
    if (body.size_bytes > env.MEDIA_MAX_BYTES) {
      throw new AppError(ErrorCode.FILE_TOO_LARGE, 'File size exceeds the maximum allowed', 413, 'size_bytes');
    }

    const id = crypto.randomUUID();
    const storageKey = `${fid}/${id}`;
    const signed = await getMediaStorage().createSignedUploadUrl(storageKey, MEDIA_UPLOAD_TTL_SECONDS);

    await db.insert(media).values({
      id,
      familyId: fid,
      uploaderAccountId: request.user!.id,
      storageKey,
      contentType: body.content_type,
      sizeBytes: body.size_bytes,
      status: 'pending',
      purpose: body.purpose ?? 'story',
    });

    return reply.status(201).send({
      media_id: id,
      upload_url: signed.signedUrl,
      expires_at: signed.expiresAt.toISOString(),
      max_bytes: env.MEDIA_MAX_BYTES,
      max_per_story: env.MEDIA_MAX_PER_CONTRIBUTION,
    });
  });

  fastify.post<{ Params: { media_id: string } }>('/media/:media_id/complete', async (request, reply) => {
    const { media_id } = request.params;
    const [row] = await db.select().from(media).where(eq(media.id, media_id)).limit(1);
    if (!row || row.deletedAt) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Media not found', 404);
    }
    if (row.uploaderAccountId !== request.user!.id) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only the uploader can complete this upload', 403);
    }
    if (row.status !== 'pending') {
      throw new AppError(ErrorCode.MEDIA_NOT_READY, 'Upload is not pending', 409, undefined, {
        media_ids: [row.id],
      });
    }

    const storage = getMediaStorage();
    const object = await storage.download(row.storageKey);

    const failMismatch = async () => {
      await storage.remove([row.storageKey]);
      await db.update(media).set({ status: 'failed' }).where(eq(media.id, row.id));
      throw new AppError(
        ErrorCode.UPLOAD_MISMATCH,
        'Uploaded object does not match the declared type or size',
        422
      );
    };

    if (!object) {
      await failMismatch();
    }

    const actual = object!;
    if (actual.size > env.MEDIA_MAX_BYTES || actual.size !== row.sizeBytes) {
      await failMismatch();
    }

    const detected = detectImageType(actual.body);
    if (!detected || detected !== row.contentType) {
      await failMismatch();
    }

    await db.update(media).set({ status: 'uploaded' }).where(eq(media.id, row.id));
    await enqueueMediaProcess(row.id);

    const [updated] = await db.select().from(media).where(eq(media.id, row.id)).limit(1);
    return reply.send({
      id: updated.id,
      status: updated.status,
      content_type: updated.contentType,
      size_bytes: updated.sizeBytes,
    });
  });
};

export default mediaRoutes;
