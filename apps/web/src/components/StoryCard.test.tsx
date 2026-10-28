import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StoryCard } from '@/components/StoryCard';
import { copy, interpolate } from '@/copy';

describe('StoryCard', () => {
  it('renders narrator initial, name, date, body, and 72px photo row', () => {
    render(
      <StoryCard
        name="แม่"
        date="12 ตุลาคม 2569"
        body="วันนั้นคุณยายตื่นตั้งแต่ตีห้า"
        media={[
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa0', url: 'https://cdn.example.com/0.jpg' },
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', url: 'https://cdn.example.com/1.jpg' },
        ]}
      />
    );
    expect(screen.getByText('ม')).toBeTruthy();
    expect(screen.getByText('แม่')).toBeTruthy();
    expect(screen.getByText('12 ตุลาคม 2569')).toBeTruthy();
    expect(screen.getByText('วันนั้นคุณยายตื่นตั้งแต่ตีห้า')).toBeTruthy();
    const photo = screen.getByAltText(
      interpolate(copy['contribution.photo.alt'], { ชื่อผู้เล่า: 'แม่', i: '1', n: '2' })
    );
    expect(photo.closest('button')?.className).toContain('size-[72px]');
  });
});
