import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateMeDto } from '../../users/dto/update-me.dto.js';
import { LoginDto, RegisterDto } from './auth.dto.js';

type DtoClass<T> = new () => T;

function check<T extends object>(cls: DtoClass<T>, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, invalidFields: errors.map((e) => e.property) };
}

describe('RegisterDto', () => {
  const valid = { email: 'ayse@example.com', password: 'secret-password', name: 'Ayşe' };

  it('accepts a valid body and trims email and name', () => {
    const { dto, invalidFields } = check(RegisterDto, {
      ...valid,
      email: '  ayse@example.com ',
      name: '  Ayşe Yılmaz ',
    });
    expect(invalidFields).toEqual([]);
    expect(dto.email).toBe('ayse@example.com');
    expect(dto.name).toBe('Ayşe Yılmaz');
  });

  it('does not trim the password', () => {
    const { dto } = check(RegisterDto, { ...valid, password: '  spaces-count  ' });
    expect(dto.password).toBe('  spaces-count  ');
  });

  it.each([
    ['email', { email: 'not-an-email' }],
    ['email', { email: `${'a'.repeat(250)}@example.com` }],
    ['password', { password: 'short' }],
    ['password', { password: 'x'.repeat(129) }],
    ['name', { name: '   ' }],
    ['name', { name: 'x'.repeat(101) }],
    ['name', { name: 42 }],
  ])('rejects an invalid %s', (field, override) => {
    expect(check(RegisterDto, { ...valid, ...override }).invalidFields).toContain(field);
  });

  it('rejects unknown fields', () => {
    expect(check(RegisterDto, { ...valid, role: 'ADMIN' }).invalidFields).toContain('role');
  });
});

describe('LoginDto', () => {
  it('accepts any non-empty password (length rules apply at registration)', () => {
    expect(check(LoginDto, { email: 'ayse@example.com', password: 'x' }).invalidFields).toEqual([]);
  });

  it('rejects an empty password', () => {
    expect(check(LoginDto, { email: 'ayse@example.com', password: '' }).invalidFields).toEqual([
      'password',
    ]);
  });
});

describe('UpdateMeDto', () => {
  it('accepts an empty body', () => {
    expect(check(UpdateMeDto, {}).invalidFields).toEqual([]);
  });

  it('rejects a null name', () => {
    expect(check(UpdateMeDto, { name: null }).invalidFields).toEqual(['name']);
  });

  it('accepts null avatarUrl to remove the avatar', () => {
    expect(check(UpdateMeDto, { avatarUrl: null }).invalidFields).toEqual([]);
  });

  it.each(['http://example.com/a.png', 'javascript:alert(1)', 'not a url'])(
    'rejects avatarUrl %s',
    (avatarUrl) => {
      expect(check(UpdateMeDto, { avatarUrl }).invalidFields).toEqual(['avatarUrl']);
    },
  );

  it('accepts an https avatarUrl', () => {
    expect(check(UpdateMeDto, { avatarUrl: 'https://example.com/a.png' }).invalidFields).toEqual(
      [],
    );
  });
});
