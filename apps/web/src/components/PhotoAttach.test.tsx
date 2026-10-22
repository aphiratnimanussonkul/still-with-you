import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, interpolate } from '@/copy';
import { MEDIA_DEFAULTS } from '@/lib/media-config';

const createMediaUpload = vi.fn();
const putMediaFile = vi.fn();
const completeMediaUpload = vi.fn();
const prepareImage = vi.fn();

vi.mock('@/lib/media-uploads', () => ({
  createMediaUpload: (...args: unknown[]) => createMediaUpload(...args),
  putMediaFile: (...args: unknown[]) => putMediaFile(...args),
  completeMediaUpload: (...args: unknown[]) => completeMediaUpload(...args),
}));

vi.mock('@/lib/prepare-image', () => ({
  prepareImage: (...args: unknown[]) => prepareImage(...args),
}));

import { PhotoAttach } from '@/components/PhotoAttach';

const familyId = '22222222-2222-4222-8222-222222222222';
const mediaId = '55555555-5555-4555-8555-555555555555';

function jpeg(name = 'shot.jpg'): File {
  return new File([new Uint8Array(8)], name, { type: 'image/jpeg' });
}

describe('PhotoAttach', () => {
  beforeEach(() => {
    createMediaUpload.mockReset();
    putMediaFile.mockReset();
    completeMediaUpload.mockReset();
    prepareImage.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();

    prepareImage.mockResolvedValue({
      blob: new Blob([new Uint8Array(8)], { type: 'image/webp' }),
      contentType: 'image/webp',
      previewUrl: 'blob:preview',
      width: 800,
      height: 600,
    });
    createMediaUpload.mockResolvedValue({
      media_id: mediaId,
      upload_url: 'https://example.test/upload',
      expires_at: '2026-10-22T12:00:00.000Z',
      max_bytes: MEDIA_DEFAULTS.maxBytes,
      max_per_story: MEDIA_DEFAULTS.maxPerStory,
    });
    putMediaFile.mockResolvedValue(undefined);
    completeMediaUpload.mockResolvedValue({ id: mediaId, status: 'ready' });
  });

  it('shows the v0.4 photo label, counter, and add control', () => {
    render(<PhotoAttach familyId={familyId} onStateChange={vi.fn()} />);
    expect(screen.getByText(copy['photo.label'])).toBeTruthy();
    expect(
      screen.getByText(
        interpolate(copy['photo.count'], { n: '0', max: String(MEDIA_DEFAULTS.maxPerStory) })
      )
    ).toBeTruthy();
    const input = screen.getByLabelText(copy['a11y.add_photo']);
    expect(input.getAttribute('accept')).toBe('image/*,.heic,.heif');
    expect(input.hasAttribute('multiple')).toBe(true);
  });

  it('uploads a photo then reports the ready media id', async () => {
    const onStateChange = vi.fn();
    render(<PhotoAttach familyId={familyId} onStateChange={onStateChange} />);
    fireEvent.change(screen.getByLabelText(copy['a11y.add_photo']), {
      target: { files: [jpeg()] },
    });

    await waitFor(() => {
      expect(completeMediaUpload).toHaveBeenCalledWith(mediaId);
    });
    expect(createMediaUpload).toHaveBeenCalledWith(familyId, {
      content_type: 'image/webp',
      size_bytes: 8,
    });
    expect(onStateChange).toHaveBeenCalledWith({ mediaIds: [mediaId], isBusy: false });
    expect(screen.getByLabelText(copy['a11y.remove_photo'])).toBeTruthy();
  });

  it('shows FILE_TOO_LARGE immediately and does not start an upload', async () => {
    const huge = jpeg('huge.jpg');
    Object.defineProperty(huge, 'size', { value: MEDIA_DEFAULTS.maxBytes + 1 });
    render(<PhotoAttach familyId={familyId} onStateChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(copy['a11y.add_photo']), {
      target: { files: [huge] },
    });

    expect(
      await screen.findByText(
        interpolate(copy['error.FILE_TOO_LARGE'], { max_mb: '20' })
      )
    ).toBeTruthy();
    expect(prepareImage).not.toHaveBeenCalled();
    expect(createMediaUpload).not.toHaveBeenCalled();
  });

  it('retries a failed upload', async () => {
    createMediaUpload.mockRejectedValueOnce(new Error('offline'));
    render(<PhotoAttach familyId={familyId} onStateChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(copy['a11y.add_photo']), {
      target: { files: [jpeg()] },
    });

    const retry = await screen.findByRole('button', { name: copy['retry'] });
    fireEvent.click(retry);
    await waitFor(() => {
      expect(completeMediaUpload).toHaveBeenCalledWith(mediaId);
    });
  });
});
