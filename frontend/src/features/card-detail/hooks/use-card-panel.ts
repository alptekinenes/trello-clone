import { type CardPanel, useCardDetailStore } from '../store/card-detail-store';

export const panelButtonId = (panel: CardPanel) => `card-panel-button-${panel}`;
export const panelId = (panel: CardPanel) => `card-panel-${panel}`;

/**
 * One of the sections that open in place (labels, due date, checklist). Only one is
 * open at a time. Closing hands the focus back to the button in the side column.
 */
export function useCardPanel(panel: CardPanel) {
  const isOpen = useCardDetailStore((state) => state.openPanel === panel);
  const setOpenPanel = useCardDetailStore((state) => state.setOpenPanel);

  function close() {
    setOpenPanel(null);
    document.getElementById(panelButtonId(panel))?.focus();
  }

  return {
    isOpen,
    close,
    toggle: () => (isOpen ? close() : setOpenPanel(panel)),
  };
}
