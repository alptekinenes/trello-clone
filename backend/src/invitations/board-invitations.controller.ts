import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  BoardRole as BoardRoleName,
  CreateInvitationResponse,
  InvitationDto,
} from '@trello/contracts';
import { BoardRole, CurrentBoardRole } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateInvitationDto } from './dto/create-invitation.dto.js';
import { INVITATION_THROTTLE } from './invitations.constants.js';
import { InvitationsService } from './invitations.service.js';

@Controller('boards/:boardId/invitations')
export class BoardInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post()
  @BoardRole('ADMIN')
  @Throttle(INVITATION_THROTTLE)
  create(
    @Param('boardId') boardId: string,
    @CurrentUser() user: AuthUser,
    @CurrentBoardRole() role: BoardRoleName,
    @Body() body: CreateInvitationDto,
  ): Promise<CreateInvitationResponse> {
    return this.invitations.create(boardId, { userId: user.id, role }, body);
  }

  @Get()
  @BoardRole('ADMIN')
  list(@Param('boardId') boardId: string): Promise<InvitationDto[]> {
    return this.invitations.listPending(boardId);
  }

  @Delete(':invitationId')
  @BoardRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @Param('boardId') boardId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentBoardRole() role: BoardRoleName,
  ): Promise<void> {
    return this.invitations.revoke(boardId, invitationId, role);
  }
}
