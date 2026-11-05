import { create } from 'zustand';

export type UploadStatus = 'queued' | 'uploading' | 'failed';

export interface UploadItem {
  id: string;
  boardId: string;
  cardId: string;
  fileName: string;
  size: number;
  /** Bytes of the file sent so far. */
  loaded: number;
  status: UploadStatus;
  /** Why it failed; null otherwise. */
  error: string | null;
}

interface UploadState {
  uploads: UploadItem[];
  add: (items: UploadItem[]) => void;
  update: (id: string, changes: Partial<Omit<UploadItem, 'id'>>) => void;
  remove: (id: string) => void;
}

/**
 * Uploads in progress or failed. Kept apart from the dialog: closing it does not stop an
 * upload, and its rows are still there when the dialog opens again.
 */
export const useAttachmentUploadStore = create<UploadState>()((set) => ({
  uploads: [],
  add: (items) => set((state) => ({ uploads: [...state.uploads, ...items] })),
  update: (id, changes) =>
    set((state) => ({
      uploads: state.uploads.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    })),
  remove: (id) => set((state) => ({ uploads: state.uploads.filter((item) => item.id !== id) })),
}));

/** Test helper. */
export function resetAttachmentUploads(): void {
  useAttachmentUploadStore.setState({ uploads: [] });
}
