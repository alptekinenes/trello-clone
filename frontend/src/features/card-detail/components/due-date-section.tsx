import type { CardDetailDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { DueBadge } from '../../../shared/ui/due-badge';
import { ClockIcon } from '../../../shared/ui/icons';
import { TextField } from '../../../shared/ui/text-field';
import { useDueComplete, useDueDateForm } from '../hooks/use-due-date-form';
import { panelId, useCardPanel } from '../hooks/use-card-panel';

function DueDateForm({ boardId, card }: { boardId: string; card: CardDetailDto }) {
  const { form, save, remove, cancel, onKeyDown, hasDueDate } = useDueDateForm(boardId, card);
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form
      id={panelId('due-date')}
      noValidate
      onSubmit={save}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3"
    >
      <TextField
        label="Son tarih"
        type="datetime-local"
        error={errors.dueDate?.message}
        {...register('dueDate')}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" className="h-8 px-3">
          Kaydet
        </Button>
        {hasDueDate && (
          <Button variant="secondary" className="h-8 px-3" onClick={remove}>
            Kaldır
          </Button>
        )}
        <Button variant="ghost" className="h-8 px-3" onClick={cancel}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

/** The card's due date with its state, "Tamamlandı", and the form that changes it. */
export function DueDateSection({ boardId, card }: { boardId: string; card: CardDetailDto }) {
  const { isOpen } = useCardPanel('due-date');
  const setComplete = useDueComplete(boardId, card.id);
  if (card.dueDate === null && !isOpen) return null;

  return (
    <section aria-labelledby="card-due-date-title" className="flex flex-col gap-2">
      <h3 id="card-due-date-title" className="flex items-center gap-2 text-base font-semibold">
        <ClockIcon />
        Son tarih
      </h3>
      {card.dueDate !== null && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={card.dueComplete}
              onChange={(event) => setComplete(event.target.checked)}
              className="size-4 accent-primary"
            />
            Tamamlandı
          </label>
          <DueBadge dueDate={card.dueDate} dueComplete={card.dueComplete} />
        </div>
      )}
      {isOpen && <DueDateForm boardId={boardId} card={card} />}
    </section>
  );
}
