export const MEDIA_DEFAULTS = {
  maxPerStory: 20,
  maxBytes: 20 * 1024 * 1024, // 20971520; UI always prefers max_bytes / max_per_story from the API
  longEdgePx: 2048,
  acceptMime: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const,
} as const;

export type MediaLimits = {
  maxPerStory: number;
  maxBytes: number;
};

export function maxMb(maxBytes: number): string {
  return String(Math.round(maxBytes / (1024 * 1024)));
}

export function isAllowedPhotoFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if ((MEDIA_DEFAULTS.acceptMime as readonly string[]).includes(mime)) return true;
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}
