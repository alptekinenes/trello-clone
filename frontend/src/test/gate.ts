import type { QueryClient } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import { expect } from 'vitest';

/**
 * A request the test holds back until it calls `release`. A fixed delay would race the
 * test's own polling: on a busy machine the answer could land before the state under test
 * was looked at, or two answers could swap places.
 */
export function gate() {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { opened, release };
}

/**
 * Waits until the mutation whose variables match has succeeded. The success status is set
 * after `onSettled` has run, so what the hook does on settling has already happened.
 */
export async function waitForMutationSuccess(
  queryClient: QueryClient,
  matches: (variables: unknown) => boolean,
) {
  await waitFor(() => {
    const mutation = queryClient.getMutationCache().getAll().find((m) => matches(m.state.variables));
    expect(mutation?.state.status).toBe('success');
  });
}
