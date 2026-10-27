import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useCreateList } from '../api/use-list-mutations';
import { addListSchema, type AddListFormValues } from '../schemas/list-schemas';

const DEFAULT_VALUES: AddListFormValues = { title: '' };

/**
 * "Liste ekle" composer: opens in place, stays open after adding (for the next
 * list), and returns focus to its button when closed.
 */
export function useAddListForm(boardId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const createList = useCreateList(boardId);
  const form = useForm({ resolver: zodResolver(addListSchema), defaultValues: DEFAULT_VALUES });

  function open() {
    flushSync(() => setIsOpen(true));
    form.setFocus('title');
  }

  function close() {
    form.reset();
    createList.reset();
    flushSync(() => setIsOpen(false));
    openerRef.current?.focus();
  }

  const onSubmit = form.handleSubmit(({ title }) =>
    createList.mutate(title, {
      onSuccess: () => {
        form.reset();
        form.setFocus('title');
      },
    }),
  );

  return {
    isOpen,
    open,
    close,
    openerRef,
    form,
    onSubmit,
    isPending: createList.isPending,
    serverError: createList.error ? apiErrorMessage(createList.error) : null,
  };
}
