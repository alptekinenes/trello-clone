import { useQueryClient } from '@tanstack/react-query';
import { cancelUpload, dismissUpload, startUploads } from '../lib/upload-runner';
import { useAttachmentUploadStore } from '../store/attachment-upload-store';

/** The uploads of one card (running, waiting or failed) and what the user can do with them. */
export function useAttachmentUploads(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const all = useAttachmentUploadStore((state) => state.uploads);

  return {
    uploads: all.filter((upload) => upload.cardId === cardId),
    addFiles: (files: readonly File[]) => startUploads({ queryClient, boardId, cardId, files }),
    cancel: cancelUpload,
    dismiss: dismissUpload,
  };
}
