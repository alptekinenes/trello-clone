import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showToast, TOAST_DURATION_MS } from '../store/toast-store';
import { Toaster } from './toaster';

const setup = () => render(<Toaster />);

const focus = (element: HTMLElement) => act(() => element.focus());
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('Toaster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces an error toast as an alert and an info toast as a status', () => {
    setup();
    act(() => {
      showToast('Kaydedilemedi.', { tone: 'error' });
      showToast('Arşivlendi.');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Kaydedilemedi.');
    expect(screen.getByRole('status')).toHaveTextContent('Arşivlendi.');
  });

  it('closes after its time when nobody points at it', () => {
    setup();
    act(() => showToast('Arşivlendi.'));
    advance(TOAST_DURATION_MS);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the toast while the pointer is on it and runs on after it leaves', () => {
    setup();
    act(() => showToast('Arşivlendi.'));

    fireEvent.pointerEnter(screen.getByRole('status'));
    advance(TOAST_DURATION_MS * 2);
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByRole('status'));
    advance(TOAST_DURATION_MS);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the toast while focus is inside it and runs on after focus leaves', () => {
    setup();
    act(() => showToast('Arşivlendi.', { action: { label: 'Geri al', onClick: () => undefined } }));

    focus(screen.getByRole('button', { name: 'Geri al' }));
    focus(screen.getByRole('button', { name: 'Bildirimi kapat' }));
    advance(TOAST_DURATION_MS * 2);
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Bildirimi kapat' }).blur());
    advance(TOAST_DURATION_MS);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('closes the toast in focus with Escape', () => {
    setup();
    act(() => showToast('Arşivlendi.'));
    focus(screen.getByRole('button', { name: 'Bildirimi kapat' }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Bildirimi kapat' }), { key: 'Escape' });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('runs the action and closes the toast', () => {
    setup();
    const onClick = vi.fn();
    act(() => showToast('Arşivlendi.', { action: { label: 'Geri al', onClick } }));

    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
