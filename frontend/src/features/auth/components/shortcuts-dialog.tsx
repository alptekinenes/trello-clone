import { Button } from '../../../shared/ui/button';
import { Dialog, useDialogClose } from '../../../shared/ui/dialog';

interface ShortcutGroup {
  title: string;
  items: { keys: string[]; description: string }[];
}

/** Only keys that really work in the app. */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Kart ve liste taşıma',
    items: [
      { keys: ['Boşluk'], description: 'Kartı ya da listeyi tutar; tutarken bırakır' },
      { keys: ['←', '↑', '→', '↓'], description: 'Tutulan öğeyi taşır' },
      { keys: ['Enter'], description: 'Tutulan öğeyi bırakır; kartın üzerindeyken kartı açar' },
      { keys: ['Esc'], description: 'Taşımadan vazgeçer' },
    ],
  },
  {
    title: 'Menüler',
    items: [
      { keys: ['↓'], description: 'Menü düğmesindeyken menüyü açar' },
      { keys: ['↑', '↓'], description: 'Menü öğeleri arasında gezinir' },
      { keys: ['Home', 'End'], description: 'İlk ya da son öğeye gider' },
      { keys: ['Esc'], description: 'Menüyü kapatıp odağı düğmeye verir' },
    ],
  },
  {
    title: 'Pencereler ve alanlar',
    items: [
      { keys: ['Esc'], description: 'Pencereyi kapatır; düzenlemeden vazgeçer' },
      { keys: ['Enter'], description: 'Satır içi düzenlemeyi ve kart eklemeyi kaydeder' },
      { keys: ['Ctrl', 'Enter'], description: 'Kart açıklamasını kaydeder' },
    ],
  },
];

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 flex-wrap gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="min-w-6 rounded-sm bg-surface-sunken px-1.5 py-0.5 text-center font-sans text-xs font-medium text-fg"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutsContent() {
  const close = useDialogClose();
  return (
    <div className="flex flex-col gap-4">
      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} aria-label={group.title}>
          <h3 className="mb-1 text-sm font-semibold text-fg">{group.title}</h3>
          <ul className="flex flex-col gap-1">
            {group.items.map((item) => (
              <li
                key={item.description}
                className="flex items-start justify-between gap-3 text-sm text-fg-muted"
              >
                <span>{item.description}</span>
                <Keys keys={item.keys} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="flex justify-end">
        <Button variant="secondary" onClick={close}>
          Kapat
        </Button>
      </div>
    </div>
  );
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Klavye kısayolları" onClose={onClose}>
      <ShortcutsContent />
    </Dialog>
  );
}
