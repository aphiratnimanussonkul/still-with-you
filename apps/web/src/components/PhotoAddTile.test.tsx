import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhotoAddTile } from '@/components/PhotoAddTile';
import { copy } from '@/copy';

describe('PhotoAddTile', () => {
  it('shows the add-photo label on a 72px dashed tile', () => {
    const { container } = render(<PhotoAddTile />);
    expect(screen.getByText(copy['a11y.add_photo'])).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('size-[72px]');
    expect(container.firstElementChild?.className).toContain('border-dashed');
  });
});
