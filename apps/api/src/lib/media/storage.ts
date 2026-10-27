import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MEDIA_READ_TTL_SECONDS, MEDIA_UPLOAD_TTL_SECONDS } from '@still-with-you/contracts';
import { env } from '../env.js';

export type StoredObject = {
  body: Buffer;
  contentType: string;
  size: number;
};

export type ImageTransform = {
  width?: number;
  height?: number;
  resize?: 'cover' | 'contain' | 'fill';
};

export interface MediaStorage {
  createSignedUploadUrl(
    key: string,
    expiresInSeconds?: number
  ): Promise<{ signedUrl: string; expiresAt: Date }>;
  createSignedReadUrl(
    key: string,
    expiresInSeconds?: number,
    transform?: ImageTransform
  ): Promise<{ signedUrl: string; expiresAt: Date }>;
  download(key: string): Promise<StoredObject | null>;
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export class MemoryMediaStorage implements MediaStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  reset() {
    this.objects.clear();
  }

  async createSignedUploadUrl(key: string, expiresInSeconds = MEDIA_UPLOAD_TTL_SECONDS) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    return {
      signedUrl: `https://media.test/upload/${encodeURIComponent(key)}?exp=${expiresAt.getTime()}`,
      expiresAt,
    };
  }

  async createSignedReadUrl(
    key: string,
    expiresInSeconds = MEDIA_READ_TTL_SECONDS,
    transform?: ImageTransform
  ) {
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const params = new URLSearchParams({ exp: String(expiresAt.getTime()) });
    if (transform?.width) params.set('width', String(transform.width));
    if (transform?.height) params.set('height', String(transform.height));
    if (transform?.resize) params.set('resize', transform.resize);
    return {
      signedUrl: `https://media.test/read/${encodeURIComponent(key)}?${params.toString()}`,
      expiresAt,
    };
  }

  async download(key: string): Promise<StoredObject | null> {
    const row = this.objects.get(key);
    if (!row) return null;
    return { body: row.body, contentType: row.contentType, size: row.body.length };
  }

  async upload(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async remove(keys: string[]) {
    for (const key of keys) {
      this.objects.delete(key);
    }
  }
}

class SupabaseMediaStorage implements MediaStorage {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(env.SUPABASE_URL, env.SWY_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createSignedUploadUrl(key: string, expiresInSeconds = MEDIA_UPLOAD_TTL_SECONDS) {
    const { data, error } = await this.client.storage.from(env.STORAGE_BUCKET).createSignedUploadUrl(key);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to create signed upload URL');
    }
    return {
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async createSignedReadUrl(
    key: string,
    expiresInSeconds = MEDIA_READ_TTL_SECONDS,
    transform?: ImageTransform
  ) {
    const { data, error } = await this.client.storage
      .from(env.STORAGE_BUCKET)
      .createSignedUrl(key, expiresInSeconds, transform ? { transform } : undefined);
    if (error || !data?.signedUrl) {
      throw new Error(error?.message || 'Failed to create signed read URL');
    }
    return {
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async download(key: string): Promise<StoredObject | null> {
    const { data, error } = await this.client.storage.from(env.STORAGE_BUCKET).download(key);
    if (error || !data) {
      return null;
    }
    const buf = Buffer.from(await data.arrayBuffer());
    return { body: buf, contentType: data.type || 'application/octet-stream', size: buf.length };
  }

  async upload(key: string, body: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(env.STORAGE_BUCKET).upload(key, body, {
      contentType,
      upsert: true,
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  async remove(keys: string[]) {
    const filtered = keys.filter(Boolean);
    if (filtered.length === 0) return;
    await this.client.storage.from(env.STORAGE_BUCKET).remove(filtered);
  }
}

export const memoryMediaStorage = new MemoryMediaStorage();

let override: MediaStorage | null = null;

export function setMediaStorage(storage: MediaStorage | null) {
  override = storage;
}

export function getMediaStorage(): MediaStorage {
  if (override) return override;
  if (process.env.NODE_ENV === 'test') return memoryMediaStorage;
  return new SupabaseMediaStorage();
}
