import { useQuery } from '@tanstack/react-query';
import { FILE_TOKEN_REFRESH_MS, type FileTokenDto } from '@trello/contracts';
import { apiRequest } from '../../../shared/lib/http';
import { fileTokenKeys } from './file-token-keys';

/**
 * The key that lets `<img>` and links read the board's files. It is valid for 5 to 10
 * minutes; it is fetched again every 4 (and on returning to a stale tab).
 */
export function useFileToken(boardId: string) {
  return useQuery({
    queryKey: fileTokenKeys.token(boardId),
    queryFn: () => apiRequest<FileTokenDto>(`/boards/${encodeURIComponent(boardId)}/file-token`),
    staleTime: FILE_TOKEN_REFRESH_MS,
    refetchInterval: FILE_TOKEN_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
}
