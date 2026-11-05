import { Button } from '../../../shared/ui/button';
import { TextArea } from '../../../shared/ui/text-area';
import { useCommentForm } from '../hooks/use-comment-form';
import { COMMENT_COMPOSER_ID } from '../lib/focus-ids';

/** Writes a new comment: plain text, Ctrl+Enter sends. */
export function CommentComposer({ boardId, cardId }: { boardId: string; cardId: string }) {
  const { form, submit, onKeyDown } = useCommentForm(boardId, cardId);
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-2">
      <TextArea
        id={COMMENT_COMPOSER_ID}
        label="Yorum yaz"
        hideLabel
        rows={3}
        placeholder="Yorum yaz…"
        error={errors.body?.message}
        {...register('body')}
        onKeyDown={onKeyDown}
      />
      <Button type="submit" className="h-8 self-start px-3">
        Kaydet
      </Button>
    </form>
  );
}
