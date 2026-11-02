import { LABEL_COLORS, LABEL_LIMITS, type LabelDto } from '@trello/contracts';
import { LABEL_COLOR_CLASS, LABEL_COLOR_NAME } from '../../../shared/lib/label-color';
import { Button } from '../../../shared/ui/button';
import { ConfirmDialog } from '../../../shared/ui/confirm-dialog';
import { FormAlert } from '../../../shared/ui/form-alert';
import { PlusIcon } from '../../../shared/ui/icons';
import { LabelChip } from '../../../shared/ui/label-chip';
import { TextField } from '../../../shared/ui/text-field';
import { useLabelForm } from '../hooks/use-label-form';
import { useLabelsManager } from '../hooks/use-labels-manager';
import type { LabelFormOutput } from '../schemas/label-schemas';

/** The label's own name, or its color for a nameless label. */
function labelTitle(label: LabelDto): string {
  return label.name === '' ? `${LABEL_COLOR_NAME[label.color]} etiket` : label.name;
}

interface LabelFormProps {
  label?: LabelDto;
  pending: boolean;
  onSave: (values: LabelFormOutput) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function LabelForm({ label, pending, onSave, onCancel, onDelete }: LabelFormProps) {
  const { form, submit } = useLabelForm(
    { name: label?.name ?? '', color: label?.color ?? LABEL_COLORS[0] },
    onSave,
  );
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-md bg-surface-sunken p-3"
    >
      <TextField
        label="Etiket adı"
        maxLength={LABEL_LIMITS.NAME_MAX}
        error={errors.name?.message}
        {...register('name')}
      />
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-fg">Renk</legend>
        <div className="flex flex-wrap gap-2">
          {LABEL_COLORS.map((color) => (
            <label key={color} className="cursor-pointer">
              <input type="radio" value={color} className="peer sr-only" {...register('color')} />
              <span
                aria-hidden="true"
                className={`block size-8 rounded-md ${LABEL_COLOR_CLASS[color]} peer-checked:ring-2 peer-checked:ring-fg peer-checked:ring-offset-2 peer-checked:ring-offset-surface-sunken peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus`}
              />
              <span className="sr-only">{LABEL_COLOR_NAME[color]}</span>
            </label>
          ))}
        </div>
        {errors.color && <p className="text-sm text-danger">{errors.color.message}</p>}
      </fieldset>
      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending} className="h-8 px-3">
          Kaydet
        </Button>
        <Button variant="ghost" onClick={onCancel} className="h-8 px-3">
          Vazgeç
        </Button>
        {onDelete && (
          <Button variant="danger" onClick={onDelete} className="ml-auto h-8 px-3">
            Sil
          </Button>
        )}
      </div>
    </form>
  );
}

interface LabelsManagerProps {
  boardId: string;
  labels: LabelDto[];
}

/** Lists the board's labels and lets members create, rename, recolor and delete them. */
export function LabelsManager({ boardId, labels }: LabelsManagerProps) {
  const manager = useLabelsManager(boardId);
  const { editing } = manager;

  return (
    <div className="flex flex-col gap-3">
      {manager.saveError && <FormAlert>{manager.saveError}</FormAlert>}
      {labels.length === 0 && editing === null && (
        <p className="text-sm text-fg-muted">Bu panoda henüz etiket yok.</p>
      )}
      <ul aria-label="Pano etiketleri" className="flex flex-col gap-2">
        {labels.map((label) => (
          <li key={label.id}>
            {editing?.kind === 'edit' && editing.labelId === label.id ? (
              <LabelForm
                label={label}
                pending={false}
                onSave={manager.save}
                onCancel={manager.close}
                onDelete={() => manager.askDelete(label)}
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <LabelChip label={label} size="md" />
                </div>
                <Button
                  variant="secondary"
                  className="h-8 px-3"
                  aria-label={`“${labelTitle(label)}” etiketini düzenle`}
                  onClick={() => manager.startEdit(label.id)}
                >
                  Düzenle
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing?.kind === 'new' ? (
        <LabelForm pending={manager.isSaving} onSave={manager.save} onCancel={manager.close} />
      ) : (
        <Button variant="secondary" onClick={manager.startNew} className="self-start">
          <PlusIcon />
          Yeni etiket
        </Button>
      )}
      {manager.deleting && (
        <ConfirmDialog
          title="Etiket silinsin mi?"
          confirmLabel="Etiketi sil"
          onConfirm={manager.confirmDelete}
          onCancel={manager.cancelDelete}
          pending={manager.isDeleting}
          error={manager.deleteError}
        >
          <p>
            <strong className="text-fg">“{labelTitle(manager.deleting)}”</strong> etiketi tüm
            kartlardan kaldırılacak.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
