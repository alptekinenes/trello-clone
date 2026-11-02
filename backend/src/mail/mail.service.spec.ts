import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService, maskEmail } from './mail.service.js';

const MAIL = {
  to: 'davetli@example.com',
  boardTitle: 'Yol haritası',
  inviterName: 'Ayşe',
  inviteUrl: 'http://localhost:5173/invitations/SECRET-TOKEN',
  expiresAt: new Date('2026-11-09T10:00:00.000Z'),
};

function loggedLines(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
}

describe('MailService', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the recipient, board and link outside production', async () => {
    const service = new MailService(new ConfigService({ NODE_ENV: 'development' }));

    await service.sendInvitation(MAIL);

    const output = loggedLines(logSpy);
    expect(output).toContain(MAIL.to);
    expect(output).toContain(MAIL.boardTitle);
    expect(output).toContain(MAIL.inviteUrl);
  });

  it('logs neither the link nor the full address in production', async () => {
    const service = new MailService(new ConfigService({ NODE_ENV: 'production' }));

    await service.sendInvitation(MAIL);

    const output = loggedLines(logSpy);
    expect(output).not.toContain('SECRET-TOKEN');
    expect(output).not.toContain(MAIL.inviteUrl);
    expect(output).not.toContain(MAIL.to);
    expect(output).toContain('d***@example.com');
  });

  describe('with a board title and inviter name made to forge log lines', () => {
    const FORGED = {
      ...MAIL,
      boardTitle: 'x"\n[Nest] LOG [Auth] admin logged in',
      inviterName: 'y\r\nFAKE ENTRY',
    };

    it('keeps user-chosen text out of the production line entirely', async () => {
      const service = new MailService(new ConfigService({ NODE_ENV: 'production' }));

      await service.sendInvitation(FORGED);

      const output = loggedLines(logSpy);
      expect(output).not.toContain('admin logged in');
      expect(output).not.toContain('FAKE ENTRY');
      expect(output).not.toMatch(/[\r\n]/);
    });

    it('escapes it on one line outside production', async () => {
      const service = new MailService(new ConfigService({ NODE_ENV: 'development' }));

      await service.sendInvitation(FORGED);

      const output = loggedLines(logSpy);
      expect(output).not.toMatch(/[\r\n]/);
      expect(output).toContain('admin logged in');
      expect(output).toContain(MAIL.inviteUrl);
    });
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('ayse@example.com')).toBe('a***@example.com');
  });

  it('hides everything when there is no usable local part', () => {
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('nope')).toBe('***');
  });
});
