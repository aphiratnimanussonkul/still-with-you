import { useEffect, useId, useRef, useState } from 'react';
import { ImageIcon } from '@phosphor-icons/react/Image';
import { XIcon } from '@phosphor-icons/react/X';
import { Icon } from '@/components/ui/icon';
import { copy, interpolate } from '@/copy';
import { MEDIA_DEFAULTS, type MediaLimits } from '@/lib/media-config';
import { completeMediaUpload, createMediaUpload, putMediaFile } from '@/lib/media-uploads';
import { messageForError } from '@/lib/api-errors';
import { prepareImage } from '@/lib/prepare-image';
import { validatePhotoFiles } from '@/lib/validate-photos';

export type PhotoAttachState = {
  mediaIds: string[];
  isBusy: boolean;
};

type PhotoDraft = {
  clientId: string;
  previewUrl: string;
  blob: Blob;
  contentType: string;
  status: 'uploading' | 'ready' | 'failed';
  progress: number;
  mediaId?: string;
  error?: string;
};

type PhotoAttachProps = {
  familyId: string;
  onStateChange: (state: PhotoAttachState) => void;
  hint?: string;
};

function emit(photos: PhotoDraft[], onStateChange: (state: PhotoAttachState) => void) {
  onStateChange({
    mediaIds: photos.filter((photo) => photo.status === 'ready' && photo.mediaId).map((photo) => photo.mediaId!),
    isBusy: photos.some((photo) => photo.status === 'uploading'),
  });
}

export function PhotoAttach({ familyId, onStateChange, hint }: PhotoAttachProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [limits, setLimits] = useState<MediaLimits>(MEDIA_DEFAULTS);
  const [banner, setBanner] = useState<string | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    return () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    };
  }, []);

  function update(next: PhotoDraft[]) {
    photosRef.current = next;
    setPhotos(next);
    emit(next, onStateChange);
  }

  function patch(clientId: string, partial: Partial<PhotoDraft>) {
    const next = photosRef.current.map((photo) => (photo.clientId === clientId ? { ...photo, ...partial } : photo));
    update(next);
  }

  async function uploadDraft(draft: PhotoDraft) {
    try {
      patch(draft.clientId, { status: 'uploading', progress: 8, error: undefined });
      const session = await createMediaUpload(familyId, {
        content_type: draft.contentType,
        size_bytes: draft.blob.size,
      });
      setLimits({ maxBytes: session.max_bytes, maxPerStory: session.max_per_story });
      await putMediaFile(session.upload_url, draft.blob, draft.contentType, (percent) => {
        patch(draft.clientId, { progress: Math.max(10, Math.min(90, percent)) });
      });
      patch(draft.clientId, { progress: 95 });
      const completed = await completeMediaUpload(session.media_id);
      patch(draft.clientId, { status: 'ready', progress: 100, mediaId: completed.id });
    } catch (cause) {
      patch(draft.clientId, {
        status: 'failed',
        error: messageForError(cause) === copy['error.unknown'] ? copy['photo.upload.failed'] : messageForError(cause),
      });
    }
  }

  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const result = validatePhotoFiles(Array.from(fileList), photosRef.current.length, limits);
    if (!result.ok) {
      setBanner(result.message);
      return;
    }
    setBanner(null);

    for (const file of result.accepted) {
      const clientId = crypto.randomUUID();
      try {
        const prepared = await prepareImage(file);
        const draft: PhotoDraft = {
          clientId,
          previewUrl: prepared.previewUrl,
          blob: prepared.blob,
          contentType: prepared.contentType,
          status: 'uploading',
          progress: 0,
        };
        update([...photosRef.current, draft]);
        void uploadDraft(draft);
      } catch {
        setBanner(copy['error.UNSUPPORTED_TYPE']);
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(clientId: string) {
    const target = photosRef.current.find((photo) => photo.clientId === clientId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    update(photosRef.current.filter((photo) => photo.clientId !== clientId));
  }

  const readyCount = photos.filter((photo) => photo.status === 'ready').length;
  const showAdd = photos.length < limits.maxPerStory;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label font-medium">{copy['photo.label']}</p>
        <p className="text-caption text-muted-foreground">
          {interpolate(copy['photo.count'], {
            n: String(photos.length),
            max: String(limits.maxPerStory),
          })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div key={photo.clientId} className="relative aspect-square overflow-hidden rounded-[10px] bg-muted">
            <img src={photo.previewUrl} alt="" className="size-full object-cover" />
            {photo.status === 'uploading' ? (
              <div className="absolute inset-0 flex items-center justify-center bg-overlay text-caption text-primary-foreground">
                {photo.progress}%
              </div>
            ) : null}
            {photo.status === 'failed' ? (
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center bg-overlay px-2 text-center text-caption text-primary-foreground"
                onClick={() => void uploadDraft(photo)}
              >
                {copy['retry']}
              </button>
            ) : null}
            <button
              type="button"
              className="absolute top-0 right-0 flex size-11 items-center justify-center text-primary-foreground"
              aria-label={copy['a11y.remove_photo']}
              onClick={() => remove(photo.clientId)}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-overlay">
                <Icon as={XIcon} size={16} />
              </span>
            </button>
          </div>
        ))}

        {showAdd ? (
          <label
            htmlFor={inputId}
            className="flex min-h-24 min-w-24 cursor-pointer aspect-square flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-input text-muted-foreground"
          >
            <Icon as={ImageIcon} size={24} />
            <span className="sr-only">{copy['a11y.add_photo']}</span>
          </label>
        ) : null}
      </div>
      {hint ? <p className="text-caption text-muted-foreground">{hint}</p> : null}

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        className="sr-only"
        accept="image/*,.heic,.heif"
        multiple
        aria-label={copy['a11y.add_photo']}
        onChange={(event) => void addFiles(event.target.files)}
      />

      {readyCount > 0 ? (
        <p className="text-caption text-muted-foreground">
          {interpolate(copy['photo.upload.progress'], {
            เสร็จ: String(readyCount),
            ทั้งหมด: String(photos.length),
          })}
        </p>
      ) : null}
      {banner ? <p className="text-caption text-destructive">{banner}</p> : null}
    </div>
  );
}
