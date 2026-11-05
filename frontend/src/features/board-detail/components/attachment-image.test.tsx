import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { BOARD_ID } from '../../../test/fixtures';
import { server } from '../../../test/msw-server';
import { fileTokenKeys } from '../api/file-token-keys';
import { AttachmentImage } from './attachment-image';

const TOKEN_URL = `*/api/v1/boards/${BOARD_ID}/file-token`;

function tokens(...values: string[]) {
  const state = { calls: 0 };
  server.use(
    http.get(TOKEN_URL, () => {
      const token = values[Math.min(state.calls, values.length - 1)];
      state.calls += 1;
      return HttpResponse.json({ token, expiresAt: '2099-01-01T00:00:00.000Z' });
    }),
  );
  return state;
}

function renderImage(attachmentId = 'att-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (
    <QueryClientProvider client={queryClient}>
      <AttachmentImage boardId={BOARD_ID} attachmentId={attachmentId} className="h-12 w-16" />
    </QueryClientProvider>
  );
  return { queryClient, ...render(ui) };
}

const image = () => document.querySelector('img');

describe('AttachmentImage', () => {
  it('shows a placeholder until the file key has arrived, then the picture', async () => {
    tokens('key-1');
    renderImage();

    expect(screen.getByTestId('image-placeholder')).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(image()).toHaveAttribute('src', '/api/v1/files/att-1?token=key-1'));
    expect(image()).toHaveAttribute('alt', '');
    expect(image()).toHaveAttribute('loading', 'lazy');
    expect(image()).toHaveAttribute('draggable', 'false');
  });

  it('keeps its src when the file key is refreshed', async () => {
    tokens('key-1', 'key-2');
    const { queryClient } = renderImage();
    await waitFor(() => expect(image()).toBeInTheDocument());

    await queryClient.refetchQueries({ queryKey: fileTokenKeys.token(BOARD_ID) });

    await waitFor(() =>
      expect(queryClient.getQueryData(fileTokenKeys.token(BOARD_ID))).toMatchObject({ token: 'key-2' }),
    );
    expect(image()).toHaveAttribute('src', '/api/v1/files/att-1?token=key-1');
  });

  it('keeps the first src when the image mounts again', async () => {
    tokens('key-1', 'key-2');
    const first = renderImage('att-9');
    await waitFor(() => expect(image()).toBeInTheDocument());
    await first.queryClient.refetchQueries({ queryKey: fileTokenKeys.token(BOARD_ID) });
    first.unmount();

    renderImage('att-9');

    await waitFor(() => expect(image()).toHaveAttribute('src', '/api/v1/files/att-9?token=key-1'));
  });

  it('fetches the key once more after an error and tries the new URL', async () => {
    const calls = tokens('old', 'fresh');
    renderImage();
    await waitFor(() => expect(image()).toHaveAttribute('src', '/api/v1/files/att-1?token=old'));

    fireEvent.error(image() as HTMLImageElement);

    await waitFor(() => expect(image()).toHaveAttribute('src', '/api/v1/files/att-1?token=fresh'));
    expect(calls.calls).toBe(2);
  });

  it('falls back to the placeholder after a second error, without fetching again', async () => {
    const calls = tokens('old', 'fresh');
    renderImage();
    await waitFor(() => expect(image()).toBeInTheDocument());
    fireEvent.error(image() as HTMLImageElement);
    await waitFor(() => expect(image()).toHaveAttribute('src', '/api/v1/files/att-1?token=fresh'));

    fireEvent.error(image() as HTMLImageElement);

    await waitFor(() => expect(image()).toBeNull());
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument();
    expect(calls.calls).toBe(2);
  });
});
