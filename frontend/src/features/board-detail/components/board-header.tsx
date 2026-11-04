import { BOARD_LIMITS, type BoardDetailDto } from '@trello/contracts';
import { AvatarStack } from '../../../shared/ui/avatar';
import { Button } from '../../../shared/ui/button';
import { buttonClassName } from '../../../shared/ui/button-styles';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { Dialog } from '../../../shared/ui/dialog';
import { LockIcon, MoreIcon } from '../../../shared/ui/icons';
import { InlineEdit } from '../../../shared/ui/inline-edit';
import { Menu, MenuItem, MenuSeparator } from '../../../shared/ui/menu';
import { RealtimeStatus } from '../../../shared/ui/realtime-status';
import { useBoardActions } from '../hooks/use-board-actions';
import { ArchiveDialog } from './archive-dialog';
import { BoardBackgroundDialog } from './board-background-dialog';
import { LabelsManager } from './labels-manager';
import { MembersDialog } from './members-dialog';

const TITLE = 'px-2 py-1 text-lg font-semibold text-on-board focus-visible:outline-on-board';

export function BoardHeader({ detail }: { detail: BoardDetailDto }) {
  const { board, members } = detail;
  const actions = useBoardActions(board.id, board.myRole);
  const people = members.map((member) => ({ ...member, id: member.userId }));

  return (
    <header className="flex flex-wrap items-center gap-3 bg-board-bar px-4 py-2">
      <h1 className="min-w-0 max-w-full">
        {actions.canRename ? (
          <InlineEdit
            value={board.title}
            label="Pano adı"
            editHint="Pano adını düzenle"
            maxLength={BOARD_LIMITS.TITLE_MAX}
            onSave={actions.rename}
            className={`${TITLE} hover:bg-board-control-hover`}
            inputClassName={`${TITLE} bg-surface text-fg`}
          />
        ) : (
          <span className={`block truncate ${TITLE}`}>{board.title}</span>
        )}
      </h1>

      {actions.renameError && (
        <p role="alert" className="rounded-md bg-danger-subtle px-2 py-1 text-sm text-danger">
          {actions.renameError}
        </p>
      )}

      {/* Next to the title, not in the right-hand group: when it appears the buttons must not shift. */}
      <RealtimeStatus />

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {/* Passive: boards are visible to their members only, so this informs and is not a control. */}
        <span
          title="Özel pano"
          className="inline-flex h-8 items-center px-1 text-on-board pointer-coarse:h-11"
        >
          <LockIcon />
          <span className="sr-only">Özel pano</span>
        </span>
        <AvatarStack people={people} label="Pano üyeleri" />
        <Button variant="on-board" className="h-8 px-3" onClick={actions.openMembers}>
          Paylaş
        </Button>
        <Menu
          label="Pano menüsü"
          align="end"
          triggerClassName={buttonClassName('on-board', 'h-8 px-3')}
          trigger={<MoreIcon />}
        >
          <MenuItem onSelect={actions.openLabels}>Etiketler</MenuItem>
          <MenuItem onSelect={actions.openArchive}>Arşiv</MenuItem>
          {actions.canChangeBackground && (
            <MenuItem onSelect={actions.openBackground}>Arka plan</MenuItem>
          )}
          {actions.canDelete && (
            <>
              <MenuSeparator />
              <MenuItem onSelect={actions.askDelete}>Panoyu sil</MenuItem>
            </>
          )}
        </Menu>
      </div>

      {actions.membersOpen && <MembersDialog detail={detail} onClose={actions.closeMembers} />}

      {actions.labelsOpen && (
        <Dialog title="Etiketler" onClose={actions.closeLabels} showCloseButton>
          <LabelsManager boardId={board.id} labels={detail.labels} />
        </Dialog>
      )}

      {actions.backgroundOpen && actions.canChangeBackground && (
        <BoardBackgroundDialog
          background={board.background}
          onChange={actions.changeBackground}
          onClose={actions.closeBackground}
        />
      )}

      {actions.archiveOpen && (
        <ArchiveDialog
          boardId={board.id}
          lists={detail.lists}
          canDeleteLists={actions.canDeleteLists}
          onClose={actions.closeArchive}
        />
      )}

      {actions.confirmingDelete && (
        <ConfirmDialog
          title="Pano silinsin mi?"
          confirmLabel="Panoyu sil"
          onConfirm={actions.confirmDelete}
          onCancel={actions.cancelDelete}
          pending={actions.isDeleting}
          error={actions.deleteError}
        >
          <p>
            <strong className="text-fg">{board.title}</strong> panosu ve içindeki tüm listeler ile
            kartlar kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
        </ConfirmDialog>
      )}
    </header>
  );
}
