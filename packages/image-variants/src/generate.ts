import sharp, { type Sharp } from 'sharp';
import {
  AVATAR_VARIANT,
  COVER_CARD_VARIANT,
  COVER_DETAIL_VARIANT,
  FULL_MAX_LONG_EDGE,
  PLACEHOLDER_LONG_EDGE,
  PLACEHOLDER_MAX_BYTES,
  type MediaVariantKind,
} from '@still-with-you/contracts';

export type EncodedImage = {
  body: Buffer;
  contentType: 'image/webp' | 'image/jpeg' | 'image/png';
  ext: 'webp' | 'jpg' | 'png';
  width: number;
  height: number;
};

export type GeneratedFile = EncodedImage & { kind: MediaVariantKind };

export type GeneratedVariants = {
  placeholderDataUrl: string | null;
  placeholderBytes: number;
  original: EncodedImage;
  files: GeneratedFile[];
};

const WEBP_DATA_PREFIX = 'data:image/webp;base64,';

function oriented(input: Buffer): Sharp {
  // rotate() applies EXIF orientation and drops the tag. Output has no metadata
  // unless withMetadata() is called — we never call it, so EXIF/GPS/XMP/ICC go away.
  return sharp(input, { failOn: 'none', sequentialRead: true }).rotate();
}

async function withSize(body: Buffer, contentType: EncodedImage['contentType'], ext: EncodedImage['ext']): Promise<EncodedImage> {
  const meta = await sharp(body).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('encoded image has no dimensions');
  }
  return { body, contentType, ext, width: meta.width, height: meta.height };
}

async function coverWebp(image: Sharp, width: number, height: number): Promise<EncodedImage> {
  const body = await image
    .clone()
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  return withSize(body, 'image/webp', 'webp');
}

export async function encodeJpeg(image: Sharp, quality = 82): Promise<EncodedImage> {
  const body = await image.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
  return withSize(body, 'image/jpeg', 'jpg');
}

export async function encodeFull(image: Sharp): Promise<EncodedImage> {
  const resized = image.clone().resize({
    width: FULL_MAX_LONG_EDGE,
    height: FULL_MAX_LONG_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  });
  try {
    const body = await resized.clone().webp({ quality: 82, effort: 4 }).toBuffer();
    return withSize(body, 'image/webp', 'webp');
  } catch {
    return encodeJpeg(resized, 82);
  }
}

async function encodeOriginal(image: Sharp, format: string | undefined): Promise<EncodedImage> {
  if (format === 'png') {
    const body = await image.clone().png().toBuffer();
    return withSize(body, 'image/png', 'png');
  }
  if (format === 'webp') {
    const body = await image.clone().webp({ quality: 90, effort: 4 }).toBuffer();
    return withSize(body, 'image/webp', 'webp');
  }
  const body = await image.clone().jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return withSize(body, 'image/jpeg', 'jpg');
}

async function encodePlaceholder(image: Sharp): Promise<{ dataUrl: string; bytes: number } | null> {
  let edge = PLACEHOLDER_LONG_EDGE;
  let quality = 40;
  for (let i = 0; i < 10; i += 1) {
    const body = await image
      .clone()
      .resize(edge, edge, { fit: 'inside' })
      .webp({ quality, alphaQuality: quality, effort: 6, smartSubsample: true })
      .toBuffer();
    if (body.length <= PLACEHOLDER_MAX_BYTES) {
      return { dataUrl: `${WEBP_DATA_PREFIX}${body.toString('base64')}`, bytes: body.length };
    }
    if (quality > 15) {
      quality -= 10;
    } else if (edge > 8) {
      edge -= 4;
      quality = 30;
    } else {
      return null;
    }
  }
  return null;
}

export async function generateImageVariants(input: Buffer): Promise<GeneratedVariants> {
  const image = oriented(input);
  const meta = await image.clone().metadata();
  if (!meta.width || !meta.height) {
    throw new Error('image has no dimensions');
  }

  const [placeholder, original, avatar, coverCard, coverDetail, full] = await Promise.all([
    encodePlaceholder(image),
    encodeOriginal(image, meta.format),
    coverWebp(image, AVATAR_VARIANT.width, AVATAR_VARIANT.height),
    coverWebp(image, COVER_CARD_VARIANT.width, COVER_CARD_VARIANT.height),
    coverWebp(image, COVER_DETAIL_VARIANT.width, COVER_DETAIL_VARIANT.height),
    encodeFull(image),
  ]);

  return {
    placeholderDataUrl: placeholder?.dataUrl ?? null,
    placeholderBytes: placeholder?.bytes ?? 0,
    original,
    files: [
      { kind: 'avatar', ...avatar },
      { kind: 'cover_card', ...coverCard },
      { kind: 'cover_detail', ...coverDetail },
      { kind: 'full', ...full },
    ],
  };
}

export async function createTestJpeg(options?: {
  width?: number;
  height?: number;
  orientation?: 1 | 3 | 6 | 8;
  background?: { r: number; g: number; b: number };
}): Promise<Buffer> {
  const width = options?.width ?? 400;
  const height = options?.height ?? 200;
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: options?.background ?? { r: 200, g: 40, b: 40 },
    },
  }).jpeg({ quality: 90 });
  if (options?.orientation && options.orientation !== 1) {
    return pipeline.withMetadata({ orientation: options.orientation }).toBuffer();
  }
  return pipeline.toBuffer();
}

/** Insert a dummy APP1 EXIF segment that contains a GPS marker, for strip tests. */
export function jpegWithFakeGpsExif(jpeg: Buffer): Buffer {
  const payload = Buffer.from('Exif\0\0GPSLatitude\0GPSLongitude\0');
  const app1 = Buffer.alloc(4 + payload.length);
  app1[0] = 0xff;
  app1[1] = 0xe1;
  app1.writeUInt16BE(payload.length + 2, 2);
  payload.copy(app1, 4);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

export function jpegHasExifApp1(body: Buffer): boolean {
  return body.includes(Buffer.from([0xff, 0xe1]));
}

export function jpegHasGpsMarker(body: Buffer): boolean {
  return body.includes(Buffer.from('GPSLatitude'));
}
