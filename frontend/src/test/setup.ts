import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
// Test infrastructure may reach into feature internals to reset global state.
import { resetAuthStore } from '../features/auth/store/auth-store';
import { setAuthHandlers } from '../shared/lib/http';
import { server } from './msw-server';

// Any request without a handler fails the test instead of hitting the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  resetAuthStore();
  setAuthHandlers(null);
});
afterAll(() => server.close());
