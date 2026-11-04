import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BOARD_BACKGROUNDS, type BoardBackground } from '@trello/contracts';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundPicker } from './background-picker';

function Harness({
  initial = 'blue',
  onChange = () => {},
  hideLabel,
}: {
  initial?: BoardBackground;
  onChange?: (background: BoardBackground) => void;
  hideLabel?: boolean;
}) {
  const [value, setValue] = useState<BoardBackground>(initial);
  return (
    <BackgroundPicker
      value={value}
      hideLabel={hideLabel}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('BackgroundPicker', () => {
  it('is a named group with one radio per background and only the current one checked', () => {
    render(<Harness initial="green" />);

    const group = screen.getByRole('group', { name: 'Arka plan' });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(BOARD_BACKGROUNDS.length);
    expect(screen.getByRole('radio', { name: 'Yeşil' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Mavi' })).not.toBeChecked();
  });

  it('reports the chosen background when a swatch is clicked', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Mor' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('purple');
    expect(screen.getByRole('radio', { name: 'Mor' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Mavi' })).not.toBeChecked();
  });

  it('moves the choice with the arrow keys', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial="blue" onChange={onChange} />);

    await user.tab();
    expect(screen.getByRole('radio', { name: 'Mavi' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith(BOARD_BACKGROUNDS[1]);
    expect(screen.getByRole('radio', { name: 'Yeşil' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Yeşil' })).toHaveFocus();
  });

  it('marks the chosen swatch with a check mark, not by color alone', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial="blue" />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Mavi' }).closest('label')?.querySelector('svg')).not.toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Gri' }));

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Gri' }).closest('label')?.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Mavi' }).closest('label')?.querySelector('svg')).toBeNull();
  });

  it('can keep the group name for assistive technology only', () => {
    render(<Harness hideLabel />);

    expect(screen.getByRole('group', { name: 'Arka plan' })).toBeInTheDocument();
    expect(screen.getByText('Arka plan')).toHaveClass('sr-only');
  });
});
