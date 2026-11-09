import { AttachmentImage } from '../../board-detail';

/** The card's image cover on top of the dialog; decorative, the attachments list names the file. */
export function CardCoverImage({ boardId, attachmentId }: { boardId: string; attachmentId: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="card-cover-image"
      className="overflow-hidden rounded-md bg-surface-sunken"
    >
      <AttachmentImage
        boardId={boardId}
        attachmentId={attachmentId}
        className="h-48 w-full object-contain"
      />
    </div>
  );
}
