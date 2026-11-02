import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopyToClipboard } from './use-copy-to-clipboard';

function stubClipboard(writeText?: (text: string) => Promise<void>) {
  vi.stubGlobal('navigator', { clipboard: writeText ? { writeText } : undefined });
}

afterEach(() => vi.unstubAllGlobals());

describe('useCopyToClipboard', () => {
  it('writes the text and reports "copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const { result } = renderHook(() => useCopyToClipboard());

    await expect(result.current.copy('https://example.com/x')).resolves.toBe('copied');

    expect(writeText).toHaveBeenCalledWith('https://example.com/x');
  });

  it('reports "failed" when there is no clipboard (insecure origin)', async () => {
    stubClipboard();
    const { result } = renderHook(() => useCopyToClipboard());

    await expect(result.current.copy('text')).resolves.toBe('failed');
  });

  it('reports "failed" when the write is refused', async () => {
    stubClipboard(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const { result } = renderHook(() => useCopyToClipboard());

    await expect(result.current.copy('text')).resolves.toBe('failed');
  });
});
