import { copy, interpolate } from '@/copy';
import { MEDIA_DEFAULTS, isAllowedPhotoFile, maxMb, type MediaLimits } from '@/lib/media-config';

export type PhotoValidation =
  | { ok: true; accepted: File[] }
  | { ok: false; message: string; accepted: File[] };

export function validatePhotoFiles(
  incoming: File[],
  alreadyCount: number,
  limits: MediaLimits = MEDIA_DEFAULTS
): PhotoValidation {
  const remaining = Math.max(0, limits.maxPerStory - alreadyCount);
  if (incoming.length > remaining) {
    return {
      ok: false,
      message: interpolate(copy['error.TOO_MANY_PHOTOS'], { max: String(limits.maxPerStory) }),
      accepted: [],
    };
  }

  const accepted: File[] = [];
  for (const file of incoming) {
    if (!isAllowedPhotoFile(file)) {
      return { ok: false, message: copy['error.UNSUPPORTED_TYPE'], accepted: [] };
    }
    if (file.size > limits.maxBytes) {
      return {
        ok: false,
        message: interpolate(copy['error.FILE_TOO_LARGE'], { max_mb: maxMb(limits.maxBytes) }),
        accepted: [],
      };
    }
    accepted.push(file);
  }

  return { ok: true, accepted };
}
