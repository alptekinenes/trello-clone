import { hasBoardRole, type BoardRole } from '@trello/contracts';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { boardTitleSchema } from '../../boards';
import { useDeleteBoard, useUpdateBoard } from '../api/use-board';

/** What the current user may do on the board header, and the handlers for it. */
export function useBoardActions(boardId: string, myRole: BoardRole) {
  const navigate = useNavigate();
  const updateBoard = useUpdateBoard(boardId);
  const deleteBoard = useDeleteBoard(boardId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  function rename(title: string) {
    const parsed = boardTitleSchema.safeParse(title);
    if (parsed.success) updateBoard.mutate({ title: parsed.data });
  }

  function confirmDelete() {
    deleteBoard.mutate(undefined, {
      onSuccess: () => navigate('/boards', { replace: true }),
    });
  }

  function cancelDelete() {
    setConfirmingDelete(false);
    deleteBoard.reset();
  }

  return {
    canRename: hasBoardRole(myRole, 'ADMIN'),
    canDelete: myRole === 'OWNER',
    canDeleteLists: hasBoardRole(myRole, 'ADMIN'),
    archiveOpen,
    openArchive: () => setArchiveOpen(true),
    closeArchive: () => setArchiveOpen(false),
    labelsOpen,
    openLabels: () => setLabelsOpen(true),
    closeLabels: () => setLabelsOpen(false),
    membersOpen,
    openMembers: () => setMembersOpen(true),
    closeMembers: () => setMembersOpen(false),
    rename,
    renameError: updateBoard.error ? 'Pano adı kaydedilemedi. Tekrar dene.' : null,
    confirmingDelete,
    askDelete: () => setConfirmingDelete(true),
    cancelDelete,
    confirmDelete,
    isDeleting: deleteBoard.isPending,
    deleteError: deleteBoard.error ? apiErrorMessage(deleteBoard.error) : null,
  };
}
