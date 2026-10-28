import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryEditConflictBanner } from '@/components/MemoryEditConflictBanner';
import { copy } from '@/copy';

describe('MemoryEditConflictBanner', () => {
  it('matches Figma version-conflict layout: warning body, then changed fields, then เปิดฉบับล่าสุด', () => {
    render(
      <MemoryEditConflictBanner changedFields={['title', 'date']} onOpenLatest={vi.fn()} />
    );
    const body = screen.getByRole('alert');
    const changed = screen.getByText('มีคนแก้ชื่อความทรงจำและวันที่ไปแล้ว ที่คุณแก้ไว้ด้านล่างยังอยู่ครบ');
    const action = screen.getByRole('button', { name: copy['memory.edit.conflict.action'] });
    expect(body.textContent).toBe(copy['memory.edit.conflict.body']);
    expect(body.compareDocumentPosition(changed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(changed.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides changed-fields until fields are known', () => {
    render(<MemoryEditConflictBanner changedFields={[]} onOpenLatest={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toBe(copy['memory.edit.conflict.body']);
    expect(screen.queryByText(/ด้านล่าง/)).toBeNull();
    expect(screen.getByRole('button', { name: copy['memory.edit.conflict.action'] })).toBeTruthy();
  });
});
