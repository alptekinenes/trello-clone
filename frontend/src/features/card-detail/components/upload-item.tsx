import { Button } from '../../../shared/ui/button';
import { FileIcon } from '../../../shared/ui/icons';
import type { UploadItem as UploadItemData } from '../store/attachment-upload-store';

interface UploadItemProps {
  upload: UploadItemData;
  onCancel: (id: string) => void;
  onDismiss: (id: string) => void;
}

/** A file on its way: progress and "İptal et", or why it failed and "Kapat". */
export function UploadItem({ upload, onCancel, onDismiss }: UploadItemProps) {
  const { id, fileName, size, loaded, status, error } = upload;
  const percent = size > 0 ? Math.min(100, Math.round((loaded / size) * 100)) : 0;
  const failed = status === 'failed';

  return (
    <li className="flex items-center gap-3 text-sm">
      <div
        aria-hidden="true"
        className="flex h-12 w-16 shrink-0 items-center justify-center rounded-sm bg-surface-sunken text-fg-muted"
      >
        <FileIcon className="size-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-semibold">{fileName}</span>
        {failed ? (
          <p className="text-xs text-danger">{error}</p>
        ) : status === 'queued' ? (
          <p className="text-xs text-fg-muted">Sırada bekliyor</p>
        ) : (
          <div className="flex items-center gap-2">
            <progress
              max={size}
              value={loaded}
              aria-label={`“${fileName}” yükleniyor`}
              className="h-2 min-w-0 flex-1 appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-surface-sunken [&::-webkit-progress-value]:bg-primary"
            />
            <span aria-hidden="true" className="w-9 shrink-0 text-right text-xs text-fg-muted">
              {`%${percent}`}
            </span>
          </div>
        )}
      </div>
      {failed ? (
        <Button
          variant="ghost"
          aria-label={`“${fileName}” hatasını kapat`}
          className="h-8 px-2 text-xs"
          onClick={() => onDismiss(id)}
        >
          Kapat
        </Button>
      ) : (
        <Button
          variant="ghost"
          aria-label={`“${fileName}” yüklemesini iptal et`}
          className="h-8 px-2 text-xs"
          onClick={() => onCancel(id)}
        >
          İptal et
        </Button>
      )}
    </li>
  );
}
