import { Controller, Get, Delete, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ReviewsService } from './reviews.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private svc: ReviewsService) {}

  @Get()
  @RequirePermission('reviews.view')
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.svc.list({ page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('reviews.delete')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
