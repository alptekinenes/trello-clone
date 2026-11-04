import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

interface MenuContextValue {
  /** Closes the menu and gives focus back to the trigger. */
  close: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function useMenuContext(): MenuContextValue {
  const context = useContext(MenuContext);
  if (!context) throw new Error('Menu items must be used inside a Menu');
  return context;
}

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]';

const ITEM_CLASS =
  'flex min-h-9 w-full items-center gap-2 rounded-sm px-3 text-left text-sm text-fg pointer-coarse:min-h-11 hover:bg-surface-hover focus-visible:bg-surface-hover';

interface MenuProps {
  /** Accessible name of both the trigger button and the menu. */
  label: string;
  /** Visible content of the trigger button (icon, avatar, text). */
  trigger: ReactNode;
  triggerClassName?: string;
  /**
   * The trigger's own content (e.g. a visually hidden span) is its accessible name, so visible
   * text such as initials never disagrees with an aria-label.
   */
  triggerNamedByContent?: boolean;
  /** Where the panel sits under the trigger. */
  align?: 'start' | 'end';
  children: ReactNode;
}

/**
 * Popup menu following the WAI-ARIA menu button pattern. Arrow keys, Home and End move
 * between items, Escape closes and returns focus to the trigger, Tab and outside clicks
 * close it. Items are rendered only while the menu is open.
 */
export function Menu({
  label,
  trigger,
  triggerClassName = '',
  triggerNamedByContent = false,
  align = 'start',
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const first =
      menu?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ??
      menu?.querySelector<HTMLElement>(ITEM_SELECTOR);
    first?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function items(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);
  }

  function focusItem(index: number) {
    const list = items();
    if (list.length === 0) return;
    list[(index + list.length) % list.length]?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = items().indexOf(document.activeElement as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(current < 0 ? -1 : current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(-1);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        // Focus moves on from the trigger, so the menu does not leave focus on a removed node.
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerNamedByContent ? undefined : label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <MenuContext value={{ close }}>
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={handleMenuKeyDown}
            className={`absolute top-full z-30 mt-1 min-w-56 rounded-md bg-menu p-1 text-fg shadow-raised ${align === 'end' ? 'right-0' : 'left-0'}`}
          >
            {children}
          </div>
        </MenuContext>
      )}
    </div>
  );
}

interface MenuItemProps {
  onSelect: () => void;
  children: ReactNode;
}

export function MenuItem({ onSelect, children }: MenuItemProps) {
  const { close } = useMenuContext();
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={() => {
        close();
        onSelect();
      }}
      className={ITEM_CLASS}
    >
      {children}
    </button>
  );
}

interface MenuRadioItemProps {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}

export function MenuRadioItem({ checked, onSelect, children }: MenuRadioItemProps) {
  const { close } = useMenuContext();
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      tabIndex={-1}
      onClick={() => {
        close();
        onSelect();
      }}
      className={ITEM_CLASS}
    >
      <span aria-hidden="true" className="w-4 text-center">
        {checked ? '✓' : ''}
      </span>
      {children}
    </button>
  );
}

/** Labelled set of related items (for example the theme choices). */
export function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <fieldset aria-labelledby={headingId} className="m-0 min-w-0 border-0 p-0">
      <div id={headingId} className="px-3 py-1 text-xs font-semibold text-fg-muted">
        {label}
      </div>
      {children}
    </fieldset>
  );
}

export function MenuSeparator() {
  return <hr className="my-1 border-0 border-t border-line" />;
}
