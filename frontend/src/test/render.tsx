import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';

/** Fresh query client per test, with retries off so errors show up immediately. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...options }: RenderOptions & { queryClient?: QueryClient } = {},
) {
  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
  return { ...result, queryClient };
}
