import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  AVATAR_VARIANT,
  COVER_CARD_VARIANT,
  COVER_DETAIL_VARIANT,
  FULL_MAX_LONG_EDGE,
  PLACEHOLDER_LONG_EDGE,
  PLACEHOLDER_MAX_BYTES,
  MEDIA_VARIANT_KINDS,
} from '@still-with-you/contracts';
import {
  createTestJpeg,
  encodeJpeg,
  generateImageVariants,
  jpegHasExifApp1,
  jpegHasGpsMarker,
  jpegWithFakeGpsExif,
  processStoredMedia,
  variantStorageKey,
} from './index.js';

async function meta(body: Buffer) {
  return sharp(body).metadata();
}

describe('generateImageVariants', () => {
  it('applies EXIF orientation so a 6-tag landscape becomes portrait', async () => {
    const landscape = await createTestJpeg({ width: 400, height: 200, orientation: 6 });
    const before = await meta(landscape);
    expect(before.orientation).toBe(6);
    expect(before.width).toBe(400);
    expect(before.height).toBe(200);

    const generated = await generateImageVariants(landscape);
    expect(generated.original.width).toBe(200);
    expect(generated.original.height).toBe(400);
    const after = await meta(generated.original.body);
    expect(after.orientation === undefined || after.orientation === 1).toBe(true);
    expect(after.width).toBe(200);
    expect(after.height).toBe(400);
  });

  it('strips EXIF and GPS from the original and every variant', async () => {
    const withGps = jpegWithFakeGpsExif(await createTestJpeg({ width: 320, height: 240, orientation: 6 }));
    expect(jpegHasExifApp1(withGps)).toBe(true);
    expect(jpegHasGpsMarker(withGps)).toBe(true);

    const generated = await generateImageVariants(withGps);
    const bodies = [generated.original.body, ...generated.files.map((file) => file.body)];
    for (const body of bodies) {
      expect(jpegHasGpsMarker(body)).toBe(false);
      const info = await meta(body);
      expect(info.exif).toBeUndefined();
      expect(info.icc).toBeUndefined();
      expect(info.xmp).toBeUndefined();
      expect(info.iptc).toBeUndefined();
      expect(info.orientation === undefined || info.orientation === 1).toBe(true);
    }
  });

  it('emits the contracted size for each variant and a ≤1KB placeholder', async () => {
    const src = await createTestJpeg({ width: 1600, height: 900 });
    const generated = await generateImageVariants(src);
    const byKind = Object.fromEntries(generated.files.map((file) => [file.kind, file]));

    expect(Object.keys(byKind).sort()).toEqual([...MEDIA_VARIANT_KINDS].sort());
    expect(byKind.avatar.width).toBe(AVATAR_VARIANT.width);
    expect(byKind.avatar.height).toBe(AVATAR_VARIANT.height);
    expect(byKind.avatar.contentType).toBe('image/webp');
    expect(byKind.cover_card.width).toBe(COVER_CARD_VARIANT.width);
    expect(byKind.cover_card.height).toBe(COVER_CARD_VARIANT.height);
    expect(byKind.cover_detail.width).toBe(COVER_DETAIL_VARIANT.width);
    expect(byKind.cover_detail.height).toBe(COVER_DETAIL_VARIANT.height);

    expect(Math.max(byKind.full.width, byKind.full.height)).toBeLessThanOrEqual(FULL_MAX_LONG_EDGE);
    expect(byKind.full.width).toBe(1600);
    expect(byKind.full.height).toBe(900);

    expect(generated.placeholderDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(generated.placeholderBytes).toBeGreaterThan(0);
    expect(generated.placeholderBytes).toBeLessThanOrEqual(PLACEHOLDER_MAX_BYTES);
    const b64 = generated.placeholderDataUrl!.slice('data:image/webp;base64,'.length);
    expect(Buffer.from(b64, 'base64').length).toBe(generated.placeholderBytes);
    const placeholderMeta = await meta(Buffer.from(b64, 'base64'));
    const longEdge = Math.max(placeholderMeta.width ?? 0, placeholderMeta.height ?? 0);
    expect(longEdge).toBeGreaterThan(0);
    expect(longEdge).toBeLessThanOrEqual(PLACEHOLDER_LONG_EDGE);
  });

  it('caps a huge source so the full variant long edge is 2048', async () => {
    const huge = await createTestJpeg({ width: 4000, height: 3000 });
    const generated = await generateImageVariants(huge);
    const full = generated.files.find((file) => file.kind === 'full')!;
    expect(Math.max(full.width, full.height)).toBe(FULL_MAX_LONG_EDGE);
    expect(full.width).toBe(2048);
    expect(full.height).toBe(1536);
  });

  it('can encode a stripped JPEG full image (fallback encoder)', async () => {
    const src = await createTestJpeg({ width: 120, height: 80, orientation: 6 });
    const jpeg = await encodeJpeg(sharp(src).rotate());
    expect(jpeg.contentType).toBe('image/jpeg');
    const info = await meta(jpeg.body);
    expect(info.format).toBe('jpeg');
    expect(info.exif).toBeUndefined();
    expect(info.orientation === undefined || info.orientation === 1).toBe(true);
    expect(jpeg.width).toBe(80);
    expect(jpeg.height).toBe(120);
  });
});

describe('processStoredMedia', () => {
  it('is idempotent: a second run skips existing variants', async () => {
    const src = await createTestJpeg({ width: 80, height: 60 });
    const objects = new Map<string, { body: Buffer; contentType: string }>();
    objects.set('fam/mid', { body: src, contentType: 'image/jpeg' });

    const upload = async (key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body: Buffer.from(body), contentType });
    };
    const download = async () => objects.get('fam/mid')?.body ?? null;

    const first = await processStoredMedia({
      familyId: 'fam',
      mediaId: 'mid',
      storageKey: 'fam/mid',
      existingPlaceholder: null,
      existingKinds: [],
      download,
      upload,
    });
    expect(first.status).toBe('processed');
    if (first.status !== 'processed') throw new Error('expected processed');
    expect(first.inserted.map((row) => row.kind).sort()).toEqual([...MEDIA_VARIANT_KINDS].sort());
    expect(first.wroteOriginal).toBe(true);
    const keysAfterFirst = [...objects.keys()].sort();

    const second = await processStoredMedia({
      familyId: 'fam',
      mediaId: 'mid',
      storageKey: 'fam/mid',
      existingPlaceholder: first.placeholderDataUrl,
      existingKinds: first.inserted.map((row) => row.kind),
      download,
      upload,
    });
    expect(second.status).toBe('skipped');
    expect([...objects.keys()].sort()).toEqual(keysAfterFirst);
  });

  it('re-run fills only the missing kind', async () => {
    const src = await createTestJpeg({ width: 80, height: 60 });
    const objects = new Map<string, { body: Buffer; contentType: string }>();
    objects.set('fam/mid', { body: src, contentType: 'image/jpeg' });
    const upload = async (key: string, body: Buffer, contentType: string) => {
      objects.set(key, { body: Buffer.from(body), contentType });
    };

    const first = await processStoredMedia({
      familyId: 'fam',
      mediaId: 'mid',
      storageKey: 'fam/mid',
      existingPlaceholder: null,
      existingKinds: [],
      download: async () => objects.get('fam/mid')?.body ?? null,
      upload,
    });
    expect(first.status).toBe('processed');
    if (first.status !== 'processed') throw new Error('expected processed');
    const avatarKey = variantStorageKey('fam', 'mid', 'avatar', 'webp');
    objects.delete(avatarKey);

    const third = await processStoredMedia({
      familyId: 'fam',
      mediaId: 'mid',
      storageKey: 'fam/mid',
      existingPlaceholder: first.placeholderDataUrl,
      existingKinds: first.inserted.filter((row) => row.kind !== 'avatar').map((row) => row.kind),
      download: async () => objects.get('fam/mid')?.body ?? null,
      upload,
    });
    expect(third.status).toBe('processed');
    if (third.status !== 'processed') throw new Error('expected processed');
    expect(third.inserted.map((row) => row.kind)).toEqual(['avatar']);
    expect(third.wroteOriginal).toBe(false);
    expect(objects.has(avatarKey)).toBe(true);
  });
});
