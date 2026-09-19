import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { OrganizationsService } from './organizations.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private svc: OrganizationsService) {}

  @Get()
  @RequirePermission('organizations.view')
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.svc.list({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }
}
