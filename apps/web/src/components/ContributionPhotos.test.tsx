import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { copy, interpolate } from '@/copy';
import { ContributionPhotos } from '@/components/ContributionPhotos';

function photos(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
    url: `https://cdn.example.com/${index}.jpg`,
  }));
}

describe('ContributionPhotos', () => {
  it('renders nothing when media is missing', () => {
    const { container } = render(<ContributionPhotos ownerName="Atta" />);
    expect(container.textContent).toBe('');
  });

  it('uses a full-width 4:3 tile for one photo', () => {
    render(<ContributionPhotos ownerName="Atta" media={photos(1)} />);
    expect(screen.getByRole('button').className).toContain('aspect-[4/3]');
    expect(
      screen.getByAltText(
        interpolate(copy['contribution.photo.alt'], { ชื่อผู้เล่า: 'Atta', i: '1', n: '1' })
      )
    ).toBeTruthy();
  });

  it('uses two columns for two photos and three for more', () => {
    const two = render(<ContributionPhotos ownerName="Atta" media={photos(2)} />);
    expect(two.container.querySelector('ul')?.className).toContain('grid-cols-2');
    two.unmount();

    const many = render(<ContributionPhotos ownerName="Atta" media={photos(3)} />);
    expect(many.container.querySelector('ul')?.className).toContain('grid-cols-3');
    expect(many.getAllByRole('button')[0]?.className).toContain('aspect-square');
  });

  it('shows three 72px tiles and +n on the story-card variant', () => {
    render(<ContributionPhotos ownerName="Atta" media={photos(5)} variant="story" />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('+2')).toBeTruthy();
    expect(screen.getAllByRole('button')[0]?.className).toContain('size-[72px]');
    expect(
      screen.getByRole('button', {
        name: interpolate(copy['contribution.photos.more'], { n: '2' }),
      })
    ).toBeTruthy();
  });

  it('shows six tiles and a leftover overlay when there are more than six', () => {
    render(<ContributionPhotos ownerName="Atta" media={photos(8)} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByText('+2')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: interpolate(copy['contribution.photos.more'], { n: '2' }),
      })
    ).toBeTruthy();
  });

  it('opens the fullscreen viewer with a close control', () => {
    render(<ContributionPhotos ownerName="Atta" media={photos(2)} />);
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByText(interpolate(copy['contribution.photos.viewer.counter'], { i: '1', n: '2' }))
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: copy['a11y.close'] })).toBeTruthy();
  });

  it('keeps the grid when a photo url is missing', () => {
    render(
      <ContributionPhotos
        ownerName="Atta"
        media={[{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', url: null, thumb_url: null }]}
      />
    );
    expect(screen.getByRole('button')).toBeTruthy();
    expect(screen.getByText(copy['photo.load_error'])).toBeTruthy();
    expect(screen.getByRole('img', { name: copy['photo.load_error'] })).toBeTruthy();
  });
});
