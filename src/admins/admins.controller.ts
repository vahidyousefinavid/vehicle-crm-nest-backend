import { Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AdminsService } from './admins.service';

class CreateAdminDto {
  @IsString() phone: string;
  @IsString() name: string;
  @IsString() password: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsBoolean() isSuper?: boolean;
  @IsOptional() @IsString() note?: string;
}

class PromoteDto {
  @IsString() password: string;
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsBoolean() isSuper?: boolean;
}

class UpdateAdminDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class SetPermissionsDto {
  @IsOptional() @IsArray() @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsBoolean() isSuper?: boolean;
  @IsOptional() @IsString() note?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admins')
export class AdminsController {
  constructor(private svc: AdminsService) {}

  @Get('permissions')
  @RequirePermission('admins.view')
  permissions() {
    return this.svc.catalogOfPermissions();
  }

  @Get()
  @RequirePermission('admins.view')
  list() {
    return this.svc.list();
  }

  @Get(':id')
  @RequirePermission('admins.view')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  @RequirePermission('admins.manage')
  create(@Body() dto: CreateAdminDto, @Request() req) {
    return this.svc.create(dto, req.user.id);
  }

  @Post('promote/:userId')
  @RequirePermission('admins.manage')
  promote(@Param('userId') userId: string, @Body() dto: PromoteDto, @Request() req) {
    return this.svc.promote(userId, dto, req.user.id);
  }

  @Patch(':id/permissions')
  @RequirePermission('admins.manage')
  setPermissions(@Param('id') id: string, @Body() dto: SetPermissionsDto, @Request() req) {
    return this.svc.setPermissions(id, dto, req.user);
  }

  @Patch(':id')
  @RequirePermission('admins.manage')
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto, @Request() req) {
    return this.svc.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermission('admins.manage')
  remove(@Param('id') id: string, @Request() req) {
    return this.svc.demote(id, req.user);
  }
}
