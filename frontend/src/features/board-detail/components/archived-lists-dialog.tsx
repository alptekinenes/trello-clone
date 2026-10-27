import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Dialog } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { useArchivedListsPanel } from '../hooks/use-archived-lists-panel';

interface ArchivedListsDialogProps {
  boardId: string;
  /** Permanent delete is for admins and the owner. */
  canDelete: boolean;
  onClose: () => void;
}

function ArchivedListsBody({ boardId, canDelete }: Omit<ArchivedListsDialogProps, 'onClose'>) {
  const panel = useArchivedListsPanel(boardId);

  if (panel.isLoading) return <p className="text-sm text-fg-muted">Yükleniyor…</p>;
  if (panel.loadError) return <FormAlert>{panel.loadError}</FormAlert>;
  if (!panel.lists?.length) return <p className="text-sm text-fg-muted">Arşivde liste yok.</p>;

  return (
    <>
      {(panel.restoreError ?? null) && <FormAlert>{panel.restoreError}</FormAlert>}
      <ul aria-label="Arşivlenmiş listeler" className="flex flex-col divide-y divide-line">
        {panel.lists.map((list) => (
          <li key={list.id} className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{list.title}</span>
            <Button
              variant="secondary"
              className="h-8 px-3"
              loading={panel.isRestoring(list.id)}
              onClick={() => panel.restore(list.id)}
              aria-label={`“${list.title}” listesini geri yükle`}
            >
              Geri yükle
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                className="h-8 px-3 text-danger"
                onClick={() => panel.askDelete(list)}
                aria-label={`“${list.title}” listesini kalıcı olarak sil`}
              >
                Sil
              </Button>
            )}
          </li>
        ))}
      </ul>
      {panel.pendingDelete && (
        <ConfirmDialog
          title="Liste kalıcı olarak silinsin mi?"
          confirmLabel="Listeyi sil"
          onConfirm={panel.confirmDelete}
          onCancel={panel.cancelDelete}
          pending={panel.isDeleting}
          error={panel.deleteError}
        >
          <p>
            <strong className="text-fg">{panel.pendingDelete.title}</strong> listesi ve içindeki
            tüm kartlar silinecek. Bu işlem geri alınamaz.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

export function ArchivedListsDialog({ boardId, canDelete, onClose }: ArchivedListsDialogProps) {
  return (
    <Dialog title="Arşivlenmiş listeler" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <ArchivedListsBody boardId={boardId} canDelete={canDelete} />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Kapat
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
