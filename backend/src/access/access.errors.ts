import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ErrorCode } from '@trello/contracts';

/** Also used for boards the user is not a member of, so their existence stays hidden. */
export const boardNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Board not found' });

/** Same for lists on boards the user cannot see. */
export const listNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'List not found' });

/** Same for cards on boards the user cannot see. */
export const cardNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Card not found' });

export const insufficientRole = () =>
  new ForbiddenException({
    code: ErrorCode.FORBIDDEN,
    message: 'Your role on this board does not allow this action',
  });

/** Same for labels on boards the user cannot see. */
export const labelNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Label not found' });

/** Same for checklists on boards the user cannot see. */
export const checklistNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Checklist not found' });

/** Same for checklist items on boards the user cannot see. */
export const checklistItemNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Checklist item not found' });

/** Same for comments on boards the user cannot see. */
export const commentNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Comment not found' });

/** Same for attachments on boards the user cannot see. */
export const attachmentNotFound = () =>
  new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'Attachment not found' });
