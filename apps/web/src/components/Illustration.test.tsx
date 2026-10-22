import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Illustration } from '@/components/Illustration';
import { ILLUSTRATION_NAMES, illustrationSrc } from '@/components/illustrations';

describe('Illustration', () => {
  it('renders a decorative image with empty alt and aria-hidden', () => {
    const { container } = render(<Illustration name="error-offline" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    expect(img?.getAttribute('src')).toBe(illustrationSrc['error-offline']);
    expect(img?.classList.contains('swy-float')).toBe(true);
  });

  it('accepts every typed illustration name', () => {
    expect(ILLUSTRATION_NAMES).toHaveLength(19);
    for (const name of ILLUSTRATION_NAMES) {
      const { container, unmount } = render(<Illustration name={name} float={false} />);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe(illustrationSrc[name]);
      expect(img?.classList.contains('swy-float')).toBe(false);
      unmount();
    }
  });
});
