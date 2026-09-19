import { Controller, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ProductsService } from './products.service';

class SetActiveDto {
  @IsBoolean() active: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService) {}

  @Get()
  @RequirePermission('products.view')
  list(
    @Query('q') q?: string,
    @Query('sellerId') sellerId?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.svc.list({ q, sellerId, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Patch(':id/active')
  @RequirePermission('products.edit')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.svc.setActive(id, dto.active);
  }
}
