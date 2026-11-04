import { zodResolver } from '@hookform/resolvers/zod';
import type { BoardBackground } from '@trello/contracts';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useCreateBoard } from '../api/use-boards';
import { createBoardSchema, type CreateBoardFormValues } from '../schemas/board-schemas';

const DEFAULT_VALUES: CreateBoardFormValues = { title: '', background: 'blue' };

/** Create-board form: on success it opens the new board, then calls `onCreated` (for a host that outlives the navigation). */
export function useCreateBoardForm(onCreated?: () => void) {
  const navigate = useNavigate();
  const createBoard = useCreateBoard();
  const form = useForm({
    resolver: zodResolver(createBoardSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const [title, background] = useWatch({ control: form.control, name: ['title', 'background'] });

  const onSubmit = form.handleSubmit((values) =>
    createBoard.mutate(values, {
      onSuccess: (board) => {
        navigate(`/boards/${board.id}`);
        onCreated?.();
      },
    }),
  );

  return {
    form,
    onSubmit,
    preview: { title: title.trim(), background },
    selectBackground: (next: BoardBackground) => form.setValue('background', next),
    isPending: createBoard.isPending,
    serverError: createBoard.error ? apiErrorMessage(createBoard.error) : null,
  };
}
