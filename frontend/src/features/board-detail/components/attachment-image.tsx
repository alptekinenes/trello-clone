import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fileTokenKeys } from '../api/file-token-keys';
import { useFileUrl } from '../hooks/use-file-url';
import { pinnedImageSrc, unpinImageSrc } from '../lib/pinned-image-src';

interface AttachmentImageProps {
  boardId: string;
  attachmentId: string;
  /** Sizes the picture and its placeholder alike, so nothing shifts when it loads. */
  className?: string;
}

interface LoadState {
  failures: number;
  refreshing: boolean;
}

/**
 * An image attachment, decorative (the name next to it says what it is). The URL is pinned
 * after the first use. When it fails (the key it carries expired) the key is fetched again
 * once and the picture retried; a second failure leaves the placeholder.
 */
export function AttachmentImage({ boardId, attachmentId, className = '' }: AttachmentImageProps) {
  const queryClient = useQueryClient();
  const fileUrl = useFileUrl(boardId);
  const [state, setState] = useState<LoadState>({ failures: 0, refreshing: false });
  const url = fileUrl(attachmentId);

  function onError() {
    unpinImageSrc(attachmentId);
    if (state.failures > 0) {
      setState({ failures: 2, refreshing: false });
      return;
    }
    setState({ failures: 1, refreshing: true });
    void queryClient
      .invalidateQueries({ queryKey: fileTokenKeys.token(boardId) })
      .finally(() => setState((current) => ({ ...current, refreshing: false })));
  }

  if (url === null || state.refreshing || state.failures > 1) {
    return <span aria-hidden="true" data-testid="image-placeholder" className={`block bg-surface-sunken ${className}`} />;
  }
  return (
    <img
      src={pinnedImageSrc(attachmentId, url)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={onError}
      className={className}
    />
  );
}
