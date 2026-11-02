import {
  INVITATION_SELECT,
  PREVIEW_SELECT,
  toInvitationDto,
  toInvitationPreview,
} from './invitation.mapper.js';

const EXPIRES_AT = new Date('2026-11-09T10:00:00.000Z');

const ROW = {
  id: 'inv-1',
  boardId: 'board-1',
  email: 'davetli@example.com',
  role: 'MEMBER' as const,
  expiresAt: EXPIRES_AT,
  invitedBy: { id: 'user-1', name: 'Ayşe' },
  board: { title: 'Yol haritası' },
  // Extra columns a careless query could bring along.
  tokenHash: 'deadbeef',
  token: 'raw-token',
};

describe('toInvitationDto', () => {
  it('maps a row and carries neither the token nor its hash', () => {
    const dto = toInvitationDto(ROW);

    expect(dto).toEqual({
      id: 'inv-1',
      boardId: 'board-1',
      email: 'davetli@example.com',
      role: 'MEMBER',
      invitedBy: { userId: 'user-1', name: 'Ayşe' },
      expiresAt: '2026-11-09T10:00:00.000Z',
    });
    expect(JSON.stringify(dto)).not.toContain('deadbeef');
    expect(JSON.stringify(dto)).not.toContain('raw-token');
  });

  it('refuses an OWNER invitation', () => {
    expect(() => toInvitationDto({ ...ROW, role: 'OWNER' })).toThrow();
  });
});

describe('toInvitationPreview', () => {
  it('exposes only what the invited person needs', () => {
    const preview = toInvitationPreview({
      email: 'davetli@example.com',
      role: 'ADMIN',
      status: 'PENDING',
      expiresAt: EXPIRES_AT,
      invitedBy: { name: 'Ayşe' },
      board: { title: 'Yol haritası' },
    });

    expect(preview).toEqual({
      boardTitle: 'Yol haritası',
      inviterName: 'Ayşe',
      email: 'davetli@example.com',
      role: 'ADMIN',
      expiresAt: '2026-11-09T10:00:00.000Z',
    });
  });
});

describe('selects', () => {
  it('never select the token hash', () => {
    expect(Object.keys(INVITATION_SELECT)).not.toContain('tokenHash');
    expect(Object.keys(PREVIEW_SELECT)).not.toContain('tokenHash');
  });
});
