import type { BoardBackground } from '@trello/contracts';

/** Full class names, so Tailwind can find them in the source. */
export const BOARD_BACKGROUND_CLASS: Record<BoardBackground, string> = {
  blue: 'bg-board-blue',
  green: 'bg-board-green',
  orange: 'bg-board-orange',
  red: 'bg-board-red',
  purple: 'bg-board-purple',
  pink: 'bg-board-pink',
  lime: 'bg-board-lime',
  sky: 'bg-board-sky',
  grey: 'bg-board-grey',
};

export const BOARD_BACKGROUND_NAME: Record<BoardBackground, string> = {
  blue: 'Mavi',
  green: 'Yeşil',
  orange: 'Turuncu',
  red: 'Kırmızı',
  purple: 'Mor',
  pink: 'Pembe',
  lime: 'Açık yeşil',
  sky: 'Gök mavisi',
  grey: 'Gri',
};
