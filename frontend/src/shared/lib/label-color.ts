import type { LabelColor } from '@trello/contracts';

/** Full class names, so Tailwind can find them in the source. */
export const LABEL_COLOR_CLASS: Record<LabelColor, string> = {
  GREEN: 'bg-label-green',
  YELLOW: 'bg-label-yellow',
  ORANGE: 'bg-label-orange',
  RED: 'bg-label-red',
  PURPLE: 'bg-label-purple',
  BLUE: 'bg-label-blue',
  SKY: 'bg-label-sky',
  LIME: 'bg-label-lime',
  PINK: 'bg-label-pink',
  BLACK: 'bg-label-black',
};

export const LABEL_COLOR_NAME: Record<LabelColor, string> = {
  GREEN: 'Yeşil',
  YELLOW: 'Sarı',
  ORANGE: 'Turuncu',
  RED: 'Kırmızı',
  PURPLE: 'Mor',
  BLUE: 'Mavi',
  SKY: 'Gök mavisi',
  LIME: 'Açık yeşil',
  PINK: 'Pembe',
  BLACK: 'Siyah',
};
