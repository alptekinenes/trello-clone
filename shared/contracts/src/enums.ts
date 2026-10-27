export const BoardRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const;
export type BoardRole = (typeof BoardRole)[keyof typeof BoardRole];

export const InvitationStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REVOKED: 'REVOKED',
} as const;
export type InvitationStatus = (typeof InvitationStatus)[keyof typeof InvitationStatus];

export const LabelColor = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  ORANGE: 'ORANGE',
  RED: 'RED',
  PURPLE: 'PURPLE',
  BLUE: 'BLUE',
  SKY: 'SKY',
  LIME: 'LIME',
  PINK: 'PINK',
  BLACK: 'BLACK',
} as const;
export type LabelColor = (typeof LabelColor)[keyof typeof LabelColor];

export const BOARD_BACKGROUNDS = [
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'pink',
  'lime',
  'sky',
  'grey',
] as const;
export type BoardBackground = (typeof BOARD_BACKGROUNDS)[number];
