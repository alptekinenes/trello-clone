import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, useDialogClose } from './dialog';

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

describe('Dialog options', () => {
  it('keeps the accessible name when the title is hidden', () => {
    render(
      <Dialog title="Kart başlığı" hideTitle onClose={vi.fn()}>
        <p>İçerik</p>
      </Dialog>,
    );

    expect(screen.getByRole('dialog', { name: 'Kart başlığı' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Kart başlığı' })).toHaveClass('sr-only');
  });

  it('shows no close button unless asked to', () => {
    render(
      <Dialog title="Pano" onClose={vi.fn()}>
        <p>İçerik</p>
      </Dialog>,
    );

    expect(screen.queryByRole('button', { name: 'Kapat' })).not.toBeInTheDocument();
  });

  it('closes natively from the close button', async () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Pano" showCloseButton onClose={onClose}>
        <p>İçerik</p>
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets children close the dialog through useDialogClose', async () => {
    const onClose = vi.fn();
    function Child() {
      const close = useDialogClose();
      return <button onClick={close}>Arşivle</button>;
    }
    render(
      <Dialog title="Kart" size="lg" onClose={onClose}>
        <Child />
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Arşivle' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('refuses useDialogClose outside a dialog', () => {
    function Child() {
      useDialogClose();
      return null;
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Child />)).toThrow('useDialogClose must be used inside a Dialog');
  });
});
