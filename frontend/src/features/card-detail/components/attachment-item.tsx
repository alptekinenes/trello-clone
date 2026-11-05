import { type AttachmentDto, isInlineImage, type MemberRef } from '@trello/contracts';
import { formatFileSize } from '../../../shared/lib/file-size';
import { formatShortDateTime } from '../../../shared/lib/date';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { FileIcon } from '../../../shared/ui/icons';
import { AttachmentImage, useFileUrl } from '../../board-detail';
import { useAttachmentActions } from '../hooks/use-attachment-actions';

interface AttachmentItemProps {
  boardId: string;
  cardId: string;
  attachment: AttachmentDto;
  /** The signed-in user as a member of the board; decides whether "Sil" shows. */
  viewer: MemberRef | null;
  hasUploads: boolean;
}

/** "PDF" for "rapor.pdf"; at most 4 letters, empty when the name has no extension. */
function extensionLabel(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1, dot + 5).toLocaleUpperCase('tr-TR');
}

function Thumbnail({ boardId, attachment }: { boardId: string; attachment: AttachmentDto }) {
  const box = 'flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-sunken';
  if (isInlineImage(attachment.mimeType)) {
    return (
      <div className={box}>
        <AttachmentImage boardId={boardId} attachmentId={attachment.id} className="h-12 w-16 object-cover" />
      </div>
    );
  }
  return (
    <div aria-hidden="true" className={`${box} flex-col text-xs font-semibold text-fg-muted`}>
      <FileIcon className="size-5" />
      {extensionLabel(attachment.fileName)}
    </div>
  );
}

/** One file of the card: thumbnail or icon, name (opens or downloads it), details and buttons. */
export function AttachmentItem({ boardId, cardId, attachment, viewer, hasUploads }: AttachmentItemProps) {
  const actions = useAttachmentActions(boardId, cardId, attachment, viewer, hasUploads);
  const fileUrl = useFileUrl(boardId);
  const image = isInlineImage(attachment.mimeType);
  // Images open in a new tab, other files download.
  const openUrl = fileUrl(attachment.id, !image);
  const downloadUrl = fileUrl(attachment.id, true);
  const name = attachment.fileName;

  return (
    <li ref={actions.itemRef} className="flex items-center gap-3 text-sm">
      <Thumbnail boardId={boardId} attachment={attachment} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {openUrl === null ? (
          <span className="truncate font-semibold">{name}</span>
        ) : (
          <a
            href={openUrl}
            {...(image ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="truncate font-semibold underline-offset-2 hover:underline"
          >
            {name}
          </a>
        )}
        <p className="text-xs text-fg-muted">
          {formatFileSize(attachment.size)} · {formatShortDateTime(attachment.createdAt)} ·{' '}
          {attachment.uploader.name}
        </p>
        <div className="flex flex-wrap gap-1">
          {downloadUrl !== null && (
            <a
              href={downloadUrl}
              aria-label={`İndir: “${name}”`}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs text-fg-muted hover:bg-surface-hover pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:justify-center"
            >
              İndir
            </a>
          )}
          {actions.canDelete && (
            <Button
              variant="ghost"
              aria-label={`“${name}” ekini sil`}
              className="h-8 px-2 text-xs text-fg-muted"
              onClick={actions.askToDelete}
            >
              Sil
            </Button>
          )}
        </div>
      </div>
      {actions.isConfirmingDelete && (
        <ConfirmDialog
          title="Ek silinsin mi?"
          confirmLabel="Sil"
          onConfirm={actions.confirmDelete}
          onCancel={actions.cancelDelete}
        >
          “{name}” kalıcı olarak silinecek.
        </ConfirmDialog>
      )}
    </li>
  );
}
