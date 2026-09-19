import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UsersService } from './users.service';
import { UserDetailService } from './user-detail.service';

class SetActiveDto {
  @IsBoolean() active: boolean;
}

class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() workshopName?: string;
  @IsOptional() @IsString() workshopAddress?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private svc: UsersService, private details: UserDetailService) {}

  @Get()
  @RequirePermission('users.view')
  list(
    @Query('role') role?: 'owner' | 'mechanic' | 'seller' | 'admin',
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.svc.list({ role, q, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  /** Everything the platform holds about one account, grouped for the detail page. */
  @Get(':id/full')
  @RequirePermission('users.view')
  full(@Param('id') id: string) {
    return this.details.detail(id);
  }

  @Get(':id')
  @RequirePermission('users.view')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Patch(':id')
  @RequirePermission('users.edit')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('users.block')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.svc.setActive(id, dto.active);
  }
}
