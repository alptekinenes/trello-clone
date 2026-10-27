import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
// Test infrastructure may reach into feature internals to reset global state.
import { resetAuthStore } from '../features/auth/store/auth-store';
import { setAuthHandlers } from '../shared/lib/http';
import { resetToasts } from '../shared/store/toast-store';
import { server } from './msw-server';

// jsdom has <dialog> but not its modal API. Minimal stand-in: toggle `open`, fire `close`.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

// Any request without a handler fails the test instead of hitting the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  resetAuthStore();
  setAuthHandlers(null);
  resetToasts();
});
afterAll(() => server.close());
