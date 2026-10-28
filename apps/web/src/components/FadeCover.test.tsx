import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FadeCover } from '@/components/FadeCover';

describe('FadeCover', () => {
  it('renders a grey tile when cover_url is null', () => {
    const { container } = render(<FadeCover src={null} alt="ทริปทะเลกับคุณยาย" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild?.className).toContain('bg-muted');
  });

  it('starts transparent on #F5F4ED and fades in after load', () => {
    const { container } = render(
      <FadeCover src="https://cdn.example.com/cover.jpg" alt="ทริปทะเลกับคุณยาย" />
    );
    const img = container.querySelector('img');
    expect(img?.className).toContain('opacity-0');
    expect(img?.getAttribute('width')).toBe('128');
    expect(img?.getAttribute('height')).toBe('128');
    fireEvent.load(img!);
    expect(img?.className).toContain('opacity-100');
  });

  it('falls back to the grey tile when the image errors', () => {
    const { container } = render(
      <FadeCover src="https://cdn.example.com/broken.jpg" alt="ทริปทะเลกับคุณยาย" />
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstElementChild?.className).toContain('bg-muted');
  });
});
