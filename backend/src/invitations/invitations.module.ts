import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { BoardInvitationsController } from './board-invitations.controller.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

@Module({
  imports: [MailModule],
  controllers: [BoardInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
