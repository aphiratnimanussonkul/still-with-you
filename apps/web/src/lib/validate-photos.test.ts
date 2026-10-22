import { describe, expect, it } from 'vitest';
import { copy, interpolate } from '@/copy';
import { MEDIA_DEFAULTS, maxMb } from '@/lib/media-config';
import { validatePhotoFiles } from '@/lib/validate-photos';

function photo(name: string, type: string, size = 1024): File {
  const file = new File([new Uint8Array(8)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validatePhotoFiles', () => {
  it('accepts jpeg/png/webp/heic under the shared limits', () => {
    const incoming = [
      photo('a.jpg', 'image/jpeg'),
      photo('b.png', 'image/png'),
      photo('c.webp', 'image/webp'),
      photo('d.heic', 'image/heic'),
    ];
    const result = validatePhotoFiles(incoming, 0);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.accepted).toHaveLength(4);
  });

  it('rejects over the per-story count with TOO_MANY_PHOTOS', () => {
    const incoming = Array.from({ length: MEDIA_DEFAULTS.maxPerStory + 1 }, (_, index) =>
      photo(`${index}.jpg`, 'image/jpeg')
    );
    const result = validatePhotoFiles(incoming, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        interpolate(copy['error.TOO_MANY_PHOTOS'], { max: String(MEDIA_DEFAULTS.maxPerStory) })
      );
    }
  });

  it('rejects a leftover slot overflow when photos are already attached', () => {
    const result = validatePhotoFiles([photo('x.jpg', 'image/jpeg')], MEDIA_DEFAULTS.maxPerStory);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        interpolate(copy['error.TOO_MANY_PHOTOS'], { max: String(MEDIA_DEFAULTS.maxPerStory) })
      );
    }
  });

  it('rejects an oversized file with FILE_TOO_LARGE', () => {
    const result = validatePhotoFiles(
      [photo('big.jpg', 'image/jpeg', MEDIA_DEFAULTS.maxBytes + 1)],
      0
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(
        interpolate(copy['error.FILE_TOO_LARGE'], { max_mb: maxMb(MEDIA_DEFAULTS.maxBytes) })
      );
    }
  });

  it('rejects a non-image with UNSUPPORTED_TYPE', () => {
    const result = validatePhotoFiles([photo('notes.pdf', 'application/pdf')], 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(copy['error.UNSUPPORTED_TYPE']);
  });
});
