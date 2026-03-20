import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { TenantRequest } from '../../common/tenant-context.middleware';
import { getTenantId } from '../../common/get-tenant-id';
import { AccountingService } from './accounting.service';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('ledger')
  list(@Req() req: TenantRequest, @Query('type') type?: string) {
    return this.accountingService.listLedger(getTenantId(req), type);
  }

  @Post('cash-in')
  cashIn(
    @Req() req: TenantRequest,
    @Body() body: { amount: number; currency: string; description?: string },
  ) {
    return this.accountingService.createCashEntry({
      tenantId: getTenantId(req),
      amount: body.amount,
      currency: body.currency,
      description: body.description,
    });
  }
}
