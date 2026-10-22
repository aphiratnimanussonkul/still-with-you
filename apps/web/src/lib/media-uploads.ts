/**
 * Isolated media-upload client. Backend contract is still being finalized;
 * keep request/response shapes here (and in MSW) rather than in api-client.
 */
import {
  createMediaUploadSchema,
  mediaItemSchema,
  mediaUploadSessionSchema,
  type MediaUploadSession,
} from '@still-with-you/contracts';
import { ApiClientError, NetworkError, codeForFailedResponse } from '@/lib/api-errors';
import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/supabase';

async function jsonRequest<T>(
  path: string,
  parse: (value: unknown) => T,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new NetworkError();
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as { error?: { code?: string; message?: string; field?: string; details?: Record<string, unknown> } })
            .error
        : undefined;
    throw new ApiClientError(
      codeForFailedResponse(response.status, error?.code),
      error?.message ?? response.statusText,
      response.status,
      error?.field,
      error?.details
    );
  }

  return parse(payload);
}

export function createMediaUpload(
  familyId: string,
  body: { content_type: string; size_bytes: number; purpose?: 'avatar' }
): Promise<MediaUploadSession> {
  const parsed = createMediaUploadSchema.parse(body);
  return jsonRequest(
    `/v1/families/${familyId}/media/uploads`,
    (value) => mediaUploadSessionSchema.parse(value),
    {
      method: 'POST',
      body: body.purpose ? { ...parsed, purpose: body.purpose } : parsed,
    }
  );
}

export function putMediaFile(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiClientError('UPLOAD_MISMATCH', xhr.statusText, xhr.status));
    };
    xhr.onerror = () => reject(new NetworkError());
    xhr.send(file);
  });
}

export function completeMediaUpload(mediaId: string) {
  return jsonRequest(`/v1/media/${mediaId}/complete`, (value) => mediaItemSchema.parse(value), {
    method: 'POST',
    body: {},
  });
}
