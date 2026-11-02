import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateInvitationDto } from './create-invitation.dto.js';

function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateInvitationDto, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property).sort() };
}

describe('CreateInvitationDto', () => {
  it('accepts an email and an assignable role', () => {
    expect(check({ email: 'ayse@example.com', role: 'MEMBER' }).invalidFields).toEqual([]);
    expect(check({ email: 'ayse@example.com', role: 'ADMIN' }).invalidFields).toEqual([]);
  });

  it('trims the email', () => {
    const { dto, invalidFields } = check({ email: '  ayse@example.com  ', role: 'MEMBER' });
    expect(invalidFields).toEqual([]);
    expect(dto.email).toBe('ayse@example.com');
  });

  it.each([
    ['not-an-email'],
    [''],
    ['   '],
    [`${'a'.repeat(243)}@example.com`],
  ])('rejects the email %j', (email) => {
    expect(check({ email, role: 'MEMBER' }).invalidFields).toContain('email');
  });

  it('accepts a 254 character email and rejects 255', () => {
    const make = (lastLabel: number) =>
      `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(lastLabel)}.com`;
    expect(make(57)).toHaveLength(254);
    expect(check({ email: make(57), role: 'MEMBER' }).invalidFields).toEqual([]);
    expect(check({ email: make(58), role: 'MEMBER' }).invalidFields).toContain('email');
  });

  it('rejects OWNER, unknown and missing roles', () => {
    expect(check({ email: 'a@example.com', role: 'OWNER' }).invalidFields).toEqual(['role']);
    expect(check({ email: 'a@example.com', role: 'member' }).invalidFields).toEqual(['role']);
    expect(check({ email: 'a@example.com' }).invalidFields).toEqual(['role']);
  });

  it('rejects unknown fields', () => {
    expect(
      check({ email: 'a@example.com', role: 'MEMBER', boardId: 'x' }).invalidFields,
    ).toEqual(['boardId']);
  });

  it('rejects non-string emails', () => {
    expect(check({ email: 5, role: 'MEMBER' }).invalidFields).toEqual(['email']);
  });
});
