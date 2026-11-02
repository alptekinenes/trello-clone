import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface InvitationMail {
  to: string;
  boardTitle: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date;
}

/** `ayse@example.com` becomes `a***@example.com`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/**
 * MVP: logs instead of sending. A real transport replaces the body, not the signature.
 * Outside production the log carries the invitation link so it can be opened locally;
 * in production neither the link nor the full address is logged.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly isProduction: boolean;

  constructor(config: ConfigService) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  sendInvitation(mail: InvitationMail): Promise<void> {
    if (this.isProduction) {
      // User-chosen text (board title, names) stays out of the line: it could forge log entries.
      this.logger.log(
        `Invitation for ${maskEmail(mail.to)} (link not logged in production, expires ${mail.expiresAt.toISOString()})`,
      );
    } else {
      this.logger.log(
        `Invitation to ${JSON.stringify(mail.boardTitle)} from ${JSON.stringify(mail.inviterName)} for ${mail.to}: ${mail.inviteUrl} (expires ${mail.expiresAt.toISOString()})`,
      );
    }
    return Promise.resolve();
  }
}
