import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CatalogKind } from './catalog-item.entity';
import { CatalogService } from './catalog.service';

class UpsertCatalogDto {
  @IsOptional() @IsIn(['part', 'product', 'service']) kind?: CatalogKind;
  @IsOptional() @IsString() key?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsNumber() @Min(0) suggestedPrice?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() serviceType?: string;
  @IsOptional() @IsString() customName?: string;
  @IsOptional() @IsBoolean() supportsInShop?: boolean;
  @IsOptional() @IsBoolean() supportsOnSite?: boolean;
  @IsOptional() @IsBoolean() availableNow?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

class SetActiveDto {
  @IsBoolean() active: boolean;
}

class BulkActiveDto {
  @IsArray() @IsString({ each: true }) ids: string[];
  @IsBoolean() active: boolean;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('catalog')
export class CatalogController {
  constructor(private svc: CatalogService) {}

  @Get()
  @RequirePermission('catalog.view')
  list(
    @Query('kind') kind?: CatalogKind,
    @Query('category') category?: string,
    @Query('q') q?: string,
    @Query('active') active?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    return this.svc.list({ kind, category, q, active, page: Number(page) || 1, pageSize: Number(pageSize) || 50 });
  }

  @Get('meta')
  @RequirePermission('catalog.view')
  meta() {
    return this.svc.meta();
  }

  @Get(':id')
  @RequirePermission('catalog.view')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post()
  @RequirePermission('catalog.edit')
  create(@Body() dto: UpsertCatalogDto) {
    return this.svc.create(dto);
  }

  @Patch('bulk-active')
  @RequirePermission('catalog.edit')
  bulkActive(@Body() dto: BulkActiveDto) {
    return this.svc.bulkSetActive(dto.ids, dto.active);
  }

  @Patch(':id')
  @RequirePermission('catalog.edit')
  update(@Param('id') id: string, @Body() dto: UpsertCatalogDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/active')
  @RequirePermission('catalog.edit')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.svc.setActive(id, dto.active);
  }

  @Delete(':id')
  @RequirePermission('catalog.edit')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
