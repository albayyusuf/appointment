import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { VerticalType } from '@prisma/client';
import { SaasService } from './saas.service';

type SubscribeDto = {
  tenantSlug: string;
  planCode: string;
};

type MockPayDto = {
  subscriptionId: string;
};
type OnboardTenantDto = {
  companyName: string;
  slug: string;
  vertical: VerticalType;
  defaultCurrency?: string;
  adminFullName: string;
  adminEmail: string;
  planCode: string;
  /** Opsiyonel: satış / kurulum notu (audit kaydına yazılır) */
  notes?: string;
  applicationKind?: 'company' | 'franchise';
};

@Controller()
export class SaasController {
  constructor(private readonly saasService: SaasService) {}

  @Get('saas/plans')
  listPlans() {
    return this.saasService.listPlans();
  }

  /** Anasayfa / ödeme: aktif banka hesapları */
  @Get('saas/bank-accounts')
  listBankAccountsPublic() {
    return this.saasService.listBankAccounts(false);
  }

  /** Kart ile ödeme — Stripe Price ID plan üzerinde tanımlı olmalı */
  @Post('saas/stripe/checkout-session')
  createStripeCheckout(
    @Body() body: { planCode: string; successUrl: string; cancelUrl: string; customerEmail?: string },
  ) {
    return this.saasService.createStripeCheckoutSession(body);
  }

  @Post('saas/subscribe')
  subscribe(@Body() body: SubscribeDto) {
    return this.saasService.subscribeTenant(body.tenantSlug, body.planCode);
  }

  @Post('saas/payments/mock-pay')
  mockPay(@Body() body: MockPayDto) {
    return this.saasService.mockPay(body.subscriptionId);
  }

  @Post('saas/onboard')
  onboard(@Body() body: OnboardTenantDto) {
    return this.saasService.onboardTenant({
      companyName: body.companyName,
      slug: body.slug,
      vertical: body.vertical,
      defaultCurrency: body.defaultCurrency ?? 'TRY',
      adminFullName: body.adminFullName,
      adminEmail: body.adminEmail,
      planCode: body.planCode,
      notes: body.notes,
      applicationKind: body.applicationKind,
    });
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
