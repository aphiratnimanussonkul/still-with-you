import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DetailMoreButton } from '@/components/DetailMoreButton';
import { copy } from '@/copy';

describe('DetailMoreButton', () => {
  it('uses the shared more label, 40px circle, and 44px tap target', () => {
    const onClick = vi.fn();
    render(<DetailMoreButton label={copy['a11y.more']} onClick={onClick} />);
    const button = screen.getByRole('button', { name: copy['a11y.more'] });
    expect(button.getAttribute('aria-label')).toBe('ตัวเลือกเพิ่มเติม');
    expect(button.className).toContain('size-10');
    expect(button.className).toContain('rounded-full');
    expect(button.className).toContain('bg-card');
    expect(button.className).toContain('border-border');
    expect(button.className).toContain('shadow-sm');
    expect(button.className).toContain('hover:bg-muted');
    expect(button.className).toContain('after:size-11');
    const icon = button.querySelector('svg');
    expect(icon?.getAttribute('width')).toBe('22');
    expect(icon?.getAttribute('height')).toBe('22');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
