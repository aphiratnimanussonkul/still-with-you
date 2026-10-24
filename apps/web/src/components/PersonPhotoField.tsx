import { useEffect, useId, useRef, useState } from 'react';
import { CameraIcon } from '@phosphor-icons/react/Camera';
import { Illustration } from '@/components/Illustration';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { completeMediaUpload, createMediaUpload, putMediaFile } from '@/lib/media-uploads';
import { messageForError } from '@/lib/api-errors';
import { prepareImage } from '@/lib/prepare-image';
import { validatePhotoFiles } from '@/lib/validate-photos';

type PersonPhotoFieldProps = {
  familyId: string;
  onReady: (mediaId: string | null, busy: boolean) => void;
};

export function PersonPhotoField({ familyId, onReady }: PersonPhotoFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function onPick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const checked = validatePhotoFiles([file], 0);
    if (!checked.ok) {
      setError(checked.message);
      onReady(null, false);
      return;
    }
    try {
      const prepared = await prepareImage(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(prepared.previewUrl);
      setError(null);
      onReady(null, true);
      const session = await createMediaUpload(familyId, {
        content_type: prepared.contentType,
        size_bytes: prepared.blob.size,
      });
      await putMediaFile(session.upload_url, prepared.blob, prepared.contentType);
      const completed = await completeMediaUpload(session.media_id);
      onReady(completed.id, false);
    } catch (cause) {
      setError(messageForError(cause));
      onReady(null, false);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
        className="sr-only"
        onChange={(event) => void onPick(event.target.files)}
      />
      <button
        type="button"
        className="relative size-24 rounded-full border border-input bg-muted"
        aria-label={copy['a11y.add_photo']}
        onClick={() => inputRef.current?.click()}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full rounded-full object-cover" />
        ) : (
          <Illustration name="person-placeholder" className="size-full rounded-full object-cover" float={false} />
        )}
        <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon as={CameraIcon} size={16} />
        </span>
      </button>
      {error ? <p className="text-caption text-destructive">{error}</p> : null}
    </div>
  );
}
