import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { PaymentsService } from './payments.service';
import { PaymentStatus } from './payment.entity';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private svc: PaymentsService) {}

  @Get()
  @RequirePermission('payments.view')
  list(
    @Query('status') status?: PaymentStatus,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
  ) {
    return this.svc.list({ status, page: Number(page) || 1, pageSize: Number(pageSize) || 20 });
  }

  @Get('summary')
  @RequirePermission('payments.view')
  summary() {
    return this.svc.summary();
  }
}
