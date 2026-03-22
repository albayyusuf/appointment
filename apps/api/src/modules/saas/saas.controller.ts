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
  /** Firma telefonu (isteğe bağlı) */
  companyPhone?: string;
  adminFullName: string;
  adminEmail: string;
  /** Panel girişi (formda alınır, en az 8 karakter) */
  adminPassword: string;
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

  /** Web: Stripe.js veya durum göstergesi (gizli anahtar dönmez) */
  @Get('saas/stripe/config')
  stripePublicConfig() {
    return {
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      secretKeyConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    };
  }

  /** Anasayfa / ödeme: aktif banka hesapları */
  @Get('saas/bank-accounts')
  listBankAccountsPublic() {
    return this.saasService.listBankAccounts(false);
  }

  /** Kart ile ödeme — Stripe Price ID plan üzerinde tanımlı olmalı; `subscriptionId` başvuru sonrası abonelik id’si */
  @Post('saas/stripe/checkout-session')
  createStripeCheckout(
    @Body()
    body: {
      planCode: string;
      subscriptionId: string;
      successUrl: string;
      cancelUrl: string;
      customerEmail?: string;
    },
  ) {
    return this.saasService.createStripeCheckoutSession(body);
  }

  /** Stripe success URL dönüşü — `session_id` ile tamamlama */
  @Post('saas/stripe/complete-checkout')
  completeStripeCheckout(@Body() body: { sessionId: string }) {
    return this.saasService.completeStripeCheckoutSession(body.sessionId);
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
      companyPhone: body.companyPhone,
      adminFullName: body.adminFullName,
      adminEmail: body.adminEmail,
      adminPassword: body.adminPassword,
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

  /** Kiracı faturalama & ödeme geçmişi (panel; tenantSlug ile) */
  @Get('saas/tenant-billing')
  tenantBilling(@Query('tenantSlug') tenantSlug: string) {
    return this.saasService.tenantBillingDashboard(tenantSlug);
  }

  /** Kiracı operasyon özeti (rol bazlı yönetim paneli) */
  @Get('saas/tenant-overview')
  tenantOverview(@Query('tenantSlug') tenantSlug: string) {
    return this.saasService.tenantOverviewStats(tenantSlug);
  }
}
