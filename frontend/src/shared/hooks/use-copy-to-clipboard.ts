export type CopyResult = 'copied' | 'failed';

/**
 * Copies text to the clipboard. `navigator.clipboard` is missing on insecure origins and
 * the write can be refused, so the outcome is reported instead of assumed: the caller
 * shows a manual way out on 'failed'.
 */
export function useCopyToClipboard() {
  async function copy(text: string): Promise<CopyResult> {
    try {
      if (!navigator.clipboard) return 'failed';
      await navigator.clipboard.writeText(text);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return { copy };
}
