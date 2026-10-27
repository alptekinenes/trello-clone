import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InlineEdit } from './inline-edit';

function setup(value = 'Proje') {
  const onSave = vi.fn();
  render(<InlineEdit value={value} label="Pano adı" editHint="Pano adını düzenle" onSave={onSave} />);
  return { onSave, user: userEvent.setup() };
}

async function startEditing(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Proje' }));
  return screen.getByRole('textbox', { name: 'Pano adı' });
}

describe('InlineEdit', () => {
  it('shows the value as a button that explains it can be edited', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Proje' })).toHaveAccessibleDescription(
      'Pano adını düzenle',
    );
  });

  it('opens a focused input with the text selected', async () => {
    const { user } = setup();
    const input = await startEditing(user);

    expect(input).toHaveFocus();
    expect(input).toHaveValue('Proje');
    expect((input as HTMLInputElement).selectionEnd).toBe('Proje'.length);
  });

  it('saves the trimmed text on Enter, once', async () => {
    const { onSave, user } = setup();
    const input = await startEditing(user);

    await user.clear(input);
    await user.type(input, '  Yeni ad  {Enter}');

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith('Yeni ad');
    // The parent has not re-rendered with the new value, so the button still says Proje.
    expect(screen.getByRole('button', { name: 'Proje' })).toHaveFocus();
  });

  it('saves on blur', async () => {
    const { onSave, user } = setup();
    const input = await startEditing(user);

    await user.type(input, ' 2');
    await user.tab();

    expect(onSave).toHaveBeenCalledWith('Proje 2');
  });

  it('cancels on Escape without saving', async () => {
    const { onSave, user } = setup();
    const input = await startEditing(user);

    await user.type(input, ' değişti{Escape}');

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Proje' })).toHaveFocus();
  });

  it('does not save an empty or unchanged value', async () => {
    const { onSave, user } = setup();

    let input = await startEditing(user);
    await user.clear(input);
    await user.type(input, '   {Enter}');

    input = await startEditing(user);
    await user.type(input, '{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });
});
