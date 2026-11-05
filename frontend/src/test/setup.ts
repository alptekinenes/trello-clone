import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
// Test infrastructure may reach into feature internals to reset global state.
import { resetAuthStore } from '../features/auth/store/auth-store';
import { resetInvitationIntent } from '../features/invitations/store/invitation-intent-store';
import { resetCardDetailStore } from '../features/card-detail/store/card-detail-store';
import { resetAttachmentUploads } from '../features/card-detail/store/attachment-upload-store';
import { resetUploadRunner } from '../features/card-detail/lib/upload-runner';
import { resetPinnedImageSrc } from '../features/board-detail/lib/pinned-image-src';
import { resetCardUi } from '../features/board-detail/store/card-ui-store';
import { setAuthHandlers } from '../shared/lib/http';
import { realtime, setSocketFactory } from '../shared/lib/realtime-client';
import { resetRealtimeStore } from '../shared/store/realtime-store';
import { resetToasts } from '../shared/store/toast-store';
import { createFakeSocket, resetFakeRealtime } from './fake-realtime';
import { server } from './msw-server';

// The first full-app render of a file loads the lazy routes. With many workers on a busy
// machine (e.g. dev servers running) that can pass the default 1 s of findBy/waitFor.
configure({ asyncUtilTimeout: 3000 });

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
// No test reaches a real socket; the fake does not connect until a test says so.
beforeEach(() => {
  resetFakeRealtime();
  setSocketFactory(createFakeSocket);
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
  realtime.stop();
  resetRealtimeStore();
  resetAuthStore();
  setAuthHandlers(null);
  resetToasts();
  resetCardUi();
  resetCardDetailStore();
  resetAttachmentUploads();
  resetUploadRunner();
  resetPinnedImageSrc();
  resetInvitationIntent();
});
afterAll(() => server.close());
