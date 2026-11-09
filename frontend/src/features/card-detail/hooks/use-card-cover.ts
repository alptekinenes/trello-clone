import type { CardDetailDto, LabelColor } from '@trello/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUpdateCard } from '../api/use-card-mutations';
import { useCardPanel } from './use-card-panel';

/** Quiet time after the last pick before it is saved, so arrowing through colors sends one request. */
export const COVER_SAVE_DELAY_MS = 300;

interface Pick {
  color: LabelColor | null;
}

/** The cover of the open card (a color or an image) and the section that changes it. */
export function useCardCover(boardId: string, card: CardDetailDto) {
  const panel = useCardPanel('cover');
  const { mutate } = useUpdateCard(boardId, card.id);
  // The pick that is not saved yet; the picker shows it at once.
  const [draft, setDraft] = useState<Pick | null>(null);
  const pending = useRef<Pick | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const pick = pending.current;
    if (pick === null) return;
    pending.current = null;
    // "Kapak yok" clears the image cover too; a color replaces it on its own.
    mutate(pick.color === null ? { coverColor: null, coverAttachmentId: null } : { coverColor: pick.color });
    setDraft(null);
  }, [mutate]);

  // Closing the dialog right after a pick must not lose it.
  useEffect(() => flush, [flush]);

  function select(color: LabelColor | null) {
    pending.current = { color };
    setDraft({ color });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, COVER_SAVE_DELAY_MS);
  }

  return {
    panel,
    coverColor: draft === null ? card.coverColor : draft.color,
    /** An image is the cover and the user has not picked anything else. */
    hasImageCover: draft === null && card.coverAttachmentId !== null,
    select,
  };
}
