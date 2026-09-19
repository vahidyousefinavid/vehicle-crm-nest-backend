import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { VehiclesService } from './vehicles.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private svc: VehiclesService) {}

  @Get()
  @RequirePermission('vehicles.view')
  list(
    @Query('q') q?: string,
    @Query('ownerId') ownerId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.svc.list({ q, ownerId, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Get(':id')
  @RequirePermission('vehicles.view')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }
}
