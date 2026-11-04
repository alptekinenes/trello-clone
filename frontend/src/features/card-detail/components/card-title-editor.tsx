import { CARD_LIMITS } from '@trello/contracts';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { useUpdateCard } from '../api/use-card-mutations';
import { CARD_TITLE_BUTTON_ID } from '../lib/focus-ids';

interface CardTitleEditorProps {
  boardId: string;
  cardId: string;
  title: string;
}

/** The visible card title (click to rename). */
export function CardTitleEditor({ boardId, cardId, title }: CardTitleEditorProps) {
  const updateCard = useUpdateCard(boardId, cardId);

  return (
    <div className="text-xl font-semibold">
      <InlineEdit
        value={title}
        label="Kart başlığı"
        editHint="Kart başlığını düzenle"
        maxLength={CARD_LIMITS.TITLE_MAX}
        wrap
        buttonId={CARD_TITLE_BUTTON_ID}
        onSave={(next) => updateCard.mutate({ title: next })}
        className="w-full px-2 py-1 text-left hover:bg-surface-hover"
        inputClassName="w-full border border-focus bg-surface px-2 py-1 text-xl font-semibold text-fg"
      />
    </div>
  );
}
