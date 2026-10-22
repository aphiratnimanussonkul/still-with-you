import { AppError, ErrorCode } from '@still-with-you/contracts';

export function encodeEventCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

export function decodeEventCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep <= 0) {
      throw new Error('missing separator');
    }
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) {
      throw new Error('invalid cursor payload');
    }
    return { createdAt, id };
  } catch {
    throw new AppError(ErrorCode.INVALID_INPUT, 'Invalid cursor', 400, 'cursor');
  }
}
