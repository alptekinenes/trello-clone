import type { BoardDetailDto, CardDetailDto } from '@trello/contracts';
import { Button } from '../../../shared/ui/button';
import { PaperclipIcon } from '../../../shared/ui/icons';
import type { useAttachmentUploads } from '../hooks/use-attachment-uploads';
import { useCommentViewer } from '../hooks/use-comment-viewer';
import { ATTACHMENTS_HEADING_ID } from '../lib/focus-ids';
import { AttachmentItem } from './attachment-item';
import { UploadItem } from './upload-item';

interface CardAttachmentsSectionProps {
  board: BoardDetailDto;
  card: CardDetailDto;
  uploads: ReturnType<typeof useAttachmentUploads>;
  /** Opens the file chooser; null when the card is archived and takes no new files. */
  onAdd: (() => void) | null;
}

/** Files of the card and the uploads on their way. Shows only when there is something to list. */
export function CardAttachmentsSection({ board, card, uploads, onAdd }: CardAttachmentsSectionProps) {
  const viewer = useCommentViewer(board);
  const boardId = board.board.id;
  const hasUploads = uploads.uploads.length > 0;
  if (card.attachments.length === 0 && !hasUploads) return null;

  return (
    <section aria-labelledby={ATTACHMENTS_HEADING_ID} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3
          id={ATTACHMENTS_HEADING_ID}
          tabIndex={-1}
          className="flex items-center gap-2 text-base font-semibold"
        >
          <PaperclipIcon />
          Ekler
        </h3>
        {onAdd && (
          <Button variant="secondary" className="h-8 px-3" onClick={onAdd}>
            Ekle
          </Button>
        )}
      </div>
      {hasUploads && (
        <ul aria-label="Yüklemeler" className="flex flex-col gap-3">
          {uploads.uploads.map((upload) => (
            <UploadItem key={upload.id} upload={upload} onCancel={uploads.cancel} onDismiss={uploads.dismiss} />
          ))}
        </ul>
      )}
      <ul aria-label="Ekler" className="flex flex-col gap-3 empty:hidden">
        {card.attachments.map((attachment) => (
          <AttachmentItem
            key={attachment.id}
            boardId={boardId}
            cardId={card.id}
            attachment={attachment}
            viewer={viewer}
            hasUploads={hasUploads}
            isCover={card.coverAttachmentId === attachment.id}
          />
        ))}
      </ul>
    </section>
  );
}
