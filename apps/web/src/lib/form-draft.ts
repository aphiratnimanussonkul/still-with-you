export const PWA_FLUSH_DRAFTS_EVENT = 'swy:pwa-flush-drafts';
export const PWA_UPDATE_CHECK_MS = 60 * 60 * 1000;
export const MEMORY_CREATE_DRAFT_KEY = 'swy:draft:memory-create';

export type MemoryEditDraft = { title: string };
export type MemoryCreateDraft = { title: string; story: string };

export function memoryEditDraftKey(eventId: string): string {
  return `swy:draft:memory-edit:${eventId}`;
}

export function flushPwaDrafts(): void {
  window.dispatchEvent(new Event(PWA_FLUSH_DRAFTS_EVENT));
}

export function writeDraft(key: string, value: unknown): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}

export function readDraft<T>(key: string): T | null {
  const raw = sessionStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  sessionStorage.removeItem(key);
}
