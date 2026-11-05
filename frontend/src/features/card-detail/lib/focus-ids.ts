/** Ids of dialog controls that other controls hand the focus to when they go away. */
export const CARD_TITLE_BUTTON_ID = 'card-detail-title-button';
export const CARD_MENU_BUTTON_ID = 'card-detail-menu-button';

/** DOM id of the field that writes a new comment. */
export const COMMENT_COMPOSER_ID = 'card-detail-comment-composer';

/** DOM id of an item of the comments and activity feed. */
export const feedItemDomId = (itemId: string): string => `feed-item-${itemId}`;

/** DOM id of the "Ek" button in the action row. */
export const ATTACHMENT_BUTTON_ID = 'card-detail-attachment-button';

/** DOM id of the heading of the attachments section. */
export const ATTACHMENTS_HEADING_ID = 'card-detail-attachments-heading';
