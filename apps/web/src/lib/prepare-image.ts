import { MEDIA_DEFAULTS } from '@/lib/media-config';

export type PreparedImage = {
  blob: Blob;
  contentType: 'image/webp' | 'image/jpeg';
  previewUrl: string;
  width: number;
  height: number;
};

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('encode'));
      },
      type,
      quality
    );
  });
}

/** Resize to long edge <= 2048 and encode WebP (JPEG fallback). Canvas encode strips EXIF. */
export async function prepareImage(file: File, longEdge = MEDIA_DEFAULTS.longEdgePx): Promise<PreparedImage> {
  const image = await loadImage(file);
  const scale = Math.min(1, longEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('encode');
  context.drawImage(image, 0, 0, width, height);

  let blob: Blob;
  let contentType: PreparedImage['contentType'] = 'image/webp';
  try {
    blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    if (blob.type !== 'image/webp') throw new Error('encode');
  } catch {
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    contentType = 'image/jpeg';
  }

  return {
    blob,
    contentType,
    previewUrl: URL.createObjectURL(blob),
    width,
    height,
  };
}
