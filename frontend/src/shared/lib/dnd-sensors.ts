import { MouseSensor, type MouseSensorOptions, TouchSensor, type TouchSensorOptions } from '@dnd-kit/core';
import type { MouseEvent, TouchEvent } from 'react';

/** Pressing inside these never starts a drag, so text can be selected while editing. */
const NO_DRAG = 'input, textarea, select, [contenteditable="true"], [data-no-dnd]';

export function startsInEditable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(NO_DRAG) !== null;
}

/** dnd-kit's MouseSensor, ignoring presses in text fields. */
export class BoardMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent: event }: MouseEvent, { onActivation }: MouseSensorOptions) => {
        if (event.button !== 0 || startsInEditable(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** dnd-kit's TouchSensor, ignoring touches in text fields and multi-touch. */
export class BoardTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent: event }: TouchEvent, { onActivation }: TouchSensorOptions) => {
        if (event.touches.length > 1 || startsInEditable(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}
