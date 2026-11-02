import { CARD_LIMITS } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { DescriptionIcon } from '../../../shared/ui/icons';
import { TextArea } from '../../../shared/ui/text-area';
import { useDescriptionEditor } from '../hooks/use-description-editor';

interface CardDescriptionProps {
  boardId: string;
  cardId: string;
  description: string | null;
}

/** Plain-text description: never interpreted as HTML or markdown. */
export function CardDescription({ boardId, cardId, description }: CardDescriptionProps) {
  const { isEditing, openerRef, form, open, close, save, onKeyDown } = useDescriptionEditor(
    boardId,
    cardId,
    description,
  );
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <section aria-labelledby="card-description-title" className="flex flex-col gap-2">
      <h3 id="card-description-title" className="flex items-center gap-2 text-base font-semibold">
        <DescriptionIcon />
        Açıklama
      </h3>
      {isEditing ? (
        <form noValidate onSubmit={save} className="flex flex-col gap-2">
          <TextArea
            label="Açıklama"
            hideLabel
            rows={6}
            placeholder="Daha ayrıntılı bir açıklama ekle…"
            error={errors.description?.message}
            {...register('description')}
            onKeyDown={onKeyDown}
          />
          <p className="text-xs text-fg-muted">
            En fazla {CARD_LIMITS.DESCRIPTION_MAX} karakter. Ctrl+Enter ile kaydedebilirsin.
          </p>
          <div className="flex items-center gap-2">
            <Button type="submit" className="h-8 px-3">
              Kaydet
            </Button>
            <Button variant="ghost" className="h-8 px-3" onClick={close}>
              Vazgeç
            </Button>
          </div>
        </form>
      ) : (
        <>
          {description !== null && (
            <p className="text-sm break-words whitespace-pre-wrap">{description}</p>
          )}
          <Button
            ref={openerRef}
            variant="secondary"
            className="h-8 self-start px-3"
            onClick={open}
          >
            {description === null ? 'Daha ayrıntılı bir açıklama ekle…' : 'Açıklamayı düzenle'}
          </Button>
        </>
      )}
    </section>
  );
}
