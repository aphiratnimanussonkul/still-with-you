import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MEMORY_CREATE_DRAFT_KEY,
  PWA_FLUSH_DRAFTS_EVENT,
  clearDraft,
  flushPwaDrafts,
  memoryEditDraftKey,
  readDraft,
  reloadForAppUpdate,
  setPwaUpdateHandler,
  writeDraft,
  type MemoryCreateDraft,
  type MemoryEditDraft,
} from '@/lib/form-draft';

afterEach(() => {
  sessionStorage.clear();
  setPwaUpdateHandler(null);
});

describe('form-draft', () => {
  it('round-trips edit and create drafts in sessionStorage', () => {
    const editKey = memoryEditDraftKey('event-1');
    writeDraft(editKey, { title: 'ฉันพิมพ์ไว้แล้ว' } satisfies MemoryEditDraft);
    writeDraft(MEMORY_CREATE_DRAFT_KEY, {
      title: 'งานบวช',
      story: 'วันนั้นทั้งบ้านตื่น',
    } satisfies MemoryCreateDraft);

    expect(readDraft<MemoryEditDraft>(editKey)).toEqual({ title: 'ฉันพิมพ์ไว้แล้ว' });
    expect(readDraft<MemoryCreateDraft>(MEMORY_CREATE_DRAFT_KEY)).toEqual({
      title: 'งานบวช',
      story: 'วันนั้นทั้งบ้านตื่น',
    });
    clearDraft(editKey);
    expect(readDraft(editKey)).toBeNull();
  });

  it('dispatches a flush event so pages can persist before reload', () => {
    const seen: string[] = [];
    const onFlush = () => {
      seen.push('flush');
      writeDraft(MEMORY_CREATE_DRAFT_KEY, { title: 'ก่อนรีโหลด', story: '' });
    };
    window.addEventListener(PWA_FLUSH_DRAFTS_EVENT, onFlush);
    try {
      flushPwaDrafts();
      expect(seen).toEqual(['flush']);
      expect(readDraft<MemoryCreateDraft>(MEMORY_CREATE_DRAFT_KEY)?.title).toBe('ก่อนรีโหลด');
    } finally {
      window.removeEventListener(PWA_FLUSH_DRAFTS_EVENT, onFlush);
    }
  });

  it('reloadForAppUpdate flushes drafts then skipWaiting-reloads', () => {
    const update = vi.fn(async () => undefined);
    setPwaUpdateHandler(update);
    const onFlush = () => {
      writeDraft(MEMORY_CREATE_DRAFT_KEY, { title: 'ก่อนเปิดใหม่', story: '' });
    };
    window.addEventListener(PWA_FLUSH_DRAFTS_EVENT, onFlush);
    try {
      reloadForAppUpdate();
      expect(readDraft<MemoryCreateDraft>(MEMORY_CREATE_DRAFT_KEY)?.title).toBe('ก่อนเปิดใหม่');
      expect(update).toHaveBeenCalledWith(true);
    } finally {
      window.removeEventListener(PWA_FLUSH_DRAFTS_EVENT, onFlush);
    }
  });
});
