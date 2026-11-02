import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogStatus } from './use-dialog-status';

describe('useDialogStatus', () => {
  it('starts empty and holds the announced text', () => {
    const { result } = renderHook(() => useDialogStatus());
    expect(result.current.status).toMatchObject({ text: '', silent: false });

    act(() => result.current.announce('Bağlantı kopyalandı.'));

    expect(result.current.status).toMatchObject({ text: 'Bağlantı kopyalandı.', silent: false });
  });

  it('gives the same text a new id each time, so a region can show it afresh', () => {
    const { result } = renderHook(() => useDialogStatus());

    act(() => result.current.announce('Bağlantı kopyalandı.'));
    const first = result.current.status.id;
    act(() => result.current.announce('Bağlantı kopyalandı.'));

    expect(result.current.status.id).not.toBe(first);
  });

  it('marks a silent announcement and keeps announce stable between renders', () => {
    const { result, rerender } = renderHook(() => useDialogStatus());
    const { announce } = result.current;

    act(() => announce('Yükleniyor', { silent: true }));
    rerender();

    expect(result.current.status.silent).toBe(true);
    expect(result.current.announce).toBe(announce);
  });

  it('is rendered by a region that replaces its content for a repeated text', () => {
    function Region() {
      const { status, announce } = useDialogStatus();
      return (
        <>
          <button onClick={() => announce('Aynı mesaj')}>duyur</button>
          <output>{status.text && <span key={status.id}>{status.text}</span>}</output>
        </>
      );
    }
    render(<Region />);
    act(() => screen.getByRole('button').click());
    const first = screen.getByText('Aynı mesaj');

    act(() => screen.getByRole('button').click());

    expect(screen.getByText('Aynı mesaj')).not.toBe(first);
  });
});
