import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './dialog';

describe('Dialog', () => {
  it('opens as a modal labelled by its title', () => {
    render(
      <Dialog title="Pano oluştur" onClose={vi.fn()}>
        <p>İçerik</p>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Pano oluştur' });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByText('İçerik')).toBeVisible();
  });

  it('reports a native close (e.g. Escape) to the parent', () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Pano oluştur" onClose={onClose}>
        <p>İçerik</p>
      </Dialog>,
    );

    (screen.getByRole('dialog') as HTMLDialogElement).close();

    expect(onClose).toHaveBeenCalledOnce();
  });
});
