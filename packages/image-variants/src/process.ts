import {
  MEDIA_VARIANT_KINDS,
  type MediaVariantKind,
} from '@still-with-you/contracts';
import { generateImageVariants } from './generate.js';

export function variantStorageKey(
  familyId: string,
  mediaId: string,
  kind: MediaVariantKind,
  ext: string
): string {
  return `${familyId}/${mediaId}/${kind}.${ext}`;
}

export function coverCardStorageKey(familyId: string, mediaId: string): string {
  return variantStorageKey(familyId, mediaId, 'cover_card', 'webp');
}

export type ProcessStoredMediaInput = {
  familyId: string;
  mediaId: string;
  storageKey: string;
  existingPlaceholder: string | null;
  existingKinds: readonly MediaVariantKind[];
  download: () => Promise<Buffer | null>;
  upload: (key: string, body: Buffer, contentType: string) => Promise<void>;
};

export type InsertedVariant = {
  kind: MediaVariantKind;
  storageKey: string;
  contentType: string;
  width: number;
  height: number;
  sizeBytes: number;
};

export type ProcessStoredMediaResult =
  | { status: 'skipped' }
  | { status: 'failed'; reason: 'missing_object' | 'invalid_image'; error?: string }
  | {
      status: 'processed';
      placeholderDataUrl: string | null;
      original: { contentType: string; width: number; height: number };
      inserted: InsertedVariant[];
      thumbKey: string;
      wroteOriginal: boolean;
    };

export async function processStoredMedia(input: ProcessStoredMediaInput): Promise<ProcessStoredMediaResult> {
  const existing = new Set(input.existingKinds);
  const needsPlaceholder = !input.existingPlaceholder;
  const missing = MEDIA_VARIANT_KINDS.filter((kind) => !existing.has(kind));
  if (!needsPlaceholder && missing.length === 0) {
    return { status: 'skipped' };
  }

  let body: Buffer | null;
  try {
    body = await input.download();
  } catch (error) {
    return { status: 'failed', reason: 'missing_object', error: String(error) };
  }
  if (!body) {
    return { status: 'failed', reason: 'missing_object' };
  }

  let generated: Awaited<ReturnType<typeof generateImageVariants>>;
  try {
    generated = await generateImageVariants(body);
  } catch (error) {
    return { status: 'failed', reason: 'invalid_image', error: String(error) };
  }

  const inserted: InsertedVariant[] = [];
  for (const file of generated.files) {
    if (existing.has(file.kind)) continue;
    const key = variantStorageKey(input.familyId, input.mediaId, file.kind, file.ext);
    await input.upload(key, file.body, file.contentType);
    inserted.push({
      kind: file.kind,
      storageKey: key,
      contentType: file.contentType,
      width: file.width,
      height: file.height,
      sizeBytes: file.body.length,
    });
  }

  const wroteOriginal = missing.length === MEDIA_VARIANT_KINDS.length;
  if (wroteOriginal) {
    await input.upload(input.storageKey, generated.original.body, generated.original.contentType);
  }

  return {
    status: 'processed',
    placeholderDataUrl: needsPlaceholder ? generated.placeholderDataUrl : input.existingPlaceholder,
    original: {
      contentType: generated.original.contentType,
      width: generated.original.width,
      height: generated.original.height,
    },
    inserted,
    thumbKey: coverCardStorageKey(input.familyId, input.mediaId),
    wroteOriginal,
  };
}
