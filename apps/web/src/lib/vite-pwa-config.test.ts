import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('vite PWA registerType', () => {
  const configPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../vite.config.ts');
  const source = readFileSync(configPath, 'utf8');

  it('uses prompt so onNeedRefresh fires and skipWaiting waits for เปิดใหม่', () => {
    expect(source).toMatch(/registerType:\s*'prompt'/);
    expect(source).not.toMatch(/registerType:\s*'autoUpdate'/);
  });

  it('precaches the green-orange PWA icons and splash background', () => {
    expect(source).toContain("background_color: '#F5F4ED'");
    expect(source).toContain("src: 'icon-192.png'");
    expect(source).toContain("src: 'icon-512.png'");
    expect(source).toContain("src: 'maskable-512.png'");
    expect(source).toContain("purpose: 'maskable'");
    expect(source).toContain('icon-192.png');
    expect(source).toContain('maskable-512.png');
    expect(source).toContain('favicon.ico');
    expect(source).toMatch(/globPatterns:\s*\['\*\*\/\*\.\{js,css,html,webp,svg,ico,png,woff2\}'\]/);
    expect(source).not.toContain('favicon.svg');
  });
});
