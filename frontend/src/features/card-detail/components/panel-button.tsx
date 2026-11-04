import type { ReactNode } from 'react';
import { Button } from '../../../shared/ui/button';
import { panelButtonId, panelId, useCardPanel } from '../hooks/use-card-panel';
import type { CardPanel } from '../store/card-detail-store';

interface PanelButtonProps {
  panel: CardPanel;
  icon: ReactNode;
  children: ReactNode;
}

/** Action row button that opens or closes a section of the dialog. */
export function PanelButton({ panel, icon, children }: PanelButtonProps) {
  const { isOpen, toggle } = useCardPanel(panel);

  return (
    <Button
      id={panelButtonId(panel)}
      variant="secondary"
      aria-expanded={isOpen}
      aria-controls={panelId(panel)}
      onClick={toggle}
    >
      {icon}
      {children}
    </Button>
  );
}
