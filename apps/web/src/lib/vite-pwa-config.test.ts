import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('vite PWA registerType', () => {
  it('uses prompt so onNeedRefresh fires and skipWaiting waits for เปิดใหม่', () => {
    const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../vite.config.ts');
    const source = readFileSync(configPath, 'utf8');
    expect(source).toMatch(/registerType:\s*'prompt'/);
    expect(source).not.toMatch(/registerType:\s*'autoUpdate'/);
  });
});
