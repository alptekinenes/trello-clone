import { useEffect, useRef } from 'react';
import { useToastStore } from '../store/toast-store';

/**
 * Keeps a toast on screen while the pointer is on it or focus is inside it (WCAG 2.2.1),
 * and lets Escape close it while focus is inside. Returns the ref for the toast's element.
 * Native listeners: the toast is a live region, not a control, and gets no key or mouse props.
 */
export function useToastHold<T extends HTMLElement>(id: number) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { hold, release, dismiss } = useToastStore.getState();
    const holdOnce = () => hold(id);
    const releaseOnce = () => release(id);
    // Moving between the toast's own buttons keeps it held.
    const entering = (event: FocusEvent) => {
      if (!element.contains(event.relatedTarget as Node | null)) hold(id);
    };
    const leaving = (event: FocusEvent) => {
      if (!element.contains(event.relatedTarget as Node | null)) release(id);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dismiss(id);
    };

    element.addEventListener('pointerenter', holdOnce);
    element.addEventListener('pointerleave', releaseOnce);
    element.addEventListener('focusin', entering);
    element.addEventListener('focusout', leaving);
    element.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('pointerenter', holdOnce);
      element.removeEventListener('pointerleave', releaseOnce);
      element.removeEventListener('focusin', entering);
      element.removeEventListener('focusout', leaving);
      element.removeEventListener('keydown', onKeyDown);
    };
  }, [id]);

  return ref;
}
