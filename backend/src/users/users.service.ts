import { Injectable } from '@nestjs/common';
import type { UpdateMeRequest, UserDto } from '@trello/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Public user fields. passwordHash is never selected here. */
const USER_SELECT = { id: true, email: true, name: true, avatarUrl: true } as const;

export interface UserCredentials extends UserDto {
  passwordHash: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<UserDto | null> {
    return this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  /** Only for login: the one place that reads the password hash. */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    return this.prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { ...USER_SELECT, passwordHash: true },
    });
  }

  create(data: { email: string; name: string; passwordHash: string }): Promise<UserDto> {
    return this.prisma.user.create({
      data: { ...data, email: normalizeEmail(data.email) },
      select: USER_SELECT,
    });
  }

  /** Returns null when the user no longer exists. */
  async update(id: string, data: UpdateMeRequest): Promise<UserDto | null> {
    try {
      return await this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return null;
      }
      throw error;
    }
  }
}
