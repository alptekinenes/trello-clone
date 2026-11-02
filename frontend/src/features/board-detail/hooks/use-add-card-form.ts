import { zodResolver } from '@hookform/resolvers/zod';
import { type BaseSyntheticEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { apiErrorMessage } from '../../../shared/lib/api-error-message';
import { useCreateCard } from '../api/use-card-mutations';
import { addCardSchema, type AddCardFormValues } from '../schemas/card-schemas';
import { isAddCardFocusTarget, useCardUiStore } from '../store/card-ui-store';

const DEFAULT_VALUES: AddCardFormValues = { title: '' };

/**
 * "Kart ekle" composer at the bottom of a list: opens in place, stays open
 * after adding (for the next card), and returns focus to its button when closed.
 * Enter adds the card; Escape closes.
 */
export function useAddCardForm(boardId: string, listId: string) {
  const [isOpen, setIsOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const createCard = useCreateCard(boardId);
  const form = useForm({ resolver: zodResolver(addCardSchema), defaultValues: DEFAULT_VALUES });
  // Cards are saved one after another, in the order their titles were entered.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const savingCountRef = useRef(0);
  const focusRequested = useCardUiStore((state) => isAddCardFocusTarget(state.focusTarget, listId));
  const clearFocus = useCardUiStore((state) => state.clearFocus);

  // The list's last card was archived: the focus comes here instead of the page.
  useEffect(() => {
    if (!focusRequested) return;
    if (isOpen) form.setFocus('title');
    else openerRef.current?.focus();
    clearFocus();
  }, [focusRequested, clearFocus, isOpen, form]);

  function open() {
    flushSync(() => setIsOpen(true));
    form.setFocus('title');
  }

  function close() {
    form.reset();
    createCard.reset();
    flushSync(() => setIsOpen(false));
    openerRef.current?.focus();
  }

  /**
   * The field empties at once, ready for the next title, and the card joins the
   * save queue. A title that fails comes back into the field if it is still empty.
   */
  function save({ title }: AddCardFormValues) {
    form.reset();
    form.setFocus('title');
    savingCountRef.current += 1;
    queueRef.current = queueRef.current.then(() =>
      createCard
        .mutateAsync({ listId, title })
        .then(
          () => undefined,
          () => {
            if (!form.getValues('title')) form.setValue('title', title);
          },
        )
        .finally(() => {
          savingCountRef.current -= 1;
        }),
    );
  }

  // Built per submit, so `save` (and its refs) is only touched by the event.
  const onSubmit = (event?: BaseSyntheticEvent) => form.handleSubmit(save)(event);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      // Titles are one line: Enter submits instead of adding a line break.
      event.preventDefault();
      // A held key repeats, and a second press on the emptied field while a card
      // saves is a double press: neither adds a card or shows an error.
      const doublePress = savingCountRef.current > 0 && !form.getValues('title').trim();
      if (!event.repeat && !doublePress) void onSubmit();
    } else if (event.key === 'Escape') {
      close();
    }
  }

  return {
    isOpen,
    open,
    close,
    openerRef,
    form,
    onSubmit,
    onKeyDown,
    isPending: createCard.isPending,
    serverError: createCard.error ? apiErrorMessage(createCard.error) : null,
  };
}
