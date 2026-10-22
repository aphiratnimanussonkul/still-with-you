import { ALLOWED_MEDIA_TYPES } from '@still-with-you/contracts';

export type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readFourCC(buf: Buffer, offset: number): string {
  return buf.subarray(offset, offset + 4).toString('ascii');
}

export function detectImageType(body: Buffer): AllowedMediaType | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
    return 'image/jpeg';
  }
  if (body.length >= 8 && body.subarray(0, 8).equals(PNG_SIG)) {
    return 'image/png';
  }
  if (
    body.length >= 12 &&
    readFourCC(body, 0) === 'RIFF' &&
    readFourCC(body, 8) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (body.length >= 12 && readFourCC(body, 4) === 'ftyp') {
    const brand = readFourCC(body, 8).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'miaf'].includes(brand)) {
      return 'image/heic';
    }
  }
  return null;
}

export function isAllowedMediaType(value: string): value is AllowedMediaType {
  return (ALLOWED_MEDIA_TYPES as readonly string[]).includes(value);
}

export function readImageSize(body: Buffer, type: AllowedMediaType): { width: number; height: number } | null {
  try {
    if (type === 'image/png' && body.length >= 24) {
      return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
    }
    if (type === 'image/jpeg') {
      return readJpegSize(body);
    }
    if (type === 'image/webp') {
      return readWebpSize(body);
    }
  } catch {
    return null;
  }
  return null;
}

function readJpegSize(body: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < body.length) {
    if (body[offset] !== 0xff) {
      return null;
    }
    const marker = body[offset + 1];
    const size = body.readUInt16BE(offset + 2);
    // SOF0 / SOF2
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: body.readUInt16BE(offset + 5), width: body.readUInt16BE(offset + 7) };
    }
    offset += 2 + size;
  }
  return null;
}

function readWebpSize(body: Buffer): { width: number; height: number } | null {
  if (body.length < 30) return null;
  const chunk = readFourCC(body, 12);
  if (chunk === 'VP8X' && body.length >= 30) {
    const width = 1 + body[24] + (body[25] << 8) + (body[26] << 16);
    const height = 1 + body[27] + (body[28] << 8) + (body[29] << 16);
    return { width, height };
  }
  if (chunk === 'VP8 ' && body.length >= 30) {
    return { width: body.readUInt16LE(26) & 0x3fff, height: body.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** Strip JPEG APP1 (EXIF/GPS) segments. Other types are returned unchanged. */
export function stripJpegExif(body: Buffer): Buffer {
  if (body.length < 4 || body[0] !== 0xff || body[1] !== 0xd8) {
    return body;
  }
  const parts: Buffer[] = [body.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= body.length) {
    if (body[offset] !== 0xff) {
      parts.push(body.subarray(offset));
      break;
    }
    const marker = body[offset + 1];
    if (marker === 0xda) {
      parts.push(body.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      parts.push(body.subarray(offset, offset + 2));
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(body.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const size = body.readUInt16BE(offset + 2);
    const next = offset + 2 + size;
    if (marker !== 0xe1) {
      parts.push(body.subarray(offset, next));
    }
    offset = next;
  }
  return Buffer.concat(parts);
}
