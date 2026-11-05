import type { CommentDto, MemberRef } from '@trello/contracts';
import { Avatar } from '../../../shared/ui/avatar';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { TextArea } from '../../../shared/ui/text-area';
import { useCommentActions } from '../hooks/use-comment-editor';
import { isPendingComment } from '../lib/feed-cache';
import { feedItemDomId } from '../lib/focus-ids';
import { FeedTime } from './feed-time';

interface CommentItemProps {
  boardId: string;
  cardId: string;
  comment: CommentDto;
  /** The signed-in user as a member of the board; decides which buttons show. */
  viewer: MemberRef | null;
}

/** A comment: author, time and the text, which is plain text and never read as HTML. */
export function CommentItem({ boardId, cardId, comment, viewer }: CommentItemProps) {
  const pending = isPendingComment(comment.id);
  const actions = useCommentActions(boardId, cardId, comment, viewer);
  const {
    register,
    formState: { errors },
  } = actions.form;

  return (
    <li
      ref={actions.itemRef}
      id={feedItemDomId(comment.id)}
      tabIndex={-1}
      aria-busy={pending || undefined}
      className={`flex gap-2 text-sm ${pending ? 'opacity-60' : ''}`}
    >
      <Avatar person={comment.author} size="sm" decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-fg-muted">
          <span className="text-sm font-semibold text-fg">{comment.author.name}</span>
          {pending ? <span>Gönderiliyor…</span> : <FeedTime iso={comment.createdAt} />}
          {comment.editedAt !== null && <span>(düzenlendi)</span>}
        </p>
        {actions.isEditing ? (
          <form noValidate onSubmit={actions.save} className="flex flex-col gap-2">
            <TextArea
              label="Yorumu düzenle"
              hideLabel
              rows={3}
              error={errors.body?.message}
              {...register('body')}
              onKeyDown={actions.onEditKeyDown}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" className="h-8 px-3">
                Kaydet
              </Button>
              <Button variant="ghost" className="h-8 px-3" onClick={actions.stopEditing}>
                Vazgeç
              </Button>
            </div>
          </form>
        ) : (
          <p className="break-words whitespace-pre-wrap">{comment.body}</p>
        )}
        {!pending && !actions.isEditing && (actions.canEdit || actions.canDelete) && (
          <div className="flex gap-1">
            {actions.canEdit && (
              <Button
                ref={actions.editButtonRef}
                variant="ghost"
                aria-label="Yorumu düzenle"
                className="h-8 px-2 text-xs text-fg-muted"
                onClick={actions.startEditing}
              >
                Düzenle
              </Button>
            )}
            {actions.canDelete && (
              <Button
                variant="ghost"
                aria-label="Yorumu sil"
                className="h-8 px-2 text-xs text-fg-muted"
                onClick={actions.askToDelete}
              >
                Sil
              </Button>
            )}
          </div>
        )}
      </div>
      {actions.isConfirmingDelete && (
        <ConfirmDialog
          title="Yorum silinsin mi?"
          confirmLabel="Sil"
          onConfirm={actions.confirmDelete}
          onCancel={actions.cancelDelete}
        >
          Bu yorum kalıcı olarak silinecek.
        </ConfirmDialog>
      )}
    </li>
  );
}
