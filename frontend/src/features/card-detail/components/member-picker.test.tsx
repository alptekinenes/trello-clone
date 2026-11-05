import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { testMember } from '../../../test/fixtures';
import { MemberPicker } from './member-picker';

const AYSE = testMember({ userId: 'user-ayse', name: 'Ayşe Demir' });
const MEHMET = testMember({ userId: 'user-mehmet', name: 'Mehmet Kaya' });
const ZEYNEP = testMember({ userId: 'user-zeynep', name: 'Zeynep Arı' });

describe('member picker focus', () => {
  it('focuses the first member when it opens', () => {
    render(<MemberPicker members={[AYSE, MEHMET]} isAssigned={() => false} onToggle={() => {}} />);

    expect(screen.getByRole('checkbox', { name: 'Ayşe Demir' })).toHaveFocus();
  });

  it('keeps the focus where it is when a member joins at the top later', () => {
    const { rerender } = render(
      <MemberPicker members={[AYSE, MEHMET]} isAssigned={() => false} onToggle={() => {}} />,
    );
    screen.getByRole('checkbox', { name: 'Mehmet Kaya' }).focus();

    rerender(
      <MemberPicker members={[ZEYNEP, AYSE, MEHMET]} isAssigned={() => false} onToggle={() => {}} />,
    );

    expect(screen.getByRole('checkbox', { name: 'Mehmet Kaya' })).toHaveFocus();
  });
});
