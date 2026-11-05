import type { QueryClient } from '@tanstack/react-query';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMITS,
  type AttachmentCreatedDto,
  type BoardDetailDto,
  type CardDetailDto,
} from '@trello/contracts';
import { boardKeys } from '../../boards';
import { patchCard, refreshUnlessMutating } from '../../board-detail';
import { attachmentsApi } from '../api/attachments-api';
import { cardKeys } from '../api/card-keys';
import { useAttachmentUploadStore, type UploadItem } from '../store/attachment-upload-store';
import { useCardDetailStore } from '../store/card-detail-store';
import { insertAttachment } from './card-detail-cache';
import {
  LIMIT_MESSAGE,
  UPLOAD_CANCELLED_MESSAGE,
  tooLargeMessage,
  unsupportedMessage,
  uploadErrorMessage,
} from './upload-messages';

export interface StartUploadsOptions {
  queryClient: QueryClient;
  boardId: string;
  cardId: string;
  files: readonly File[];
}

interface Job {
  id: string;
  file: File;
  queryClient: QueryClient;
  boardId: string;
}

const ACCEPTED_EXTENSIONS = new Set(ATTACHMENT_ACCEPT.split(','));

/** Waiting files per card; a card uploads one file at a time. */
const queues = new Map<string, Job[]>();
const busyCards = new Set<string>();
const controllers = new Map<string, AbortController>();
let sequence = 0;

const store = () => useAttachmentUploadStore.getState();

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase();
}

/** Tells the user: in the dialog's live region while it is open, as a toast otherwise. */
function notify(cardId: string, message: string): void {
  const details = useCardDetailStore.getState();
  if (details.openCardId === cardId) details.announce(message);
  else details.showError(cardId, message);
}

/** Why the file cannot be uploaded without asking the server, or null. */
function precheckError(file: File): string | null {
  if (file.size > ATTACHMENT_LIMITS.MAX_BYTES) return tooLargeMessage(file.name);
  if (!ACCEPTED_EXTENSIONS.has(extensionOf(file.name))) return unsupportedMessage(file.name);
  return null;
}

function failedItem(base: Omit<UploadItem, 'status' | 'error' | 'loaded'>, error: string): UploadItem {
  return { ...base, loaded: 0, status: 'failed', error };
}

/** Writes the answer into the card dialog's cache and the board's tile. */
function applyUploaded(
  queryClient: QueryClient,
  boardId: string,
  cardId: string,
  { attachment, attachmentCount }: AttachmentCreatedDto,
): void {
  queryClient.setQueryData<CardDetailDto>(
    cardKeys.detail(boardId, cardId),
    (card) => card && insertAttachment(card, attachment, attachmentCount),
  );
  queryClient.setQueryData<BoardDetailDto>(
    boardKeys.detail(boardId),
    (detail) => detail && patchCard(detail, cardId, { attachmentCount }),
  );
  // Not a board mutation (it would hold back other changes' refresh for a whole upload).
  refreshUnlessMutating(queryClient, boardId, boardKeys.detail(boardId));
}

async function run(cardId: string, job: Job): Promise<void> {
  const item = store().uploads.find((upload) => upload.id === job.id);
  if (!item) return;
  const { id, file, queryClient, boardId } = job;
  const controller = new AbortController();
  controllers.set(id, controller);
  store().update(id, { status: 'uploading', loaded: 0 });
  notify(cardId, `“${file.name}” yükleniyor.`);

  try {
    const answer = await attachmentsApi.upload(cardId, file, {
      signal: controller.signal,
      onProgress: (loaded, total) =>
        store().update(id, { loaded: total > 0 ? Math.round((file.size * loaded) / total) : 0 }),
    });
    store().remove(id);
    applyUploaded(queryClient, boardId, cardId, answer);
    notify(cardId, `“${file.name}” eklendi.`);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      store().remove(id);
      notify(cardId, UPLOAD_CANCELLED_MESSAGE);
      // The server may have finished just before the abort, and its echo never reaches us.
      refreshUnlessMutating(queryClient, boardId, boardKeys.detail(boardId));
    } else {
      const message = uploadErrorMessage(error, file.name);
      store().update(id, { status: 'failed', error: message });
      notify(cardId, message);
    }
  } finally {
    controllers.delete(id);
  }
}

async function pump(cardId: string): Promise<void> {
  if (busyCards.has(cardId)) return;
  busyCards.add(cardId);
  try {
    for (let job = queues.get(cardId)?.shift(); job; job = queues.get(cardId)?.shift()) {
      await run(cardId, job);
    }
  } finally {
    busyCards.delete(cardId);
    if (queues.get(cardId)?.length === 0) queues.delete(cardId);
  }
}

/**
 * Checks the files without asking the server (size, type, the card's limit of 20) and
 * uploads the rest one after the other. Rejected files get a failed row with the reason.
 */
export function startUploads({ queryClient, boardId, cardId, files }: StartUploadsOptions): void {
  const card = queryClient.getQueryData<CardDetailDto>(cardKeys.detail(boardId, cardId));
  const taken = store().uploads.filter((u) => u.cardId === cardId && u.status !== 'failed').length;
  let room = ATTACHMENT_LIMITS.MAX_PER_CARD - (card?.attachmentCount ?? 0) - taken;
  const items: UploadItem[] = [];
  const jobs: Job[] = [];

  for (const file of files) {
    sequence += 1;
    const base = { id: `upload-${sequence}`, boardId, cardId, fileName: file.name, size: file.size };
    const problem = precheckError(file) ?? (room <= 0 ? LIMIT_MESSAGE : null);
    if (problem) {
      items.push(failedItem(base, problem));
      continue;
    }
    room -= 1;
    items.push({ ...base, loaded: 0, status: 'queued', error: null });
    jobs.push({ id: base.id, file, queryClient, boardId });
  }
  if (items.length === 0) return;

  store().add(items);
  const firstProblem = items.find((item) => item.status === 'failed');
  if (firstProblem?.error) notify(cardId, firstProblem.error);
  if (jobs.length === 0) return;
  queues.set(cardId, [...(queues.get(cardId) ?? []), ...jobs]);
  void pump(cardId);
}

/** Stops an upload: a running one is aborted, a waiting one never starts. Its row goes away. */
export function cancelUpload(id: string): void {
  const controller = controllers.get(id);
  if (controller) {
    controller.abort();
    return;
  }
  for (const queue of queues.values()) {
    const at = queue.findIndex((job) => job.id === id);
    if (at >= 0) queue.splice(at, 1);
  }
  const item = store().uploads.find((upload) => upload.id === id);
  store().remove(id);
  if (item) notify(item.cardId, UPLOAD_CANCELLED_MESSAGE);
}

/** Removes a failed row. */
export function dismissUpload(id: string): void {
  store().remove(id);
}

/** Test helper: forgets queues and running uploads. */
export function resetUploadRunner(): void {
  queues.clear();
  busyCards.clear();
  controllers.clear();
}
