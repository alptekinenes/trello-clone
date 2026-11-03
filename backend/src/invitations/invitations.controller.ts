import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AcceptInvitationResponse, InvitationPreviewDto } from '@trello/contracts';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { AcceptInvitationDto } from './dto/accept-invitation.dto.js';
import { INVITATION_THROTTLE } from './invitations.constants.js';
import { InvitationsService } from './invitations.service.js';

/** Routes addressed by the invitation token; the token itself is the authorization to preview. */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** The preview carries the invited email address, so shared caches must not keep it. */
  @Public()
  @Throttle(INVITATION_THROTTLE)
  @Header('Cache-Control', 'no-store')
  @Get(':token')
  preview(@Param('token') token: string): Promise<InvitationPreviewDto> {
    return this.invitations.preview(token);
  }

  @Throttle(INVITATION_THROTTLE)
  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
    @Body() _body: AcceptInvitationDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<AcceptInvitationResponse> {
    return this.invitations.accept(token, user.id, origin);
  }
}
