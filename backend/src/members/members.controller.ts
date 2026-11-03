import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import type { BoardRole as BoardRoleName, MemberDto } from '@trello/contracts';
import { BoardRole, CurrentBoardRole } from '../access/board-role.decorator.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CurrentEventOrigin, type EventOrigin } from '../realtime/event-origin.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { MembersService } from './members.service.js';

@Controller('boards/:boardId/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @BoardRole('MEMBER')
  list(@Param('boardId') boardId: string): Promise<MemberDto[]> {
    return this.members.list(boardId);
  }

  @Patch(':userId')
  @BoardRole('OWNER')
  updateRole(
    @Param('boardId') boardId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateMemberDto,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<MemberDto> {
    return this.members.updateRole(boardId, userId, body.role, origin);
  }

  /** Every member may call this for themselves (leave); removing others is checked in the service. */
  @Delete(':userId')
  @BoardRole('MEMBER')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('boardId') boardId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthUser,
    @CurrentBoardRole() role: BoardRoleName,
    @CurrentEventOrigin() origin: EventOrigin,
  ): Promise<void> {
    return this.members.remove(boardId, { userId: user.id, role }, userId, origin);
  }
}
