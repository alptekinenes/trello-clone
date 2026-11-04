import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { startsInEditable } from '../lib/dnd-sensors';
import { Menu, MenuGroup, MenuItem, MenuRadioItem, MenuSeparator } from './menu';

function setup(onProfile = vi.fn(), onDark = vi.fn()) {
  render(
    <div>
      <button type="button">Dışarıdaki düğme</button>
      <Menu label="Hesap menüsü" trigger="Hesap">
        <MenuItem onSelect={onProfile}>Profil</MenuItem>
        <MenuSeparator />
        <MenuGroup label="Tema">
          <MenuRadioItem checked={false} onSelect={vi.fn()}>
            Açık
          </MenuRadioItem>
          <MenuRadioItem checked onSelect={onDark}>
            Koyu
          </MenuRadioItem>
        </MenuGroup>
        <MenuItem onSelect={vi.fn()}>Çıkış yap</MenuItem>
      </Menu>
      <button type="button">Sonraki düğme</button>
    </div>,
  );
  return userEvent.setup();
}

it('marks its panel so a press on an item never starts a drag of the surrounding sortable', async () => {
  const user = setup();
  await user.click(screen.getByRole('button', { name: 'Hesap menüsü' }));

  expect(screen.getByRole('menu')).toHaveAttribute('data-no-dnd');
  expect(startsInEditable(screen.getByRole('menuitem', { name: 'Profil' }))).toBe(true);
});

const trigger = () => screen.getByRole('button', { name: 'Hesap menüsü' });

describe('Menu', () => {
  it('is closed at first and announces its popup on the trigger', () => {
    setup();

    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens on click and focuses the first item of a mixed menu', async () => {
    const user = setup();

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Hesap menüsü' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Profil' })).toHaveFocus();
  });

  it('focuses the checked item of a menu made only of radio items', async () => {
    const user = userEvent.setup();
    render(
      <Menu label="Pano değiştir" trigger="Panolar">
        <MenuRadioItem checked={false} onSelect={vi.fn()}>
          Birinci
        </MenuRadioItem>
        <MenuRadioItem checked onSelect={vi.fn()}>
          İkinci
        </MenuRadioItem>
      </Menu>,
    );

    await user.click(screen.getByRole('button', { name: 'Pano değiştir' }));

    expect(screen.getByRole('menuitemradio', { name: /İkinci/ })).toHaveFocus();
  });

  it('opens with ArrowDown from the trigger', async () => {
    const user = setup();
    trigger().focus();

    await user.keyboard('{ArrowDown}');

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('moves focus with arrows, wrapping around, and with Home and End', async () => {
    const user = setup();
    await user.click(trigger());
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'Profil' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Açık/ })).toHaveFocus();

    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Çıkış yap' })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Profil' })).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Çıkış yap' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = setup();
    await user.click(trigger());

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes when clicking outside', async () => {
    const user = setup();
    await user.click(trigger());

    await user.click(screen.getByRole('button', { name: 'Dışarıdaki düğme' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Tab without leaving focus on a removed item', async () => {
    const user = setup();
    await user.click(trigger());

    await user.keyboard('{Tab}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonraki düğme' })).toHaveFocus();
  });

  it('runs onSelect, closes and returns focus when an item is chosen', async () => {
    const onProfile = vi.fn();
    const user = setup(onProfile);
    await user.click(trigger());

    await user.click(screen.getByRole('menuitem', { name: 'Profil' }));

    expect(onProfile).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('selects with the keyboard and exposes the radio state', async () => {
    const onDark = vi.fn();
    const user = setup(vi.fn(), onDark);
    await user.click(trigger());

    expect(screen.getByRole('menuitemradio', { name: /Açık/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('menuitemradio', { name: /Koyu/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('group', { name: 'Tema' })).toBeInTheDocument();

    screen.getByRole('menuitemradio', { name: /Koyu/ }).focus();
    await user.keyboard('{Enter}');

    expect(onDark).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
