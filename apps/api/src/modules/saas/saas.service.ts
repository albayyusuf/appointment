import { Injectable, NotFoundException } from '@nestjs/common';
import { BillingInterval, PaymentStatus, Prisma, SubscriptionStatus, UserStatus, VerticalType } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

export type CreatePlanInput = {
  code: string;
  name: string;
  description?: string;
  sortOrder?: number;
  badgeLabel?: string | null;
  stripePriceId?: string | null;
  featureLines?: unknown;
  priceAmount: number;
  currency?: string;
  interval: BillingInterval;
  trialDays?: number;
  maxBranches?: number;
  maxStaff?: number;
  maxAppointmentsMo?: number;
  isActive?: boolean;
};

export type UpdatePlanInput = Partial<CreatePlanInput>;

@Injectable()
export class SaasService {
  constructor(private readonly prisma: PrismaService) {}

  listPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceAmount: 'asc' }],
    });
  }

  listPlansAdmin() {
    return this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceAmount: 'asc' }],
    });
  }

  async createPlan(input: CreatePlanInput) {
    return this.prisma.plan.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description,
        sortOrder: input.sortOrder ?? 0,
        badgeLabel: input.badgeLabel,
        stripePriceId: input.stripePriceId,
        featureLines: input.featureLines === undefined ? undefined : (input.featureLines as Prisma.InputJsonValue),
        priceAmount: new Prisma.Decimal(input.priceAmount),
        currency: (input.currency ?? 'TRY').toUpperCase(),
        interval: input.interval,
        trialDays: input.trialDays ?? 14,
        maxBranches: input.maxBranches ?? 1,
        maxStaff: input.maxStaff ?? 5,
        maxAppointmentsMo: input.maxAppointmentsMo ?? 500,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updatePlan(id: string, input: UpdatePlanInput) {
    const data: Prisma.PlanUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.badgeLabel !== undefined) data.badgeLabel = input.badgeLabel;
    if (input.stripePriceId !== undefined) data.stripePriceId = input.stripePriceId;
    if (input.featureLines !== undefined) data.featureLines = input.featureLines as Prisma.InputJsonValue;
    if (input.priceAmount !== undefined) data.priceAmount = new Prisma.Decimal(input.priceAmount);
    if (input.currency !== undefined) data.currency = input.currency.toUpperCase();
    if (input.interval !== undefined) data.interval = input.interval;
    if (input.trialDays !== undefined) data.trialDays = input.trialDays;
    if (input.maxBranches !== undefined) data.maxBranches = input.maxBranches;
    if (input.maxStaff !== undefined) data.maxStaff = input.maxStaff;
    if (input.maxAppointmentsMo !== undefined) data.maxAppointmentsMo = input.maxAppointmentsMo;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.plan.update({ where: { id }, data });
  }

  listBankAccounts(includeInactive: boolean) {
    return this.prisma.platformBankAccount.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createBankAccount(input: {
    label: string;
    bankName: string;
    accountHolder: string;
    iban: string;
    swift?: string | null;
    currency?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return this.prisma.platformBankAccount.create({
      data: {
        label: input.label,
        bankName: input.bankName,
        accountHolder: input.accountHolder,
        iban: input.iban.replace(/\s/g, ''),
        swift: input.swift,
        currency: (input.currency ?? 'TRY').toUpperCase(),
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateBankAccount(
    id: string,
    input: Partial<{
      label: string;
      bankName: string;
      accountHolder: string;
      iban: string;
      swift: string | null;
      currency: string;
      sortOrder: number;
      isActive: boolean;
    }>,
  ) {
    const data: Prisma.PlatformBankAccountUpdateInput = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.bankName !== undefined) data.bankName = input.bankName;
    if (input.accountHolder !== undefined) data.accountHolder = input.accountHolder;
    if (input.iban !== undefined) data.iban = input.iban.replace(/\s/g, '');
    if (input.swift !== undefined) data.swift = input.swift;
    if (input.currency !== undefined) data.currency = input.currency.toUpperCase();
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return this.prisma.platformBankAccount.update({ where: { id }, data });
  }

  /**
   * Stripe Checkout — STRIPE_SECRET_KEY ve plan.stripePriceId gerekir.
   */
  async createStripeCheckoutSession(body: { planCode: string; successUrl: string; cancelUrl: string; customerEmail?: string }) {
    const plan = await this.prisma.plan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException('Plan not found');
    }
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) {
      return {
        ok: false as const,
        configured: false,
        message: 'Stripe not configured (STRIPE_SECRET_KEY). Use bank transfer or mock pay.',
        planCode: plan.code,
      };
    }
    if (!plan.stripePriceId) {
      return {
        ok: false as const,
        configured: true,
        message: 'This plan has no stripePriceId. Set it in platform plan admin.',
        planCode: plan.code,
      };
    }
    try {
      const stripe = new Stripe(secret);
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        success_url: body.successUrl,
        cancel_url: body.cancelUrl,
        customer_email: body.customerEmail,
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      });
      return { ok: true as const, configured: true, url: session.url };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Stripe error';
      return { ok: false as const, configured: true, message: msg };
    }
  }

  async subscribeTenant(tenantSlug: string, planCode: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return this.prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        trialEndsAt: null,
        nextBillingAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      include: { plan: true, tenant: true },
    });
  }

  async onboardTenant(input: {
    companyName: string;
    slug: string;
    vertical: VerticalType;
    defaultCurrency: string;
    adminFullName: string;
    adminEmail: string;
    planCode: string;
    notes?: string;
    applicationKind?: 'company' | 'franchise';
  }) {
    const plan = await this.prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    const trialEndsAt = new Date(Date.now() + plan.trialDays * 24 * 60 * 60 * 1000);
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.companyName,
          slug: input.slug,
          vertical: input.vertical,
          defaultCurrency: input.defaultCurrency.toUpperCase(),
        },
      });
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Head Office',
          code: 'HQ',
          isActive: true,
        },
      });
      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: 'CMP_OWNER',
          name: 'Company Owner',
          description: 'Full tenant access',
        },
      });
      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: input.adminEmail.toLowerCase(),
          fullName: input.adminFullName,
          passwordHash: 'TEMP_SETUP_REQUIRED',
          status: UserStatus.ACTIVE,
          isStaff: false,
        },
      });
      await tx.userRole.create({
        data: {
          tenantId: tenant.id,
          userId: adminUser.id,
          roleId: ownerRole.id,
        },
      });
      const subscription = await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: SubscriptionStatus.TRIAL,
          trialEndsAt,
          nextBillingAt: trialEndsAt,
        },
      });
      const meta = {
        applicationKind: input.applicationKind ?? 'company',
        planCode: input.planCode,
        notes: input.notes?.trim() || undefined,
        adminEmail: input.adminEmail.toLowerCase(),
      };
      await tx.auditLog.create({
        data: {
          tenantId: tenant.id,
          actorUserId: null,
          entityType: 'TENANT',
          entityId: tenant.id,
          action: 'ONBOARD_APPLICATION',
          metadata: meta,
        },
      });
      return { tenant, branch, adminUser, subscription };
    });
  }

  async mockPay(subscriptionId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.payment.create({
      data: {
        subscriptionId,
        amount: subscription.plan.priceAmount,
        currency: subscription.plan.currency,
        status: PaymentStatus.PAID,
        provider: 'mock-gateway',
        providerRef: `MOCK-${Date.now()}`,
        paidAt: new Date(),
      },
    });
  }

  async platformOverview() {
    const [tenants, activeSubscriptions, monthlyRevenue, superAdmins] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.subscription.count({ where: { status: SubscriptionStatus.ACTIVE } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.PAID },
      }),
      this.prisma.platformUser.count({ where: { isSuperAdmin: true } }),
    ]);

    return {
      tenants,
      activeSubscriptions,
      totalPaidAmount: monthlyRevenue._sum.amount ?? 0,
      superAdmins,
    };
  }

  async tenantsSummary() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
        branches: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      vertical: tenant.vertical,
      branches: tenant.branches.length,
      subscriptionStatus: tenant.subscriptions[0]?.status ?? 'NONE',
      planName: tenant.subscriptions[0]?.plan.name ?? '-',
    }));
  }

  recentPayments() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        subscription: {
          include: {
            tenant: true,
            plan: true,
          },
        },
      },
    });
  }

  async checkoutContext(tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const plans = await this.listPlans();
    return {
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, vertical: tenant.vertical },
      currentSubscription: tenant.subscriptions[0] ?? null,
      plans,
    };
  }
}
