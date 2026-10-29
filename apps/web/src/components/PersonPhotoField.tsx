import { useEffect, useId, useRef, useState } from 'react';
import { CameraIcon } from '@phosphor-icons/react/Camera';
import { Illustration } from '@/components/Illustration';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { copy } from '@/copy';
import { completeMediaUpload, createMediaUpload, putMediaFile } from '@/lib/media-uploads';
import { messageForError } from '@/lib/api-errors';
import { prepareImage } from '@/lib/prepare-image';
import { validatePhotoFiles } from '@/lib/validate-photos';

type PersonPhotoFieldProps = {
  familyId: string;
  onReady: (mediaId: string | null, busy: boolean) => void;
  existingUrl?: string | null;
  onRemove?: () => void;
  layout?: 'add' | 'edit';
  fieldError?: string | null;
};

export function PersonPhotoField({
  familyId,
  onReady,
  existingUrl = null,
  onRemove,
  layout = 'add',
  fieldError = null,
}: PersonPhotoFieldProps) {
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
        ...(layout === 'edit' ? { purpose: 'avatar' as const } : {}),
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

  const shownUrl = previewUrl ?? existingUrl;
  const input = (
    <input
      id={inputId}
      ref={inputRef}
      type="file"
      accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
      className="sr-only"
      onChange={(event) => void onPick(event.target.files)}
    />
  );
  const avatar = shownUrl ? (
    <img src={shownUrl} alt="" className="size-full rounded-full object-cover" />
  ) : (
    <Illustration name="person-placeholder" className="size-full rounded-full object-cover" float={false} />
  );
  const errorText = fieldError ?? error;

  if (layout === 'edit') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <div className="size-24 shrink-0 overflow-hidden rounded-full border-2 border-card bg-muted">
            {avatar}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-label font-medium">{copy['person.add.photo.label']}</p>
            {input}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 min-h-9"
                onClick={() => inputRef.current?.click()}
              >
                {copy['person.edit.photo.change']}
              </Button>
              {onRemove && shownUrl ? (
                <Button type="button" variant="ghost" size="sm" className="h-9 min-h-9" onClick={onRemove}>
                  {copy['person.edit.photo.remove']}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        {errorText ? <p className="text-caption text-destructive">{errorText}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-label font-medium">{copy['person.add.photo.label']}</p>
      {input}
      <button
        type="button"
        className="relative size-24 rounded-full border border-input bg-muted"
        aria-label={copy['person.add.photo.cta']}
        onClick={() => inputRef.current?.click()}
      >
        {avatar}
        <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Icon as={CameraIcon} size={16} />
        </span>
      </button>
      {errorText ? <p className="text-caption text-destructive">{errorText}</p> : null}
    </div>
  );
}
