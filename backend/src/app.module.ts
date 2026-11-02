import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessModule } from './access/access.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BoardsModule } from './boards/boards.module.js';
import { ChecklistsModule } from './checklists/checklists.module.js';
import { CardsModule } from './cards/cards.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { MembersModule } from './members/members.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { LabelsModule } from './labels/labels.module.js';
import { ListsModule } from './lists/lists.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Default limit for every route; credential routes set a stricter one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AccessModule,
    BoardsModule,
    MembersModule,
    InvitationsModule,
    ListsModule,
    CardsModule,
    LabelsModule,
    ChecklistsModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
  ],
})
export class AppModule {}
