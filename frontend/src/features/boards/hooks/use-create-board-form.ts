import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useCreateBoard } from '../api/use-boards';
import { createBoardSchema, type CreateBoardFormValues } from '../schemas/board-schemas';

const DEFAULT_VALUES: CreateBoardFormValues = { title: '', background: 'blue' };

/** Create-board form: on success it opens the new board. */
export function useCreateBoardForm() {
  const navigate = useNavigate();
  const createBoard = useCreateBoard();
  const form = useForm({
    resolver: zodResolver(createBoardSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const [title, background] = useWatch({ control: form.control, name: ['title', 'background'] });

  const onSubmit = form.handleSubmit((values) =>
    createBoard.mutate(values, {
      onSuccess: (board) => navigate(`/boards/${board.id}`),
    }),
  );

  return {
    form,
    onSubmit,
    preview: { title: title.trim(), background },
    isPending: createBoard.isPending,
    serverError: createBoard.error ? apiErrorMessage(createBoard.error) : null,
  };
}
