import type { CardSummaryDto, ListDto } from '@trello/contracts';
import { useId, type ReactNode } from 'react';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Dialog } from '../../../shared/ui/dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { type CardListInfo, useArchivedCardsPanel } from '../hooks/use-archived-cards-panel';
import { useArchivedListsPanel } from '../hooks/use-archived-lists-panel';

const ROW = 'flex items-center gap-2 py-2';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

function listNote({ title, archived }: CardListInfo): string | null {
  if (!archived) return `“${title}” listesinde`;
  return title
    ? `“${title}” listesi arşivde. Önce listeyi geri yükle.`
    : 'Listesi arşivde. Önce listeyi geri yükle.';
}

interface ArchivedCardRowProps {
  card: CardSummaryDto;
  list: CardListInfo;
  restoring: boolean;
  onRestore: () => void;
  onDelete: () => void;
}

function ArchivedCardRow({ card, list, restoring, onRestore, onDelete }: ArchivedCardRowProps) {
  const noteId = useId();
  return (
    <li className={ROW}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{card.title}</p>
        <p id={noteId} className="text-xs text-fg-muted">
          {listNote(list)}
        </p>
      </div>
      <Button
        variant="secondary"
        className="h-8 px-3"
        loading={restoring}
        disabled={list.archived}
        onClick={onRestore}
        aria-label={`“${card.title}” kartını geri yükle`}
        aria-describedby={list.archived ? noteId : undefined}
      >
        Geri yükle
      </Button>
      <Button
        variant="ghost"
        className="h-8 px-3 text-danger"
        onClick={onDelete}
        aria-label={`“${card.title}” kartını kalıcı olarak sil`}
      >
        Sil
      </Button>
    </li>
  );
}

function ArchivedCards({ boardId, lists }: { boardId: string; lists: ListDto[] }) {
  const panel = useArchivedCardsPanel(boardId, lists);

  if (panel.isLoading) return <p className="text-sm text-fg-muted">Yükleniyor…</p>;
  if (panel.loadError) return <FormAlert>{panel.loadError}</FormAlert>;
  if (!panel.cards?.length) return <p className="text-sm text-fg-muted">Arşivde kart yok.</p>;

  return (
    <>
      {panel.restoreError && <FormAlert>{panel.restoreError}</FormAlert>}
      <ul aria-label="Arşivlenmiş kartlar" className="flex flex-col divide-y divide-line">
        {panel.cards.map((card) => (
          <ArchivedCardRow
            key={card.id}
            card={card}
            list={panel.listOf(card)}
            restoring={panel.isRestoring(card.id)}
            onRestore={() => panel.restore(card.id)}
            onDelete={() => panel.askDelete(card)}
          />
        ))}
      </ul>
      {panel.pendingDelete && (
        <ConfirmDialog
          title="Kart kalıcı olarak silinsin mi?"
          confirmLabel="Kartı sil"
          onConfirm={panel.confirmDelete}
          onCancel={panel.cancelDelete}
          pending={panel.isDeleting}
          error={panel.deleteError}
        >
          <p>
            <strong className="text-fg">{panel.pendingDelete.title}</strong> kartı silinecek. Bu
            işlem geri alınamaz.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

function ArchivedLists({ boardId, canDelete }: { boardId: string; canDelete: boolean }) {
  const panel = useArchivedListsPanel(boardId);

  if (panel.isLoading) return <p className="text-sm text-fg-muted">Yükleniyor…</p>;
  if (panel.loadError) return <FormAlert>{panel.loadError}</FormAlert>;
  if (!panel.lists?.length) return <p className="text-sm text-fg-muted">Arşivde liste yok.</p>;

  return (
    <>
      {panel.restoreError && <FormAlert>{panel.restoreError}</FormAlert>}
      <ul aria-label="Arşivlenmiş listeler" className="flex flex-col divide-y divide-line">
        {panel.lists.map((list) => (
          <li key={list.id} className={ROW}>
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

interface ArchiveDialogProps {
  boardId: string;
  /** Active lists, to say where an archived card belongs. */
  lists: ListDto[];
  /** Permanent list delete is for admins and the owner; any member may delete cards. */
  canDeleteLists: boolean;
  onClose: () => void;
}

export function ArchiveDialog({ boardId, lists, canDeleteLists, onClose }: ArchiveDialogProps) {
  return (
    <Dialog title="Arşiv" onClose={onClose}>
      <div className="flex max-h-96 flex-col gap-6 overflow-y-auto">
        <Section title="Kartlar">
          <ArchivedCards boardId={boardId} lists={lists} />
        </Section>
        <Section title="Listeler">
          <ArchivedLists boardId={boardId} canDelete={canDeleteLists} />
        </Section>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Kapat
        </Button>
      </div>
    </Dialog>
  );
}
