import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { UserDto } from '@trello/contracts';
import { invalidAccessToken } from '../auth/auth.errors.js';
import { type AuthUser, CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<UserDto> {
    const user = await this.users.findById(current.id);
    // A valid token for a deleted account is treated as signed out.
    if (!user) throw invalidAccessToken();
    return user;
  }

  @Patch('me')
  async updateMe(@CurrentUser() current: AuthUser, @Body() body: UpdateMeDto): Promise<UserDto> {
    const user = await this.users.update(current.id, body);
    if (!user) throw invalidAccessToken();
    return user;
  }
}
