import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SaasService } from './saas.service';

type SubscribeDto = {
  tenantSlug: string;
  planCode: string;
};

type MockPayDto = {
  subscriptionId: string;
};

@Controller()
export class SaasController {
  constructor(private readonly saasService: SaasService) {}

  @Get('saas/plans')
  listPlans() {
    return this.saasService.listPlans();
  }

  @Post('saas/subscribe')
  subscribe(@Body() body: SubscribeDto) {
    return this.saasService.subscribeTenant(body.tenantSlug, body.planCode);
  }

  @Post('saas/payments/mock-pay')
  mockPay(@Body() body: MockPayDto) {
    return this.saasService.mockPay(body.subscriptionId);
  }

  @Get('platform/overview')
  platformOverview() {
    return this.saasService.platformOverview();
  }

  @Get('platform/tenants-summary')
  tenantsSummary() {
    return this.saasService.tenantsSummary();
  }

  @Get('platform/recent-payments')
  recentPayments() {
    return this.saasService.recentPayments();
  }

  @Get('saas/checkout-context')
  checkoutContext(@Query('tenantSlug') tenantSlug: string) {
    return this.saasService.checkoutContext(tenantSlug);
  }
}
