import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DueBadge } from './due-badge';
import { LabelChip } from './label-chip';

describe('LabelChip', () => {
  it('shows the label name', () => {
    render(<LabelChip label={{ name: 'Acil', color: 'RED' }} />);
    expect(screen.getByText('Acil')).toHaveClass('bg-label-red');
  });

  it('reads out the color of a nameless label', () => {
    render(<LabelChip label={{ name: '', color: 'GREEN' }} />);
    expect(screen.getByText('Yeşil etiket')).toBeInTheDocument();
  });
});

describe('DueBadge', () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ['2026-11-04T10:00:00.000Z', false, 'gecikti', 'text-danger'],
    ['2026-11-05T20:00:00.000Z', false, 'yaklaşıyor', 'text-warning'],
    ['2026-11-04T10:00:00.000Z', true, 'tamamlandı', 'text-success'],
    ['2026-11-20T10:00:00.000Z', false, null, 'text-fg-muted'],
  ])('describes %s (complete: %s)', (dueDate, dueComplete, spoken, tone) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T12:00:00.000Z'));
    const { container } = render(<DueBadge dueDate={dueDate} dueComplete={dueComplete} />);

    expect(container.firstChild).toHaveClass(tone);
    const text = container.querySelector('.sr-only')?.textContent ?? '';
    expect(text).toContain('Son tarih:');
    if (spoken) expect(text).toContain(spoken);
    else expect(text).not.toMatch(/gecikti|yaklaşıyor|tamamlandı/);
  });
});
