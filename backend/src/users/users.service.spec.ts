import { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail, UsersService } from './users.service.js';

const PUBLIC_SELECT = { id: true, email: true, name: true, avatarUrl: true };

function createService() {
  const user = { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const service = new UsersService({ user } as unknown as PrismaService);
  return { service, user };
}

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ayse.Yilmaz@Example.COM ')).toBe('ayse.yilmaz@example.com');
  });
});

describe('UsersService', () => {
  it('findById selects only public fields', async () => {
    const { service, user } = createService();
    await service.findById('user-1');
    expect(user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: PUBLIC_SELECT });
  });

  it('findCredentialsByEmail normalizes the email and includes the hash', async () => {
    const { service, user } = createService();
    await service.findCredentialsByEmail(' Ayse@Example.com');
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { email: 'ayse@example.com' },
      select: { ...PUBLIC_SELECT, passwordHash: true },
    });
  });

  it('create stores a normalized email and returns only public fields', async () => {
    const { service, user } = createService();
    await service.create({ email: 'Ayse@Example.com', name: 'Ayşe', passwordHash: 'hash' });
    expect(user.create).toHaveBeenCalledWith({
      data: { email: 'ayse@example.com', name: 'Ayşe', passwordHash: 'hash' },
      select: PUBLIC_SELECT,
    });
  });

  it('update returns only public fields', async () => {
    const { service, user } = createService();
    await service.update('user-1', { name: 'Yeni Ad' });
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Yeni Ad' },
      select: PUBLIC_SELECT,
    });
  });

  it('update returns null when the user no longer exists', async () => {
    const { service, user } = createService();
    user.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    await expect(service.update('gone', { name: 'Yeni Ad' })).resolves.toBeNull();
  });

  it('update rethrows other errors', async () => {
    const { service, user } = createService();
    user.update.mockRejectedValue(new Error('database unavailable'));
    await expect(service.update('user-1', { name: 'Yeni Ad' })).rejects.toThrow(
      'database unavailable',
    );
  });
});
