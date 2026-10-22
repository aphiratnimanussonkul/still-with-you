import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FamilySwitcher } from '@/components/FamilySwitcher';
import { copy, interpolate } from '@/copy';
import { mockFamilies } from '@/mocks/data';

describe('FamilySwitcher', () => {
  it('uses the switcher label and selected-family aria-label', () => {
    const onSelect = vi.fn();
    render(
      <FamilySwitcher families={mockFamilies} selectedId={mockFamilies[0].id} onSelect={onSelect} />
    );

    expect(screen.getByLabelText(copy['family.switcher'])).toBeTruthy();
    expect(
      screen.getByLabelText(
        interpolate(copy['a11y.family_switcher'], { ชื่อครอบครัว: mockFamilies[0].name })
      )
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText(copy['family.switcher']), {
      target: { value: mockFamilies[1].id },
    });
    expect(onSelect).toHaveBeenCalledWith(mockFamilies[1].id);
  });
});
