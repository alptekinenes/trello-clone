import { fileUrlPath } from '@trello/contracts';
import { API_BASE_PATH } from '../../../shared/lib/http';
import { useFileToken } from '../api/use-file-token';

/**
 * Builds file URLs on the client from the board's file key. Gives null until the key has
 * arrived. Images are shown inline unless `download`; other files always download.
 */
export function useFileUrl(boardId: string): (attachmentId: string, download?: boolean) => string | null {
  const { data } = useFileToken(boardId);
  const token = data?.token;
  return (attachmentId, download = false) =>
    token === undefined ? null : `${API_BASE_PATH}${fileUrlPath(attachmentId, token, download)}`;
}
