import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ManagementService } from './management.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('management')
export class ManagementController {
  constructor(private svc: ManagementService) {}

  @Get('providers')
  @RequirePermission('providers.view')
  providers(@Query('role') role?: 'mechanic' | 'seller', @Query('q') q?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.svc.providers({ role, q, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Get('services')
  @RequirePermission('services.view')
  services(@Query('q') q?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.svc.services({ q, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Get('activities')
  @RequirePermission('activities.view')
  activities(@Query('kind') kind?: string, @Query('page') page = '1', @Query('pageSize') pageSize = '30') {
    return this.svc.activities({ kind, page: Number(page) || 1, pageSize: Number(pageSize) || 30 });
  }
}
