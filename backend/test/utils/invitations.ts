import { INestApplication } from '@nestjs/common';
import type {
  AssignableBoardRole,
  CreateInvitationResponse,
  InvitationDto,
} from '@trello/contracts';
import request from 'supertest';
import type { TestUser } from './users.js';

let counter = 0;

/** An address nobody has registered with. */
export function freshEmail(prefix = 'davetli'): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

/** The raw token at the end of an invite URL. */
export function tokenOf(inviteUrl: string): string {
  return inviteUrl.slice(inviteUrl.lastIndexOf('/') + 1);
}

export interface CreatedInvitation {
  invitation: InvitationDto;
  inviteUrl: string;
  token: string;
}

/** Invites an unregistered address through the API and returns the invitation and its token. */
export async function invite(
  app: INestApplication,
  as: TestUser,
  boardId: string,
  email: string = freshEmail(),
  role: AssignableBoardRole = 'MEMBER',
): Promise<CreatedInvitation> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/boards/${boardId}/invitations`)
    .set('Authorization', as.auth)
    .send({ email, role })
    .expect(201);
  const body = res.body as CreateInvitationResponse;
  if (body.result !== 'INVITATION_CREATED') {
    throw new Error(`Expected an invitation for ${email} but got ${body.result}`);
  }
  return { invitation: body.invitation, inviteUrl: body.inviteUrl, token: tokenOf(body.inviteUrl) };
}
